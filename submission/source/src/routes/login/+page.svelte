<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { signIn } from '$lib/stores/auth.svelte';
	import SchoolIcon from '@lucide/svelte/icons/school';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import TimerIcon from '@lucide/svelte/icons/timer';
	import { onDestroy } from 'svelte';

	let email = $state('');
	let password = $state('');
	let error = $state<string | null>(null);
	let submitting = $state(false);

	// Live Countdown Timer for Lockout
	let remainingSeconds = $state(0);
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	function startCountdown(seconds: number) {
		if (countdownInterval) clearInterval(countdownInterval);
		remainingSeconds = seconds;

		countdownInterval = setInterval(() => {
			if (remainingSeconds > 1) {
				remainingSeconds -= 1;
			} else {
				remainingSeconds = 0;
				if (countdownInterval) clearInterval(countdownInterval);
				countdownInterval = null;
				error = null;
			}
		}, 1000);
	}

	onDestroy(() => {
		if (countdownInterval) clearInterval(countdownInterval);
	});

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		if (mins > 0) {
			return `${mins}m ${secs.toString().padStart(2, '0')}s`;
		}
		return `${secs}s`;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (remainingSeconds > 0) return; // Prevent submission while locked
		error = null;

		const trimmedEmail = email.trim();
		if (!trimmedEmail) {
			error = 'Email address is required.';
			return;
		}
		if (!EMAIL_REGEX.test(trimmedEmail)) {
			error = 'Please enter a valid email address.';
			return;
		}
		if (!password) {
			error = 'Password is required.';
			return;
		}
		if (password.length < 6) {
			error = 'Password must be at least 6 characters.';
			return;
		}

		submitting = true;
		const result = await signIn(trimmedEmail, password);
		submitting = false;

		if (result.ok) {
			// getSession() is already updated; route guard redirects by role.
			const { getSession } = await import('$lib/stores/auth.svelte');
			const user = getSession();
			await goto(user?.role === 'warden' ? '/warden' : '/student', { replaceState: true });
		} else {
			const errMsg = result.error ?? 'Sign-in failed. Please try again.';
			error = errMsg;

			// Extract seconds from error string if locked (e.g. "... in 60s" or "... in 899s")
			const match = /in\s+(\d+)s/i.exec(errMsg) || /in\s+(\d+)\s+seconds/i.exec(errMsg);
			if (match) {
				const secs = Number.parseInt(match[1], 10);
				if (!Number.isNaN(secs) && secs > 0) {
					startCountdown(secs);
				}
			}
		}
	}
</script>

<svelte:head><title>Sign in · HostelGrievance</title></svelte:head>

<main class="bg-muted/30 flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-sm">
		<div class="mb-6 flex flex-col items-center text-center">
			<span
				class="bg-primary text-primary-foreground mb-3 flex size-11 items-center justify-center rounded-lg"
				aria-hidden="true"
			>
				<SchoolIcon class="size-6" />
			</span>
			<h1 class="text-xl font-semibold tracking-tight">HostelGrievance</h1>
			<p class="text-muted-foreground mt-1 text-sm">GIET University · Hostel Administration</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Sign in</CardTitle>
				<CardDescription>Use your university account to continue.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleSubmit} class="space-y-4" novalidate>
					<div class="space-y-1.5">
						<Label for="email">Email</Label>
						<Input
							id="email"
							type="email"
							autocomplete="username"
							placeholder="you@giet.edu"
							bind:value={email}
							aria-invalid={error ? 'true' : undefined}
							disabled={remainingSeconds > 0}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="password">Password</Label>
						<Input
							id="password"
							type="password"
							autocomplete="current-password"
							placeholder="••••••••"
							bind:value={password}
							aria-invalid={error ? 'true' : undefined}
							disabled={remainingSeconds > 0}
						/>
					</div>

					{#if remainingSeconds > 0}
						<div class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive flex items-start gap-2 text-xs animate-pulse" role="alert">
							<TimerIcon class="size-4 shrink-0 mt-0.5" />
							<div>
								<p class="font-semibold">Security Lock Active</p>
								<p class="mt-0.5">
									Try again in <span class="font-mono font-bold text-sm underline">{formatTime(remainingSeconds)}</span>
								</p>
							</div>
						</div>
					{:else if error}
						<div class="flex items-center gap-1.5 text-destructive text-sm" role="alert">
							<ShieldAlertIcon class="size-4 shrink-0" />
							<span>{error}</span>
						</div>
					{/if}

					<Button
						type="submit"
						class="w-full"
						disabled={submitting || remainingSeconds > 0}
					>
						{#if remainingSeconds > 0}
							Locked ({formatTime(remainingSeconds)})
						{:else if submitting}
							Signing in…
						{:else}
							Sign in
						{/if}
					</Button>
				</form>
			</CardContent>
		</Card>

		<p class="text-muted-foreground mt-6 text-center text-xs leading-relaxed">
			Demo environment — development credentials only:<br />
			Student: student@example.test / student123<br />
			Warden: warden@example.test / warden123
		</p>
	</div>
</main>
