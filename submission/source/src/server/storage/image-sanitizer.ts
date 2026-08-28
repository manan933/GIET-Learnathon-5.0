/**
 * Image Sanitization & EXIF Metadata Stripping.
 * Strips GPS geolocation, camera serial numbers, timestamps, and hidden metadata
 * from uploaded JPEG and PNG files before saving to disk or database.
 */

export function stripJpegExif(buffer: Buffer): Buffer {
	if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
		return buffer; // Not a valid JPEG, return as-is
	}

	const chunks: Buffer[] = [Buffer.from([0xff, 0xd8])];
	let offset = 2;

	while (offset < buffer.length) {
		if (buffer[offset] !== 0xff) {
			break;
		}

		const marker = buffer[offset + 1];

		// Standalone markers (SOI, EOI, RST0-RST7)
		if (marker === 0xd9) {
			// EOI (End of Image)
			chunks.push(buffer.subarray(offset));
			break;
		}

		if (offset + 4 > buffer.length) break;
		const length = buffer.readUInt16BE(offset + 2);

		// Skip APP1 (0xE1 = Exif metadata / GPS) and APP2 (0xE2 = FlashPix)
		if (marker === 0xe1 || marker === 0xe2) {
			offset += 2 + length;
			continue;
		}

		// SOS (Start of Scan) marker - rest of the file is image scan data
		if (marker === 0xda) {
			chunks.push(buffer.subarray(offset));
			break;
		}

		chunks.push(buffer.subarray(offset, offset + 2 + length));
		offset += 2 + length;
	}

	return Buffer.concat(chunks);
}

export function stripPngMetadata(buffer: Buffer): Buffer {
	const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
		return buffer;
	}

	const chunks: Buffer[] = [PNG_SIGNATURE];
	let offset = 8;

	// Ancillary metadata chunk types to strip: tEXt, zTXt, iTXt, eXIf, tIME
	const STRIP_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

	while (offset + 8 <= buffer.length) {
		const length = buffer.readUInt32BE(offset);
		const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
		const totalChunkLength = 12 + length; // 4 len + 4 type + data + 4 crc

		if (offset + totalChunkLength > buffer.length) break;

		if (!STRIP_CHUNKS.has(type)) {
			chunks.push(buffer.subarray(offset, offset + totalChunkLength));
		}

		if (type === 'IEND') break;
		offset += totalChunkLength;
	}

	return Buffer.concat(chunks);
}

export function sanitizeImageBuffer(buffer: Buffer, mimeType: string): Buffer {
	try {
		const normalized = mimeType.toLowerCase();
		if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
			return stripJpegExif(buffer);
		}
		if (normalized === 'image/png') {
			return stripPngMetadata(buffer);
		}
		return buffer;
	} catch {
		return buffer; // Fail-safe fallback
	}
}
