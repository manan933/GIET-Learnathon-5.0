import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:3001';

export default defineConfig({
	server: {
		host: '0.0.0.0',
		allowedHosts: true,
		proxy: {
			'/api': API_TARGET
		}
	},
	preview: {
		host: '0.0.0.0',
		allowedHosts: true,
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
