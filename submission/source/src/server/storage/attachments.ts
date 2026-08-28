import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '../config.ts';
import { HttpError } from '../http/errors.ts';

const MIME_EXTENSION: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/gif': '.gif',
	'image/webp': '.webp'
};

export function ensureUploadsDir(dir: string): void {
	mkdirSync(dir, { recursive: true });
}

export function resetUploadsDir(dir: string): void {
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
	mkdirSync(dir, { recursive: true });
}

export function originalBasename(filename: string): string {
	if (!filename || typeof filename !== 'string') return 'attachment.bin';
	const base = filename.replace(/\\/g, '/').split('/').pop() ?? 'attachment.bin';
	// Strip null bytes, control characters, quotes, angle brackets, traversal dots
	const cleaned = base
		.replace(/[\0\r\n\t\x00-\x1f\x7f]/g, '')
		.replace(/[<>":|?*]/g, '')
		.trim();
	const sanitized = cleaned.length > 0 ? cleaned.slice(0, 100) : 'attachment.bin';
	return sanitized;
}

export function extensionForMime(mime: string): string {
	return MIME_EXTENSION[mime] ?? '.bin';
}

/**
 * Generates an unguessable, randomized filename for physical storage.
 * User-supplied filenames are NEVER used for disk paths.
 */
export function newStoredName(mime: string, _originalName?: string): string {
	const ext = extensionForMime(mime);
	return `${randomBytes(16).toString('hex')}${ext}`;
}

/**
 * Validates image magic bytes (file signature) against the declared MIME type.
 */
export function validateImageSignature(bytes: Buffer, mime: string): boolean {
	if (bytes.length < 12) return false;

	switch (mime) {
		case 'image/jpeg':
			return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

		case 'image/png':
			return (
				bytes[0] === 0x89 &&
				bytes[1] === 0x50 &&
				bytes[2] === 0x4e &&
				bytes[3] === 0x47 &&
				bytes[4] === 0x0d &&
				bytes[5] === 0x0a &&
				bytes[6] === 0x1a &&
				bytes[7] === 0x0a
			);

		case 'image/gif': {
			const header = bytes.subarray(0, 6).toString('ascii');
			return header === 'GIF87a' || header === 'GIF89a';
		}

		case 'image/webp': {
			const riff = bytes.subarray(0, 4).toString('ascii');
			const webp = bytes.subarray(8, 12).toString('ascii');
			return riff === 'RIFF' && webp === 'WEBP';
		}

		default:
			return false;
	}
}

export function assertPermittedAttachment(mime: string, bytes: Buffer): void {
	if (!ALLOWED_ATTACHMENT_TYPES.has(mime)) {
		throw new HttpError(400, 'bad_request', 'Attachments must be JPEG, PNG, GIF, or WebP images.');
	}
	if (bytes.byteLength <= 0) {
		throw new HttpError(400, 'bad_request', 'Attachment file is empty.');
	}
	if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
		throw new HttpError(400, 'bad_request', 'Attachment must be 2 MB or smaller.');
	}
	if (!validateImageSignature(bytes, mime)) {
		throw new HttpError(400, 'bad_request', 'Uploaded file signature does not match permitted image format.');
	}
}

export async function bufferFromUpload(file: File): Promise<Buffer> {
	const bytes = Buffer.from(await file.arrayBuffer());
	assertPermittedAttachment(file.type, bytes);
	return bytes;
}

export function writeStoredFile(uploadsDir: string, storedName: string, bytes: Buffer): void {
	ensureUploadsDir(uploadsDir);
	const targetPath = join(uploadsDir, storedName);
	const root = resolve(uploadsDir);
	const resolvedTarget = resolve(targetPath);
	if (resolvedTarget !== root && !resolvedTarget.startsWith(root + sep)) {
		throw new HttpError(400, 'bad_request', 'Invalid file storage path.');
	}
	writeFileSync(resolvedTarget, bytes, { mode: 0o600 });
}

export function readStoredFile(uploadsDir: string, storedName: string): Buffer {
	if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	const root = resolve(uploadsDir);
	const full = resolve(join(uploadsDir, storedName));
	if (full !== root && !full.startsWith(root + sep)) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	if (!existsSync(full)) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	return readFileSync(full);
}

export function listStoredNames(uploadsDir: string): string[] {
	if (!existsSync(uploadsDir)) return [];
	return readdirSync(uploadsDir).filter((name) => name !== '.gitkeep');
}
