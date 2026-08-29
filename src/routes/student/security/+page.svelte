<script lang="ts">
	import PageHeader from '$lib/components/app/page-header.svelte';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card/index.js';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

	interface SecurityEntry {
		id: string;
		timestamp: string;
		event: string;
		user_id: string;
		user_role: string;
		resource: string;
		ip: string;
		detail: string;
	}

	let logs = $state<SecurityEntry[]>([]);
	let loading = $state(true);

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString('en-IN', {
				day: 'numeric',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	async function loadLogs() {
		loading = true;
		try {
			const res = await fetch('/api/security-logs');
			if (res.ok) {
				const json = await res.json();
				logs = json.data ?? [];
			}
		} catch {
			logs = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		loadLogs();
	});
</script>

<svelte:head><title>Security Alerts · HostelGrievance</title></svelte:head>

<PageHeader
	title="Account Security Logs"
	description="Keep track of security alerts and login activity on your account."
>
	{#snippet actions()}
		<Button variant="outline" size="sm" onclick={loadLogs} disabled={loading}>
			<RefreshCwIcon class={`size-4 ${loading ? 'animate-spin' : ''}`} />
			Refresh
		</Button>
	{/snippet}
</PageHeader>

<Card class="mt-4">
	<CardHeader>
		<div class="flex items-center gap-2">
			<ShieldAlertIcon class="text-destructive size-5" />
			<CardTitle>Security Events & Warnings</CardTitle>
		</div>
		<CardDescription>
			Shows security alerts and failed sign-in attempts on your account.
		</CardDescription>
	</CardHeader>
	<CardContent>
		{#if loading && logs.length === 0}
			<p class="text-muted-foreground text-center py-8 text-sm">Loading security logs…</p>
		{:else if logs.length === 0}
			<div class="flex flex-col items-center justify-center py-10 text-center">
				<ShieldCheckIcon class="text-emerald-500 size-10 mb-2" />
				<p class="font-medium text-sm">No Security Incidents</p>
				<p class="text-muted-foreground text-xs mt-1">Your account is secure. Zero failed login attempts or lockouts recorded.</p>
			</div>
		{:else}
			<div class="rounded-md border overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead class="w-[180px]">Timestamp</TableHead>
							<TableHead class="w-[140px]">Severity / Event</TableHead>
							<TableHead>Threat Detail</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each logs as log (log.id)}
							<TableRow class="bg-destructive/5">
								<TableCell class="font-mono text-xs text-muted-foreground">
									{formatDate(log.timestamp)}
								</TableCell>
								<TableCell>
									<Badge variant="destructive" class="capitalize text-xs">
										{log.event.replace(/_/g, ' ')}
									</Badge>
								</TableCell>
								<TableCell class="text-xs font-medium text-destructive">
									{log.detail || log.resource}
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		{/if}
	</CardContent>
</Card>
