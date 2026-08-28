<script lang="ts">
	import PageHeader from '$lib/components/app/page-header.svelte';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card/index.js';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import HistoryIcon from '@lucide/svelte/icons/history';

	interface AuditEntry {
		id: string;
		timestamp: string;
		event: string;
		user_id: string;
		user_role: string;
		resource: string;
		ip: string;
		detail: string;
	}

	let logs = $state<AuditEntry[]>([]);
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

	function eventBadgeVariant(event: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (event.includes('denied') || event.includes('failure') || event.includes('rejected')) return 'destructive';
		if (event.includes('create') || event.includes('upload')) return 'default';
		if (event.includes('status') || event.includes('auth')) return 'secondary';
		return 'outline';
	}

	async function loadLogs() {
		loading = true;
		try {
			const res = await fetch('/api/audit-logs');
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

<svelte:head><title>Activity Log · HostelGrievance</title></svelte:head>

<PageHeader
	title="System Activity Logs"
	description="Comprehensive digital activity trail of all authentication, grievance operations, comments, status changes, and access events."
>
	{#snippet actions()}
		<Button variant="outline" size="sm" onclick={loadLogs} disabled={loading}>
			<RefreshCwIcon class={`size-4 ${loading ? 'animate-spin' : ''}`} />
			Refresh Logs
		</Button>
	{/snippet}
</PageHeader>

<Card class="mt-4">
	<CardHeader>
		<div class="flex items-center gap-2">
			<HistoryIcon class="text-primary size-5" />
			<CardTitle>Global Activity Trail</CardTitle>
		</div>
		<CardDescription>Live real-time stream of all user activities, comments, and security events across the hostel portal.</CardDescription>
	</CardHeader>
	<CardContent>
		{#if loading && logs.length === 0}
			<p class="text-muted-foreground text-center py-8 text-sm">Loading system activity logs…</p>
		{:else if logs.length === 0}
			<p class="text-muted-foreground text-center py-8 text-sm">No activity entries recorded yet.</p>
		{:else}
			<div class="rounded-md border overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead class="w-[170px]">Timestamp</TableHead>
							<TableHead class="w-[140px]">Event</TableHead>
							<TableHead class="w-[100px]">User</TableHead>
							<TableHead class="w-[80px]">Role</TableHead>
							<TableHead>Details / Content</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each logs as log (log.id)}
							<TableRow class={log.event.includes('denied') ? 'bg-destructive/10' : ''}>
								<TableCell class="font-mono text-xs text-muted-foreground">
									{formatDate(log.timestamp)}
								</TableCell>
								<TableCell>
									<Badge variant={eventBadgeVariant(log.event)} class="capitalize text-xs">
										{log.event.replace(/_/g, ' ')}
									</Badge>
								</TableCell>
								<TableCell class="font-mono text-xs font-medium">
									{log.user_id}
								</TableCell>
								<TableCell class="capitalize text-xs">
									{log.user_role}
								</TableCell>
								<TableCell class="text-xs">
									<span class="font-semibold">{log.detail}</span>
									{#if log.resource && log.resource !== 'none'}
										<span class="text-muted-foreground ml-1">({log.resource})</span>
									{/if}
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		{/if}
	</CardContent>
</Card>
