import { hashPassword, verifyPassword } from './passwords.ts';
import { checkPwnedPassword } from '../security/pwned.ts';
import { logSecurityEvent } from '../security/audit.ts';
import { HttpError } from '../http/errors.ts';
import type { Database } from 'better-sqlite3';
import { scryptSync } from 'node:crypto';

// Pre-computed unique cryptographic salts for each secret factor
const SALT_PIN = '8f1a2b3c4d5e6f708192a3b4c5d6e7f8';
const SALT_PHRASE = '112233445566778899aabbccddeeff00';
const SALT_SYMBOLS = 'fedcba98765432100123456789abcdef';

// Individually salted scrypt hashes for each of the 3 Warden Emergency Recovery Factors
// Factor 1 (Numeric PIN): "849201"
// Factor 2 (Passphrase Word): "HostelMasterAdmin"
// Factor 3 (Symbol Key): "@#*&$!"
export const WARDEN_RECOVERY_HASHES = {
	pinHash: `scrypt:${SALT_PIN}:${scryptSync('849201', SALT_PIN, 64).toString('hex')}`,
	phraseHash: `scrypt:${SALT_PHRASE}:${scryptSync('HostelMasterAdmin', SALT_PHRASE, 64).toString('hex')}`,
	symbolsHash: `scrypt:${SALT_SYMBOLS}:${scryptSync('@#*&$!', SALT_SYMBOLS, 64).toString('hex')}`
};

export async function resetWardenPassword(
	db: Database,
	opts: {
		email: string;
		pin: string;
		phrase: string;
		symbols: string;
		newPassword: string;
		ip?: string;
	}
): Promise<{ success: boolean; message: string }> {
	const user = db
		.prepare("SELECT * FROM users WHERE email = ? AND role = 'warden'")
		.get(opts.email.trim()) as { id: string; email: string } | undefined;

	if (!user) {
		throw new HttpError(404, 'not_found', 'Warden account not found.');
	}

	// 1. Verify all 3 separate recovery components using independent salted scrypt & timingSafeEqual
	const isPinValid = verifyPassword(opts.pin.trim(), WARDEN_RECOVERY_HASHES.pinHash);
	const isPhraseValid = verifyPassword(opts.phrase.trim(), WARDEN_RECOVERY_HASHES.phraseHash);
	const isSymbolsValid = verifyPassword(opts.symbols.trim(), WARDEN_RECOVERY_HASHES.symbolsHash);

	if (!isPinValid || !isPhraseValid || !isSymbolsValid) {
		logSecurityEvent(
			{
				type: 'auth_failure',
				userId: user.id,
				userRole: 'warden',
				resource: '/api/warden/reset-password',
				ip: opts.ip,
				detail: 'Failed warden 3-factor recovery attempt (invalid recovery secrets)'
			},
			db
		);
		throw new HttpError(401, 'unauthenticated', 'Invalid recovery secrets. Please check your PIN, passphrase, and symbol key.');
	}

	// 2. Validate new password strength
	if (opts.newPassword.length < 8) {
		throw new HttpError(400, 'bad_request', 'New password must be at least 8 characters long.');
	}

	// 3. Breached Credential Check (HaveIBeenPwned k-Anonymity API)
	const pwned = await checkPwnedPassword(opts.newPassword);
	if (pwned.breached) {
		throw new HttpError(
			400,
			'bad_request',
			`This password has appeared in a public data breach (${pwned.count.toLocaleString()} times). For security, please choose a stronger, unique password.`
		);
	}

	// 4. Update password hash with fresh scrypt salt
	const newHash = hashPassword(opts.newPassword);
	db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

	// 5. Invalidate all active sessions across all devices
	db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

	logSecurityEvent(
		{
			type: 'auth_success',
			userId: user.id,
			userRole: 'warden',
			resource: '/api/warden/reset-password',
			ip: opts.ip,
			detail: 'Warden password successfully reset via 3-Factor Multi-Secret verification. All active sessions invalidated.'
		},
		db
	);

	return {
		success: true,
		message: 'Password successfully reset. You can now sign in with your new credentials.'
	};
}
