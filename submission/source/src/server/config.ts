import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(SERVER_DIR, '../..');

export function getDbPath(): string {
	if (process.env.HOSTEL_DB_PATH) return process.env.HOSTEL_DB_PATH;
	if (process.env.VERCEL) return path.join('/tmp', 'hostel.db');
	return path.join(REPO_ROOT, 'data', 'hostel.db');
}

export function getUploadsDir(): string {
	if (process.env.HOSTEL_UPLOADS_DIR) return process.env.HOSTEL_UPLOADS_DIR;
	if (process.env.VERCEL) return path.join('/tmp', 'uploads');
	return path.join(REPO_ROOT, 'uploads');
}

export const DEFAULT_DB_PATH = getDbPath();

export const DEFAULT_UPLOADS_DIR = getUploadsDir();

export const API_PORT = Number(process.env.HOSTEL_API_PORT ?? 3001);

export const SESSION_COOKIE = 'hg_session';

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp'
]);
