import type { Database } from 'better-sqlite3';
import { logSecurityEvent } from './audit.ts';

interface LockoutRecord {
	failedAttempts: number;
	lockedUntil: number | null; // epoch timestamp ms
	lastAttemptAt: number;
}

const lockoutMap = new Map<string, LockoutRecord>();

const LOCK_1_MIN_MS = 60 * 1000;
const LOCK_15_MIN_MS = 15 * 60 * 1000;

function keyFor(email: string, ip: string): string {
	return `${email.toLowerCase()}:${ip}`;
}

export function checkLockout(
	email: string,
	ip: string
): { locked: boolean; remainingSeconds: number; attempts: number } {
	const key = keyFor(email, ip);
	const record = lockoutMap.get(key);

	if (!record) {
		return { locked: false, remainingSeconds: 0, attempts: 0 };
	}

	const now = Date.now();
	if (record.lockedUntil && record.lockedUntil > now) {
		const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
		return { locked: true, remainingSeconds, attempts: record.failedAttempts };
	}

	// Lock has expired
	if (record.lockedUntil && record.lockedUntil <= now) {
		record.lockedUntil = null;
	}

	return { locked: false, remainingSeconds: 0, attempts: record.failedAttempts };
}

export function recordFailedAttempt(
	email: string,
	ip: string,
	db?: Database,
	userId?: string
): { locked: boolean; remainingSeconds: number; attempts: number } {
	const key = keyFor(email, ip);
	const now = Date.now();
	let record = lockoutMap.get(key);

	if (!record) {
		record = { failedAttempts: 0, lockedUntil: null, lastAttemptAt: now };
		lockoutMap.set(key, record);
	}

	record.failedAttempts += 1;
	record.lastAttemptAt = now;

	// Progressive lockout thresholds
	if (record.failedAttempts >= 5) {
		record.lockedUntil = now + LOCK_15_MIN_MS;
		logSecurityEvent(
			{
				type: 'rate_limit_exceeded',
				userId: userId ?? 'anonymous',
				resource: '/api/login',
				ip,
				detail: `High-threat brute-force detected: Account ${email} locked for 15 minutes (${record.failedAttempts} consecutive failed attempts from IP ${ip})`
			},
			db
		);
	} else if (record.failedAttempts >= 3) {
		record.lockedUntil = now + LOCK_1_MIN_MS;
		logSecurityEvent(
			{
				type: 'rate_limit_exceeded',
				userId: userId ?? 'anonymous',
				resource: '/api/login',
				ip,
				detail: `Security warning: Account ${email} locked for 1 minute (${record.failedAttempts} consecutive failed attempts from IP ${ip}). Active sessions invalidated.`
			},
			db
		);

		// Feature 4: Invalidate active sessions when failed attempts reach 3+
		if (db && userId) {
			try {
				db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
			} catch {
				/* ignore */
			}
		}
	}

	const remainingSeconds = record.lockedUntil ? Math.ceil((record.lockedUntil - now) / 1000) : 0;
	return {
		locked: Boolean(record.lockedUntil && record.lockedUntil > now),
		remainingSeconds,
		attempts: record.failedAttempts
	};
}

export function recordSuccessfulLogin(email: string, ip: string): void {
	const key = keyFor(email, ip);
	lockoutMap.delete(key);
}

export function resetAllLockouts(): void {
	lockoutMap.clear();
}
