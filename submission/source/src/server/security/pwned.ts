import { createHash } from 'node:crypto';

export interface PwnedCheckResult {
	breached: boolean;
	count: number;
}

/**
 * Check if a password has appeared in historical data breaches using HaveIBeenPwned k-Anonymity API.
 * Never sends the full password or full hash over the network.
 */
export async function checkPwnedPassword(password: string): Promise<PwnedCheckResult> {
	if (!password) return { breached: false, count: 0 };

	try {
		const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
		const prefix = sha1.slice(0, 5);
		const suffix = sha1.slice(5);

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2500); // 2.5s fail-safe timeout

		const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
			headers: { 'User-Agent': 'HostelGrievance-Security-Scanner/1.0' },
			signal: controller.signal
		});
		clearTimeout(timeout);

		if (!res.ok) {
			return { breached: false, count: 0 };
		}

		const text = await res.text();
		const lines = text.split('\n');

		for (const line of lines) {
			const [hashSuffix, countStr] = line.trim().split(':');
			if (hashSuffix && hashSuffix.toUpperCase() === suffix) {
				const count = Number.parseInt(countStr, 10) || 1;
				return { breached: true, count };
			}
		}

		return { breached: false, count: 0 };
	} catch {
		// Fail open if external API is unreachable so user operations are not blocked
		return { breached: false, count: 0 };
	}
}
