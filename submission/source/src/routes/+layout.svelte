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
		function preventContextMenu(e: MouseEvent) {
			e.preventDefault();
		}

		function preventInspectKeys(e: KeyboardEvent) {
			// Disable F12
			if (e.key === 'F12') {
				e.preventDefault();
				return;
			}
			// Disable Ctrl+Shift+I / J / C / S or Cmd+Option+I / J / C
			if (
				(e.ctrlKey || e.metaKey) &&
				(e.shiftKey || e.altKey) &&
				['I', 'i', 'J', 'j', 'C', 'c', 'S', 's'].includes(e.key)
			) {
				e.preventDefault();
				return;
			}
			// Disable Ctrl+U / Cmd+U (View Source)
			if ((e.ctrlKey || e.metaKey) && ['u', 'U'].includes(e.key)) {
				e.preventDefault();
				return;
			}
		}

		window.addEventListener('contextmenu', preventContextMenu);
		window.addEventListener('keydown', preventInspectKeys);

		return () => {
			window.removeEventListener('contextmenu', preventContextMenu);
			window.removeEventListener('keydown', preventInspectKeys);
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
