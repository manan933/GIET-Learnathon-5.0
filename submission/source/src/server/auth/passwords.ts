import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 64;

export function hashPassword(password: string): string {
	const salt = randomBytes(16).toString('hex');
	const derivedKey = scryptSync(password, salt, KEY_LEN);
	return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
	const parts = stored.split(':');
	if (parts.length === 3 && parts[0] === 'scrypt') {
		const [, salt, hash] = parts;
		if (!salt || !hash) return false;
		const actual = scryptSync(password, salt, KEY_LEN);
		const expected = Buffer.from(hash, 'hex');
		if (actual.length !== expected.length) return false;
		return timingSafeEqual(actual, expected);
	}
	if (parts.length === 2 && parts[0] === 'sha256') {
		const [, hash] = parts;
		if (!hash) return false;
		const actual = createHash('sha256').update(password).digest();
		const expected = Buffer.from(hash, 'hex');
		if (actual.length !== expected.length) return false;
		return timingSafeEqual(actual, expected);
	}
	return false;
}

