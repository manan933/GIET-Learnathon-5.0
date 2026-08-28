<script lang="ts">
	import PageHeader from '$lib/components/app/page-header.svelte';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card/index.js';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

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

<svelte:head><title>My Activity Log · HostelGrievance</title></svelte:head>

<PageHeader
	title="My Activity Log"
	description="Personal security audit trail recording all actions on your account."
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
		<CardTitle>Recent Account Activity</CardTitle>
		<CardDescription>All actions including logins, grievance submissions, edits, and comments are recorded.</CardDescription>
	</CardHeader>
	<CardContent>
		{#if loading && logs.length === 0}
			<p class="text-muted-foreground text-center py-8 text-sm">Loading activity logs…</p>
		{:else if logs.length === 0}
			<p class="text-muted-foreground text-center py-8 text-sm">No activity recorded yet.</p>
		{:else}
			<div class="rounded-md border overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead class="w-[180px]">Timestamp</TableHead>
							<TableHead class="w-[140px]">Event</TableHead>
							<TableHead>Details</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each logs as log (log.id)}
							<TableRow>
								<TableCell class="font-mono text-xs text-muted-foreground">
									{formatDate(log.timestamp)}
								</TableCell>
								<TableCell>
									<Badge variant={eventBadgeVariant(log.event)} class="capitalize text-xs">
										{log.event.replace(/_/g, ' ')}
									</Badge>
								</TableCell>
								<TableCell class="text-sm font-medium">
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
