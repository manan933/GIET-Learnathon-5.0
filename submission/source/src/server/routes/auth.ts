import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import {
	createSession,
	clearSessionCookie,
	destroySession,
	optionalToken,
	requireUser,
	setSessionCookie
} from '../auth/session.ts';
import { verifyPassword } from '../auth/passwords.ts';
import { findUserByEmail } from '../db/queries.ts';
import { toPublicUser } from '../db/map.ts';
import { HttpError } from '../http/errors.ts';
import { checkRateLimit, resetRateLimit } from '../security/rate-limit.ts';
import { logSecurityEvent } from '../security/audit.ts';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', async (c) => {
	const db = c.get('db');
	const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? '127.0.0.1';

	// Rate limiting: max 10 login attempts per 60 seconds per IP
	const limit = checkRateLimit('login', clientIp, 10, 60_000);
	if (!limit.allowed) {
		logSecurityEvent({
			type: 'rate_limit_exceeded',
			ip: clientIp,
			resource: '/api/login',
			detail: 'Too many login attempts'
		});
		throw new HttpError(429, 'bad_request', 'Too many login attempts. Please try again later.');
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}
	if (!body || typeof body !== 'object') {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}

	const email = 'email' in body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
	const password = 'password' in body && typeof body.password === 'string' ? body.password : '';

	if (!email || !password) {
		throw new HttpError(400, 'bad_request', 'Email and password are required.');
	}

	if (email.length > 255 || password.length > 1024) {
		throw new HttpError(400, 'bad_request', 'Invalid email or password length.');
	}

	const user = findUserByEmail(db, email);
	if (!user || !verifyPassword(password, user.password_hash)) {
		logSecurityEvent({
			type: 'auth_failure',
			ip: clientIp,
			resource: '/api/login',
			detail: `Failed login attempt for email: ${email}`
		});
		throw new HttpError(401, 'unauthenticated', 'Invalid email or password.');
	}

	// Successful login: reset rate limiter for this IP
	resetRateLimit('login', clientIp);

	const token = createSession(db, user.id);
	setSessionCookie(c, token);

	logSecurityEvent({
		type: 'auth_success',
		userId: user.id,
		userRole: user.role,
		ip: clientIp,
		resource: '/api/login'
	});

	return c.json({ user: toPublicUser(user) });
});

authRoutes.post('/logout', (c) => {
	const db = c.get('db');
	const token = optionalToken(c);
	if (token) {
		destroySession(db, token);
	}
	clearSessionCookie(c);
	logSecurityEvent({
		type: 'logout',
		resource: '/api/logout'
	});
	return c.json({ ok: true });
});

authRoutes.get('/me', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	return c.json({ user: toPublicUser(user) });
});
