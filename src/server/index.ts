import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { API_PORT, DEFAULT_DB_PATH, DEFAULT_UPLOADS_DIR } from './config.ts';
import { openDatabase } from './db/connection.ts';
import { userCount } from './db/queries.ts';
import { seedDatabase } from './db/seed.ts';
import { ensureUploadsDir } from './storage/attachments.ts';
import { enableAutoTursoReplication, syncDatabaseWithTurso } from './db/turso-sync.ts';

const dbPath = DEFAULT_DB_PATH;
const uploadsDir = DEFAULT_UPLOADS_DIR;

ensureUploadsDir(uploadsDir);
const db = openDatabase(dbPath);

// Enable live automatic cloud replication to Turso for all INSERT/UPDATE/DELETE queries
enableAutoTursoReplication(db);

async function startServer() {
	// Sync with Turso cloud on boot (restores all data if container restarted)
	await syncDatabaseWithTurso(db, uploadsDir);

	if (userCount(db) === 0) {
		seedDatabase(db, uploadsDir);
		console.log(`Seeded database at ${dbPath}`);
	}

	const app = createApp({ db, uploadsDir });

	serve({ fetch: app.fetch, port: API_PORT }, async (info) => {
		console.log(`HostelGrievance API listening on http://127.0.0.1:${info.port}`);

		// Initialize keepalive pinging if hosted on Render or specified via env
		const targetUrl =
			process.env.KEEPALIVE_URL ||
			process.env.APP_URL ||
			process.env.RENDER_EXTERNAL_URL;

		if (targetUrl) {
			try {
				const healthEndpoint = `${targetUrl.replace(/\/+$/, '')}/api/health`;
				const { ping } = await import('keepalive-server');
				// Ping every 1 minute (60,000 ms) to keep the Render server continuously active
				ping(60000, healthEndpoint);
				console.log(`[Keepalive] Pinging ${healthEndpoint} every 1 minute to stay active`);
			} catch (err) {
				console.warn('[Keepalive] Could not initialize keepalive ping:', err);
			}
		}
	});
}

startServer().catch((err) => {
	console.error('Fatal startup error:', err);
	process.exit(1);
});
