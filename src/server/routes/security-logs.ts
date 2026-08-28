import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { requireUser } from '../auth/session.ts';

export const securityLogRoutes = new Hono<AppEnv>();

securityLogRoutes.get('/', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);

	const SECURITY_EVENTS = [
		'rate_limit_exceeded',
		'auth_failure',
		'access_denied',
		'upload_rejected',
		'security_exception'
	];

	const placeholders = SECURITY_EVENTS.map(() => '?').join(', ');

	if (user.role === 'warden') {
		const rows = db
			.prepare(
				`SELECT * FROM audit_logs 
         WHERE event IN (${placeholders}) OR detail LIKE '%lock%' OR detail LIKE '%brute%' OR detail LIKE '%travel%' OR detail LIKE '%security%'
         ORDER BY timestamp DESC LIMIT 200`
			)
			.all(...SECURITY_EVENTS);
		return c.json({ data: rows });
	}

	// Student sees security alerts affecting their account
	const rows = db
		.prepare(
			`SELECT * FROM audit_logs 
       WHERE (user_id = ? OR detail LIKE '%' || ? || '%')
         AND (event IN (${placeholders}) OR detail LIKE '%lock%' OR detail LIKE '%brute%' OR detail LIKE '%travel%')
       ORDER BY timestamp DESC LIMIT 100`
		)
		.all(user.id, user.email, ...SECURITY_EVENTS);
	return c.json({ data: rows });
});
