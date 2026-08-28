/**
 * Security Audit Logging.
 * Structured logging for security events (auth, access control, upload checks).
 * Never logs passwords, session tokens, or full file contents.
 */

export interface SecurityEvent {
	type:
		| 'auth_success'
		| 'auth_failure'
		| 'logout'
		| 'access_denied'
		| 'upload_success'
		| 'upload_rejected'
		| 'rate_limit_exceeded'
		| 'security_exception';
	userId?: string;
	userRole?: string;
	ip?: string;
	resource?: string;
	detail?: string;
}

export function logSecurityEvent(event: SecurityEvent): void {
	const timestamp = new Date().toISOString();
	const entry = {
		timestamp,
		event: event.type,
		userId: event.userId ?? 'anonymous',
		userRole: event.userRole ?? 'none',
		resource: event.resource ?? 'none',
		ip: event.ip ?? 'unknown',
		detail: event.detail ?? ''
	};
	console.log(`[SECURITY AUDIT] ${JSON.stringify(entry)}`);
}
