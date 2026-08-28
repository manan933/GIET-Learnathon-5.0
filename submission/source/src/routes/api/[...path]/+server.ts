import { createApp } from '../../../server/app.ts';
import { getDbPath, getUploadsDir } from '../../../server/config.ts';
import { openDatabase } from '../../../server/db/connection.ts';
import { userCount } from '../../../server/db/queries.ts';
import { seedDatabase } from '../../../server/db/seed.ts';
import { ensureUploadsDir } from '../../../server/storage/attachments.ts';
import type { RequestHandler } from './$types';

let appInstance: ReturnType<typeof createApp> | null = null;

function getApp() {
	if (!appInstance) {
		const dbPath = getDbPath();
		const uploadsDir = getUploadsDir();
		ensureUploadsDir(uploadsDir);
		const db = openDatabase(dbPath);
		if (userCount(db) === 0) {
			seedDatabase(db, uploadsDir);
		}
		appInstance = createApp({ db, uploadsDir });
	}
	return appInstance;
}

export const fallback: RequestHandler = ({ request }) => {
	const app = getApp();
	return app.fetch(request);
};
