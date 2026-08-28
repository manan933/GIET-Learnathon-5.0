import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:3001';

const SECURITY_HEADERS = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
	'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
	'X-XSS-Protection': '0',
	'Cross-Origin-Resource-Policy': 'same-origin',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Content-Security-Policy':
		"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
};

export default defineConfig({
	server: {
		host: '0.0.0.0',
		allowedHosts: true,
		cors: false,
		headers: SECURITY_HEADERS,
		proxy: {
			'/api': API_TARGET
		}
	},
	preview: {
		host: '0.0.0.0',
		allowedHosts: true,
		cors: false,
		headers: SECURITY_HEADERS,
		proxy: {
			'/api': API_TARGET
		}
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter()
		})
	]
});
