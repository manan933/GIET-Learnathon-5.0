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

	serve({ fetch: app.fetch, port: API_PORT }, (info) => {
		console.log(`HostelGrievance API listening on http://127.0.0.1:${info.port}`);
	});
}

startServer().catch((err) => {
	console.error('Fatal startup error:', err);
	process.exit(1);
});
