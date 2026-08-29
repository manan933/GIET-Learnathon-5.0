import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { requireUser } from '../auth/session.ts';

export const auditRoutes = new Hono<AppEnv>();

auditRoutes.get('/', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);

	if (user.role === 'warden') {
		const rows = db
			.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200')
			.all();
		return c.json({ data: rows });
	}

	// Students can see their own activity log + events referencing their email/account
	const rows = db
		.prepare(
			`SELECT * FROM audit_logs 
       WHERE user_id = ? OR detail LIKE '%' || ? || '%' 
       ORDER BY timestamp DESC LIMIT 200`
		)
		.all(user.id, user.email);
	return c.json({ data: rows });
});
