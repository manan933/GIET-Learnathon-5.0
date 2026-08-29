import { createClient, type Client, type InArgs, type InValue } from '@libsql/client';
import type { Database } from 'better-sqlite3';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_SQL } from './schema.ts';
import { TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } from '../config.ts';

let tursoClient: Client | null = null;
let isSyncing = false;
const SYNC_TABLES = ['users', 'sessions', 'grievances', 'comments', 'attachments', 'audit_logs'] as const;

export function getTursoClient(): Client | null {
	if (tursoClient) return tursoClient;
	if (TURSO_DATABASE_URL && TURSO_AUTH_TOKEN) {
		try {
			tursoClient = createClient({
				url: TURSO_DATABASE_URL,
				authToken: TURSO_AUTH_TOKEN
			});
			return tursoClient;
		} catch (err) {
			console.warn('[Turso] Failed to initialize Turso client:', err);
			return null;
		}
	}
	return null;
}

/**
 * Queue a mutating SQL query to be replicated asynchronously to Turso cloud.
 */
export function pushToTurso(sql: string, params: unknown[] = []): void {
	if (isSyncing) return;
	const client = getTursoClient();
	if (!client) return;

	let args: InArgs;
	if (
		params.length === 1 &&
		typeof params[0] === 'object' &&
		params[0] !== null &&
		!Array.isArray(params[0])
	) {
		args = params[0] as Record<string, InValue>;
	} else {
		args = params as InValue[];
	}

	client
		.execute({ sql, args })
		.catch((err) => {
			console.warn('[Turso Sync Error] Failed to replicate query to cloud:', err?.message || err);
		});
}

/**
 * Synchronize cloud Turso database with local SQLite database on server startup.
 */
export async function syncDatabaseWithTurso(db: Database, uploadsDir: string): Promise<boolean> {
	const client = getTursoClient();
	if (!client) {
		console.log('[Turso] No Turso credentials provided; running with local SQLite only.');
		return false;
	}

	console.log('[Turso] Connecting to cloud database at', TURSO_DATABASE_URL);

	try {
		isSyncing = true;

		// 1. Ensure schema exists on Turso
		const statements = SCHEMA_SQL.split(';')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);

		for (const stmt of statements) {
			await client.execute(stmt);
		}

		// 2. Check if Turso has existing data
		const userCountRes = await client.execute('SELECT COUNT(*) AS count FROM users');
		const tursoUserCount = Number(userCountRes.rows[0]?.count ?? 0);

		if (tursoUserCount > 0) {
			console.log(`[Turso] Restoring cloud state (${tursoUserCount} users found in cloud)...`);

			// Clean local tables before restoring cloud data (without triggering cloud replication)
			for (const table of SYNC_TABLES) {
				db.prepare(`DELETE FROM ${table}`).run();
			}

			// Restore each table from Turso cloud to local SQLite
			for (const table of SYNC_TABLES) {
				const res = await client.execute(`SELECT * FROM ${table}`);
				if (res.rows.length === 0) continue;

				for (const row of res.rows) {
					const keys = Object.keys(row);
					const placeholders = keys.map(() => '?').join(', ');
					const values = Object.values(row);
					db.prepare(
						`INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`
					).run(...values);

					// If this is an attachment and file is missing on local disk, restore it from base64
					if (table === 'attachments') {
						const storedFilename = row.stored_filename as string | undefined;
						const dataBase64 = row.data_base64 as string | undefined;
						if (storedFilename && dataBase64) {
							const destPath = join(uploadsDir, storedFilename);
							if (!existsSync(destPath)) {
								try {
									writeFileSync(destPath, Buffer.from(dataBase64, 'base64'));
								} catch (err) {
									console.warn('[Turso] Failed to restore attachment file:', storedFilename, err);
								}
							}
						}
					}
				}
				console.log(`[Turso] Restored ${res.rows.length} rows for table "${table}".`);
			}

			console.log('[Turso] Cloud restoration complete. Data is 100% in sync!');
			isSyncing = false;
			return true;
		} else {
			console.log('[Turso] Cloud database is empty. Pushing initial seed data to cloud...');
			isSyncing = false;
			// Push local data to Turso
			for (const table of SYNC_TABLES) {
				const rows = db.prepare(`SELECT * FROM ${table}`).all();
				for (const row of rows) {
					const keys = Object.keys(row as object);
					const placeholders = keys.map(() => '?').join(', ');
					const values = Object.values(row as object);
					await client.execute({
						sql: `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
						args: values as InValue[]
					});
				}
			}
			console.log('[Turso] Seed data successfully replicated to cloud!');
			return true;
		}
	} catch (err) {
		isSyncing = false;
		console.error('[Turso] Synchronization error during boot:', err);
		return false;
	}
}

/**
 * Hook into db.prepare so all mutating statements automatically push to Turso.
 */
export function enableAutoTursoReplication(db: Database): void {
	const originalPrepare = db.prepare.bind(db) as (source: string) => any;

	(db as any).prepare = function (sql: string) {
		const stmt = originalPrepare(sql);
		const originalRun = stmt.run.bind(stmt);

		stmt.run = function (...args: unknown[]) {
			const result = (originalRun as Function).apply(stmt, args);
			if (!isSyncing && getTursoClient() && /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql)) {
				pushToTurso(sql, args);
			}
			return result;
		};

		return stmt;
	};
}
