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
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import { getSession } from '$lib/stores/auth.svelte';

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

	// 3-Factor Password Reset State for Student
	const currentUser = getSession();
	let email = $state(currentUser?.email || 'student@example.test');
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
			const res = await fetch('/api/auth/reset-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, pin, phrase, symbols, newPassword })
			});
			const json = await res.json();
			if (res.ok) {
				toast.success('Password successfully reset!', {
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
		} catch {
			toast.error('Network error during password reset.');
		} finally {
			resetting = false;
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

<div class="grid gap-6 lg:grid-cols-3 mt-4">
	<!-- Left 2 Cols: Student Security Alerts -->
	<div class="lg:col-span-2 space-y-6">
		<Card>
			<CardHeader>
				<div class="flex items-center gap-2">
					<ShieldAlertIcon class="text-destructive size-5" />
					<CardTitle>Security Events & Warnings</CardTitle>
				</div>
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
	</div>

	<!-- Right Col: Student 3-Factor Multi-Secret Emergency Password Reset -->
	<div>
		<Card class="border-primary/30">
			<CardHeader>
				<div class="flex items-center gap-2">
					<KeyRoundIcon class="text-primary size-5" />
					<CardTitle class="text-base">Student 3-Factor Reset</CardTitle>
				</div>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleResetSubmit} class="space-y-3" novalidate>
					<div class="space-y-1">
						<Label for="rec-email" class="text-xs">Account Email</Label>
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

				<p class="text-muted-foreground text-[10px] mt-4 leading-relaxed bg-muted p-2 rounded">
					Demo recovery keys:<br />
					PIN: <code>849201</code> · Phrase: <code>HostelMasterAdmin</code> · Symbols: <code>@#*&$!</code>
				</p>
			</CardContent>
		</Card>
	</div>
</div>
