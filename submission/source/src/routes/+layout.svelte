<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import AppHeader from '$lib/components/app/app-header.svelte';
	import AppSidebar from '$lib/components/app/app-sidebar.svelte';
	import { getSession } from '$lib/stores/auth.svelte';

	let { children } = $props();

	const user = $derived(getSession());
	const showShell = $derived(!!user && page.url.pathname !== '/login');

	onMount(() => {
		function disableEvent(e: Event) {
			if (e.cancelable) e.preventDefault();
			e.stopPropagation();
			return false;
		}

		function disableKeyShortcuts(e: KeyboardEvent) {
			const key = (e.key || '').toUpperCase();
			const code = (e.code || '').toUpperCase();

			// F12 key
			if (key === 'F12' || code === 'F12') {
				if (e.cancelable) e.preventDefault();
				e.stopPropagation();
				return false;
			}

			// Ctrl+Shift+I / J / C / K / E / M / S or Cmd+Option+I / J / C
			if ((e.ctrlKey || e.metaKey) && (e.shiftKey || e.altKey)) {
				if (
					['I', 'J', 'C', 'K', 'E', 'M', 'S'].includes(key) ||
					['KEYI', 'KEYJ', 'KEYC', 'KEYK', 'KEYE', 'KEYM', 'KEYS'].includes(code)
				) {
					if (e.cancelable) e.preventDefault();
					e.stopPropagation();
					return false;
				}
			}

			// Ctrl+U (View Source), Ctrl+S (Save), Ctrl+P (Print)
			if ((e.ctrlKey || e.metaKey) && ['U', 'S', 'P'].includes(key)) {
				if (e.cancelable) e.preventDefault();
				e.stopPropagation();
				return false;
			}
		}

		// Attach in capture phase to intercept before any browser or DOM default
		document.addEventListener('contextmenu', disableEvent, { capture: true });
		window.addEventListener('contextmenu', disableEvent, { capture: true });
		document.addEventListener('keydown', disableKeyShortcuts, { capture: true });
		window.addEventListener('keydown', disableKeyShortcuts, { capture: true });

		return () => {
			document.removeEventListener('contextmenu', disableEvent, { capture: true });
			window.removeEventListener('contextmenu', disableEvent, { capture: true });
			document.removeEventListener('keydown', disableKeyShortcuts, { capture: true });
			window.removeEventListener('keydown', disableKeyShortcuts, { capture: true });
		};
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<Toaster position="bottom-right" richColors />
<div class={showShell ? 'bg-muted/30 flex min-h-svh flex-col' : 'contents'}>
	{#if showShell && user}
		<AppHeader {user} />
	{/if}
	<div class={showShell ? 'flex min-h-0 flex-1' : 'contents'}>
		{#if showShell && user}
			<AppSidebar {user} />
		{/if}
		<div class={showShell ? 'min-w-0 flex-1 overflow-auto p-4 sm:p-6' : 'contents'}>
			{@render children()}
		</div>
	</div>
</div>
