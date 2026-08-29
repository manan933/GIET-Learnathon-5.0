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
import { checkLockout, recordFailedAttempt, recordSuccessfulLogin } from '../security/lockout.ts';
import { checkImpossibleTravel } from '../security/geoip.ts';
import { resetUserPassword } from '../auth/recovery.ts';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', async (c) => {
	const db = c.get('db');
	const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? '127.0.0.1';

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

	// 1. Account Lockout Check: If account is locked, strictly block login (even with correct password)
	const lockStatus = checkLockout(email);
	if (lockStatus.locked) {
		throw new HttpError(
			429,
			'bad_request',
			`Account temporarily locked for security (${lockStatus.attempts} failed attempts). Please try again in ${lockStatus.remainingSeconds}s.`
		);
	}

	// 2. IP Rate limiting: max 10 login attempts per 60 seconds per IP
	const limit = checkRateLimit('login', clientIp, 10, 60_000);
	if (!limit.allowed) {
		logSecurityEvent(
			{
				type: 'rate_limit_exceeded',
				ip: clientIp,
				resource: '/api/login',
				detail: 'Too many login attempts from IP'
			},
			db
		);
		throw new HttpError(429, 'bad_request', 'Too many login attempts. Please try again later.');
	}

	const user = findUserByEmail(db, email);
	if (!user) {
		// Log attempt for unregistered / unverified accounts with username and email in detail for warden security logs
		const failResult = recordFailedAttempt(email, clientIp, db);
		const attemptedUsername = email.split('@')[0] || email;

		logSecurityEvent(
			{
				type: 'auth_failure',
				userId: 'unregistered',
				userRole: 'guest',
				ip: clientIp,
				resource: '/api/login',
				detail: `Unregistered account login attempt: Email "${email}" (Username: ${attemptedUsername}) from IP ${clientIp}`
			},
			db
		);

		if (failResult.locked) {
			throw new HttpError(
				429,
				'bad_request',
				`Account locked for security due to ${failResult.attempts} failed attempts. Try again in ${failResult.remainingSeconds}s.`
			);
		}

		const attemptsNote =
			failResult.attempts < 3
				? ` (Attempt ${failResult.attempts} of 3)`
				: ` (Attempt ${failResult.attempts} of 5)`;

		throw new HttpError(401, 'unauthenticated', `Invalid email or password.${attemptsNote}`);
	}

	if (!verifyPassword(password, user.password_hash)) {
		// Record failed attempt (triggers 10s lock at 3 fails, and 15s lock at 5+ fails)
		const failResult = recordFailedAttempt(email, clientIp, db, user.id);

		logSecurityEvent(
			{
				type: 'auth_failure',
				userId: user.id,
				userRole: user.role,
				ip: clientIp,
				resource: '/api/login',
				detail: `Failed login attempt for ${email} (${failResult.attempts} consecutive failures)`
			},
			db
		);

		if (failResult.locked) {
			throw new HttpError(
				429,
				'bad_request',
				`Account locked for security due to ${failResult.attempts} failed attempts. Try again in ${failResult.remainingSeconds}s.`
			);
		}

		const attemptsNote =
			failResult.attempts < 3
				? ` (Attempt ${failResult.attempts} of 3)`
				: ` (Attempt ${failResult.attempts} of 5)`;

		throw new HttpError(401, 'unauthenticated', `Invalid email or password.${attemptsNote}`);
	}

	// Successful login: reset failed counters and rate limiters
	resetRateLimit('login', clientIp);
	recordSuccessfulLogin(email);

	// 3. Anomalous Geo-IP & Impossible Travel Check
	const cfCity = c.req.header('cf-ipcity');
	const cfCountry = c.req.header('cf-ipcountry');
	const travel = checkImpossibleTravel(user.id, clientIp, cfCity, cfCountry);

	if (travel.isAnomalous) {
		logSecurityEvent(
			{
				type: 'rate_limit_exceeded',
				userId: user.id,
				userRole: user.role,
				ip: clientIp,
				resource: '/api/login',
				detail: `CRITICAL SECURITY ALERT: Impossible travel detected for ${user.email} (${travel.speedKmh} km/h from ${travel.prevLocation} to ${travel.currentLocation})`
			},
			db
		);
	}

	const token = createSession(db, user.id);
	setSessionCookie(c, token);

	logSecurityEvent(
		{
			type: 'auth_success',
			userId: user.id,
			userRole: user.role,
			ip: clientIp,
			resource: '/api/login',
			detail: `Signed in successfully from ${travel.currentLocation} (IP: ${clientIp})`
		},
		db
	);

	return c.json({ user: toPublicUser(user) });
});

authRoutes.post('/logout', (c) => {
	const db = c.get('db');
	const token = optionalToken(c);
	if (token) {
		destroySession(db, token);
	}
	clearSessionCookie(c);
	logSecurityEvent(
		{
			type: 'logout',
			resource: '/api/logout',
			detail: 'User signed out'
		},
		db
	);
	return c.json({ ok: true });
});

authRoutes.get('/me', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	return c.json({ user: toPublicUser(user) });
});

// 3-Factor Multi-Secret Password Reset (Supports Students & Wardens)
const handle3FactorReset = async (c: any) => {
	const db = c.get('db');
	const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? '127.0.0.1';

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}
	if (!body || typeof body !== 'object') {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}

	const email = 'email' in body && typeof body.email === 'string' ? body.email : '';
	const pin = 'pin' in body && typeof body.pin === 'string' ? body.pin : '';
	const phrase = 'phrase' in body && typeof body.phrase === 'string' ? body.phrase : '';
	const symbols = 'symbols' in body && typeof body.symbols === 'string' ? body.symbols : '';
	const newPassword = 'newPassword' in body && typeof body.newPassword === 'string' ? body.newPassword : '';

	if (!email || !pin || !phrase || !symbols || !newPassword) {
		throw new HttpError(400, 'bad_request', 'All 3 recovery secrets, email, and new password are required.');
	}

	const result = await resetUserPassword(db, {
		email,
		pin,
		phrase,
		symbols,
		newPassword,
		ip: clientIp
	});

	return c.json({ ok: true, message: result.message });
};

authRoutes.post('/warden/reset-password', handle3FactorReset);
authRoutes.post('/auth/reset-password', handle3FactorReset);
authRoutes.post('/student/reset-password', handle3FactorReset);
