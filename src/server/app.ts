import { Hono } from 'hono';
import type { Database } from 'better-sqlite3';
import type { AppEnv } from './env.ts';
import { handleError, HttpError } from './http/errors.ts';
import { authRoutes } from './routes/auth.ts';
import { grievanceRoutes } from './routes/grievances.ts';
import { attachmentRoutes } from './routes/attachments.ts';
import { cors } from 'hono/cors';

export type CreateAppOptions = {
	db: Database;
	uploadsDir: string;
};

const ALLOWED_ORIGINS = new Set([
	'http://localhost:5173',
	'http://127.0.0.1:5173',
	'http://localhost:5174',
	'http://127.0.0.1:5174',
	'http://localhost:3000',
	'http://127.0.0.1:3000',
	'http://localhost:4173',
	'http://127.0.0.1:4173'
]);

function isAllowedOrigin(origin: string): boolean {
	if (ALLOWED_ORIGINS.has(origin)) return true;
	try {
		const parsed = new URL(origin);
		if (
			parsed.hostname.endsWith('.vercel.app') ||
			parsed.hostname.endsWith('.onrender.com') ||
			parsed.hostname.endsWith('.render.com') ||
			parsed.hostname === 'localhost' ||
			parsed.hostname === '127.0.0.1'
		) {
			return true;
		}
	} catch {
		return false;
	}
	return false;
}

export function createApp(options: CreateAppOptions) {
	const app = new Hono<AppEnv>();

	// Inject DB and storage context
	app.use('*', async (c, next) => {
		c.set('db', options.db);
		c.set('uploadsDir', options.uploadsDir);
		await next();
	});

	// Global HTTP Security Headers
	app.use('*', async (c, next) => {
		await next();
		c.header('X-Content-Type-Options', 'nosniff');
		c.header('X-Frame-Options', 'DENY');
		c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
	});

	// Restricted CORS policy: allows local origins and verified deployment domains (vercel.app, onrender.com)
	app.use(
		'/api/*',
		cors({
			origin: (origin) => {
				if (!origin || isAllowedOrigin(origin)) {
					return origin ?? 'http://localhost:5173';
				}
				return null;
			},
			credentials: true,
			allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
			allowHeaders: ['Content-Type', 'Cookie', 'X-Requested-With']
		})
	);

	app.onError((err, c) => handleError(err, c));

	app.notFound((c) => c.json({ error: 'Not found.', code: 'not_found' }, 404));

	app.get('/api/health', (c) => c.json({ ok: true }));
	app.route('/api', authRoutes);
	app.route('/api/grievances', grievanceRoutes);
	app.route('/api/attachments', attachmentRoutes);

	app.all('/api/*', () => {
		throw new HttpError(404, 'not_found', 'Not found.');
	});

	return app;
}
