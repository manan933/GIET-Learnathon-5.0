/**
 * Security Audit Logging.
 * Structured logging for security & application audit trail.
 * Logs all actions (auth, grievance operations, comments, attachments, access controls)
 * to both stdout and persistent SQLite database table `audit_logs`.
 * Never logs passwords, session tokens, or full file contents.
 */
import type { Database } from 'better-sqlite3';
import { randomBytes } from 'node:crypto';

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

let globalAuditDb: Database | null = null;

export function setAuditDb(db: Database): void {
	globalAuditDb = db;
}

export function logSecurityEvent(event: SecurityEvent, db?: Database): void {
	const timestamp = new Date().toISOString();
	const id = `log-${randomBytes(8).toString('hex')}`;
	const entry = {
		id,
		timestamp,
		event: event.type,
		userId: event.userId ?? 'anonymous',
		userRole: event.userRole ?? 'none',
		resource: event.resource ?? 'none',
		ip: event.ip ?? 'unknown',
		detail: event.detail ?? ''
	};
	console.log(`[SECURITY AUDIT] ${JSON.stringify(entry)}`);

	const targetDb = db ?? globalAuditDb;
	if (targetDb) {
		try {
			targetDb
				.prepare(
					`INSERT INTO audit_logs (id, timestamp, event, user_id, user_role, resource, ip, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.run(
					entry.id,
					entry.timestamp,
					entry.event,
					entry.userId,
					entry.userRole,
					entry.resource,
					entry.ip,
					entry.detail
				);
		} catch {
			// Fail-safe: do not crash if DB logging encounters an issue
		}
	}
}
