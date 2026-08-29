<script lang="ts">
	import PageHeader from '$lib/components/app/page-header.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';

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

	// 3-Factor Password Reset State
	let email = $state('warden@example.test');
	let pin = $state('');
	let phrase = $state('');
	let symbols = $state('');
	let newPassword = $state('');
	let resetting = $state(false);

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

	async function handleResetSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!pin || !phrase || !symbols || !newPassword) {
			toast.error('All 3 secret keys and the new password are required.');
			return;
		}

		resetting = true;
		try {
			const res = await fetch('/api/warden/reset-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, pin, phrase, symbols, newPassword })
			});
			const json = await res.json();
			if (res.ok) {
				toast.success('Warden password successfully reset!', {
					description: json.message
				});
				pin = '';
				phrase = '';
				symbols = '';
				newPassword = '';
				loadLogs();
			} else {
				toast.error('Reset failed', { description: json.error || json.message });
			}
		} catch (err) {
			toast.error('Network error during password reset.');
		} finally {
			resetting = false;
		}
	}

	$effect(() => {
		loadLogs();
	});
</script>

<svelte:head><title>Threat & Security Center · HostelGrievance</title></svelte:head>

<PageHeader
	title="Threat & Security Center"
	description="Monitor login security, account lockouts, and emergency recovery."
>
	{#snippet actions()}
		<Button variant="outline" size="sm" onclick={loadLogs} disabled={loading}>
			<RefreshCwIcon class={`size-4 ${loading ? 'animate-spin' : ''}`} />
			Refresh Threats
		</Button>
	{/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-3 mt-4">
	<!-- Left 2 Cols: Security Incidents & Threat Logs -->
	<div class="lg:col-span-2 space-y-6">
		<Card>
			<CardHeader>
				<div class="flex items-center gap-2">
					<ShieldAlertIcon class="text-destructive size-5" />
					<CardTitle>System Security Incidents</CardTitle>
				</div>
			</CardHeader>
			<CardContent>
				{#if loading && logs.length === 0}
					<p class="text-muted-foreground text-center py-8 text-sm">Loading security logs…</p>
				{:else if logs.length === 0}
					<p class="text-muted-foreground text-center py-8 text-sm">No security threats detected. All systems nominal.</p>
				{:else}
					<div class="rounded-md border overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead class="w-[170px]">Timestamp</TableHead>
									<TableHead class="w-[120px]">Threat Type</TableHead>
									<TableHead class="w-[90px]">User / IP</TableHead>
									<TableHead>Incident Detail</TableHead>
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
										<TableCell class="font-mono text-xs font-medium">
											{log.user_id !== 'anonymous' ? log.user_id : log.ip}
										</TableCell>
										<TableCell class="text-xs font-semibold text-destructive">
											{log.detail}
										</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>

	<!-- Right Col: Warden 3-Factor Multi-Secret Emergency Password Reset -->
	<div>
		<Card class="border-primary/30">
			<CardHeader>
				<div class="flex items-center gap-2">
					<KeyRoundIcon class="text-primary size-5" />
					<CardTitle class="text-base">Warden 3-Factor Reset</CardTitle>
				</div>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleResetSubmit} class="space-y-3" novalidate>
					<div class="space-y-1">
						<Label for="rec-email" class="text-xs">Warden Email</Label>
						<Input id="rec-email" bind:value={email} class="h-8 text-xs" readonly />
					</div>

					<div class="space-y-1">
						<Label for="rec-pin" class="text-xs">Factor 1: Numeric PIN</Label>
						<Input
							id="rec-pin"
							type="text"
							placeholder="enter numbers only"
							bind:value={pin}
							class="h-8 text-xs font-mono"
							required
						/>
					</div>

					<div class="space-y-1">
						<Label for="rec-phrase" class="text-xs">Factor 2: Passphrase Word</Label>
						<Input
							id="rec-phrase"
							type="text"
							placeholder="enter alphabets only"
							bind:value={phrase}
							class="h-8 text-xs font-mono"
							required
						/>
					</div>

					<div class="space-y-1">
						<Label for="rec-symbols" class="text-xs">Factor 3: Symbol Key</Label>
						<Input
							id="rec-symbols"
							type="text"
							placeholder="enter symbols only"
							bind:value={symbols}
							class="h-8 text-xs font-mono"
							required
						/>
					</div>

					<div class="space-y-1 pt-1">
						<Label for="rec-newpass" class="text-xs">New Secure Password</Label>
						<Input
							id="rec-newpass"
							type="password"
							placeholder="Min 8 characters"
							bind:value={newPassword}
							class="h-8 text-xs"
							required
						/>
					</div>

					<Button type="submit" size="sm" class="w-full mt-2" disabled={resetting}>
						{resetting ? 'Verifying Factors…' : 'Unlock & Reset Password'}
					</Button>
				</form>
			</CardContent>
		</Card>
	</div>
</div>
