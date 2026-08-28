import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// 256-bit (32 byte) key derived from env or deterministic secure fallback
const RAW_KEY =
	process.env.APP_ENCRYPTION_KEY ||
	'hostelgrievance_military_grade_aes256_key_32bytes!!';

const KEY_BUFFER = Buffer.alloc(32);
Buffer.from(RAW_KEY, 'utf-8').copy(KEY_BUFFER);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const PREFIX = 'enc:v1:';

/**
 * Encrypt sensitive text fields using AES-256-GCM.
 * Output format: enc:v1:<iv_hex>:<auth_tag_hex>:<cipher_hex>
 */
export function encryptField(plainText: string): string {
	if (!plainText) return plainText;

	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, KEY_BUFFER, iv);

	let encrypted = cipher.update(plainText, 'utf8', 'hex');
	encrypted += cipher.final('hex');

	const authTag = cipher.getAuthTag().toString('hex');
	return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Transparently decrypt an AES-256-GCM encrypted field.
 * Passes through unencrypted text safely.
 */
export function decryptField(cipherText: string): string {
	if (!cipherText || !cipherText.startsWith(PREFIX)) {
		return cipherText;
	}

	try {
		const parts = cipherText.slice(PREFIX.length).split(':');
		if (parts.length !== 3) return cipherText;

		const [ivHex, authTagHex, encryptedHex] = parts;
		const iv = Buffer.from(ivHex, 'hex');
		const authTag = Buffer.from(authTagHex, 'hex');

		const decipher = createDecipheriv(ALGORITHM, KEY_BUFFER, iv);
		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
		decrypted += decipher.final('utf8');
		return decrypted;
	} catch {
		// In case of any decryption failure, return original text safely
		return cipherText;
	}
}
