import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(SERVER_DIR, '../..');

export const DEFAULT_DB_PATH =
	process.env.HOSTEL_DB_PATH ?? path.join(REPO_ROOT, 'data', 'hostel.db');

export const DEFAULT_UPLOADS_DIR =
	process.env.HOSTEL_UPLOADS_DIR ?? path.join(REPO_ROOT, 'uploads');

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

export const TURSO_DATABASE_URL =
	process.env.TURSO_DATABASE_URL ??
	process.env.TURSO_URL ??
	'libsql://hostelgrievance-manan933.aws-ap-south-1.turso.io';

export const TURSO_AUTH_TOKEN =
	process.env.TURSO_AUTH_TOKEN ??
	process.env.TURSO_TOKEN ??
	'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODc5NTU2MTksImlkIjoiMDFhMDRhNzQtZjAwMS03ZDdhLWEwZTQtYWMzYzE5ODlkMDU4Iiwia2lkIjoiYTIyWVQ2SHZFYk9FY3JYSnc0YUpWN2s5ZThNQnBqYjZ0NmRQME80TWl6NCIsInJpZCI6ImZiZDJmZmRmLWIxZmEtNGI1Mi1iZjc1LTAwODM4NGVkMzBlNiJ9.GVRcGt2YWCZmHyz5FkI8g8G9a85UzZ2b4liuz74RrvvhAqWhBc7geKqG0pPGUQzNm450pJ-5JKaoXaiAmwFOAQ';
