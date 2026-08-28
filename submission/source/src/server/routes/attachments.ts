import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { requireUser } from '../auth/session.ts';
import { assertCanViewGrievance, findAttachmentRow, requireGrievance } from '../db/queries.ts';
import { readStoredFile } from '../storage/attachments.ts';
import { HttpError } from '../http/errors.ts';
import { logSecurityEvent } from '../security/audit.ts';

export const attachmentRoutes = new Hono<AppEnv>();

attachmentRoutes.get('/:id', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = findAttachmentRow(db, c.req.param('id'));
	if (!row) {
		throw new HttpError(404, 'not_found', 'Attachment was not found.');
	}

	const grievance = requireGrievance(db, row.grievance_id);

	// Enforce object-level access control on attachments
	try {
		assertCanViewGrievance(user, grievance);
	} catch (err) {
		logSecurityEvent({
			type: 'access_denied',
			userId: user.id,
			userRole: user.role,
			resource: `/api/attachments/${row.id}`,
			detail: `Unauthorized attachment download attempt for grievance ${grievance.id}`
		});
		throw err;
	}

	const bytes = readStoredFile(c.get('uploadsDir'), row.stored_filename);

	logSecurityEvent({
		type: 'attachment_download',
		userId: user.id,
		userRole: user.role,
		resource: `/api/attachments/${row.id}`,
		detail: `Downloaded attachment "${row.original_filename}" for grievance ${grievance.id}`
	});

	c.header('Content-Type', row.mime_type);
	c.header('Content-Length', String(bytes.length));
	c.header('X-Content-Type-Options', 'nosniff');
	c.header('Content-Security-Policy', "default-src 'none'; sandbox");
	c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
	c.header(
		'Content-Disposition',
		`inline; filename="${row.original_filename.replace(/["\r\n\t\0]/g, '')}"`
	);

	return c.body(new Uint8Array(bytes));
});
