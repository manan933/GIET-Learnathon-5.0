declare module 'keepalive-server' {
	export function ping(
		intervalMs: number,
		url: string,
		timeoutMs?: number
	): void;
}
