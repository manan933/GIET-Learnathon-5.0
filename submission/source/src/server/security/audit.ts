/**
 * Security Audit Logging.
 * Structured logging for security & application audit trail.
 * Logs all actions (auth, grievance operations, comments, attachments, access controls).
 * Never logs passwords, session tokens, or full file contents.
 */

export interface SecurityEvent {
	type:
		| 'auth_success'
		| 'auth_failure'
		| 'logout'
		| 'access_denied'
		| 'grievance_create'
		| 'grievance_view'
		| 'grievance_update_content'
		| 'grievance_status_change'
		| 'comment_create'
		| 'upload_success'
		| 'upload_rejected'
		| 'attachment_download'
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
