/**
 * Server-side HTML sanitization utilities.
 * Encodes special HTML characters to prevent Stored & Reflected XSS
 * when content is rendered in the UI (e.g. {@html comment.body}).
 */

const HTML_ENTITIES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#x27;',
	'/': '&#x2F;'
};

export function escapeHtml(str: string): string {
	if (!str || typeof str !== 'string') return '';
	return str.replace(/[&<>"'/]/g, (char) => HTML_ENTITIES[char] ?? char);
}

export function sanitizeText(str: string, maxLength = 10000): string {
	if (!str || typeof str !== 'string') return '';
	// Strip null bytes and control chars (except newline and tab)
	const clean = str.replace(/[\0\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
	const truncated = clean.slice(0, maxLength);
	return escapeHtml(truncated);
}
