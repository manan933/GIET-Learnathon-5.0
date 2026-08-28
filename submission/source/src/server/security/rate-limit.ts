/**
 * In-memory sliding window rate limiter.
 * Protects against brute-force and resource exhaustion attacks.
 */

interface RateLimitRecord {
	count: number;
	resetTime: number;
}

const stores = new Map<string, Map<string, RateLimitRecord>>();

export function checkRateLimit(
	bucketName: string,
	key: string,
	maxAttempts: number,
	windowMs: number
): { allowed: boolean; remaining: number; retryAfterSec: number } {
	let bucket = stores.get(bucketName);
	if (!bucket) {
		bucket = new Map<string, RateLimitRecord>();
		stores.set(bucketName, bucket);
	}

	const now = Date.now();
	const record = bucket.get(key);

	// Periodic cleanup of stale keys
	if (bucket.size > 1000) {
		for (const [k, v] of bucket.entries()) {
			if (v.resetTime <= now) bucket.delete(k);
		}
	}

	if (!record || record.resetTime <= now) {
		bucket.set(key, { count: 1, resetTime: now + windowMs });
		return { allowed: true, remaining: maxAttempts - 1, retryAfterSec: 0 };
	}

	if (record.count >= maxAttempts) {
		const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
		return { allowed: false, remaining: 0, retryAfterSec };
	}

	record.count += 1;
	return { allowed: true, remaining: maxAttempts - record.count, retryAfterSec: 0 };
}

export function resetRateLimit(bucketName: string, key: string): void {
	const bucket = stores.get(bucketName);
	if (bucket) {
		bucket.delete(key);
	}
}
