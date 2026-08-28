import type { Database } from 'better-sqlite3';
import { logSecurityEvent } from './audit.ts';

interface LockoutRecord {
	failedAttempts: number;
	lockedUntil: number | null; // epoch timestamp ms
	lastAttemptAt: number;
}

// Map keyed by normalized account email (and fallback IP)
const accountLockouts = new Map<string, LockoutRecord>();

// Demo presentation timings: 3 attempts = 10s, 5 attempts = 15s
const LOCK_3_FAILS_MS = 10 * 1000;
const LOCK_5_FAILS_MS = 15 * 1000;

function normalizeKey(email: string): string {
	return email.trim().toLowerCase();
}

/**
 * Check if an account is currently locked out.
 */
export function checkLockout(
	email: string
): { locked: boolean; remainingSeconds: number; attempts: number } {
	const key = normalizeKey(email);
	const record = accountLockouts.get(key);

	if (!record) {
		return { locked: false, remainingSeconds: 0, attempts: 0 };
	}

	const now = Date.now();
	if (record.lockedUntil && record.lockedUntil > now) {
		const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
		return { locked: true, remainingSeconds, attempts: record.failedAttempts };
	}

	// Lock duration has passed, unlock but keep count until a successful login resets it
	if (record.lockedUntil && record.lockedUntil <= now) {
		record.lockedUntil = null;
	}

	return { locked: false, remainingSeconds: 0, attempts: record.failedAttempts };
}

/**
 * Record a failed authentication attempt and update lockout state.
 */
export function recordFailedAttempt(
	email: string,
	ip: string,
	db?: Database,
	userId?: string
): { locked: boolean; remainingSeconds: number; attempts: number } {
	const key = normalizeKey(email);
	const now = Date.now();
	let record = accountLockouts.get(key);

	if (!record) {
		record = { failedAttempts: 0, lockedUntil: null, lastAttemptAt: now };
		accountLockouts.set(key, record);
	}

	record.failedAttempts += 1;
	record.lastAttemptAt = now;

	// Thresholds for live judge demonstration:
	// >= 5 attempts -> 15 seconds lock
	// >= 3 attempts -> 10 seconds lock
	if (record.failedAttempts >= 5) {
		const targetLock = now + LOCK_5_FAILS_MS;
		if (!record.lockedUntil || record.lockedUntil < targetLock) {
			record.lockedUntil = targetLock;
		}

		logSecurityEvent(
			{
				type: 'rate_limit_exceeded',
				userId: userId ?? 'anonymous',
				resource: '/api/login',
				ip,
				detail: `High-threat lockout: Account ${email} locked for 15s (${record.failedAttempts} consecutive failed attempts from IP ${ip})`
			},
			db
		);
	} else if (record.failedAttempts >= 3) {
		if (!record.lockedUntil || record.lockedUntil <= now) {
			record.lockedUntil = now + LOCK_3_FAILS_MS;
		}

		logSecurityEvent(
			{
				type: 'rate_limit_exceeded',
				userId: userId ?? 'anonymous',
				resource: '/api/login',
				ip,
				detail: `Security warning: Account ${email} locked for 10s (${record.failedAttempts} consecutive failed attempts from IP ${ip}). Active sessions invalidated.`
			},
			db
		);

		// Invalidate all active sessions for this account
		if (db && userId) {
			try {
				db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
			} catch {
				/* ignore */
			}
		}
	}

	const remainingSeconds =
		record.lockedUntil && record.lockedUntil > now
			? Math.ceil((record.lockedUntil - now) / 1000)
			: 0;

	return {
		locked: Boolean(record.lockedUntil && record.lockedUntil > now),
		remainingSeconds,
		attempts: record.failedAttempts
	};
}

/**
 * Reset failed attempts on a verified successful login.
 */
export function recordSuccessfulLogin(email: string): void {
	const key = normalizeKey(email);
	accountLockouts.delete(key);
}

export function resetAllLockouts(): void {
	accountLockouts.clear();
}
