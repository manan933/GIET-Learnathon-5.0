import { hashPassword, verifyPassword } from './passwords.ts';
import { checkPwnedPassword } from '../security/pwned.ts';
import { logSecurityEvent } from '../security/audit.ts';
import { HttpError } from '../http/errors.ts';
import type { Database } from 'better-sqlite3';

// Default recovery secrets for demo / university warden setup
export const DEFAULT_WARDEN_RECOVERY = {
	pin: '849201', // Numeric PIN
	phrase: 'HostelMasterAdmin', // Alphabetic Word
	symbols: '@#*&$!' // Symbol Sequence
};

// Combined recovery token generator
export function combineRecoverySecrets(pin: string, phrase: string, symbols: string): string {
	return `rec:${pin.trim()}:${phrase.trim()}:${symbols.trim()}`;
}

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

	// 1. Verify all 3 separate recovery components
	const isPinValid = opts.pin.trim() === DEFAULT_WARDEN_RECOVERY.pin;
	const isPhraseValid = opts.phrase.trim() === DEFAULT_WARDEN_RECOVERY.phrase;
	const isSymbolsValid = opts.symbols.trim() === DEFAULT_WARDEN_RECOVERY.symbols;

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

	// 3. Breached Credential Check (HaveIBeenPwned)
	const pwned = await checkPwnedPassword(opts.newPassword);
	if (pwned.breached) {
		throw new HttpError(
			400,
			'bad_request',
			`This password has appeared in a public data breach (${pwned.count.toLocaleString()} times). For security, please choose a stronger, unique password.`
		);
	}

	// 4. Update password hash
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
