import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { requireUser } from '../auth/session.ts';
import {
	assembleGrievance,
	assertCanViewGrievance,
	findUserById,
	listAllGrievanceRows,
	listCommentRows,
	listGrievanceRowsForStudent,
	nextAttachmentId,
	nextCommentId,
	nextGrievanceId,
	requireGrievance,
	touchGrievance
} from '../db/queries.ts';
import type { CommentRow, AttachmentRow, GrievanceStatusDb } from '../types/index.ts';
import { toPublicAttachment, toPublicComment, toPublicUser } from '../db/map.ts';
import { HttpError } from '../http/errors.ts';
import { parseCategory, statusToDb } from '../http/status.ts';
import {
	bufferFromUpload,
	newStoredName,
	originalBasename,
	writeStoredFile
} from '../storage/attachments.ts';
import { sanitizeText } from '../security/sanitize.ts';
import { checkRateLimit } from '../security/rate-limit.ts';
import { logSecurityEvent } from '../security/audit.ts';

function nowIso(): string {
	return new Date().toISOString();
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

export const grievanceRoutes = new Hono<AppEnv>();

grievanceRoutes.get('/', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const rows =
		user.role === 'warden' ? listAllGrievanceRows(db) : listGrievanceRowsForStudent(db, user.id);
	return c.json({
		data: rows.map((row) => assembleGrievance(db, row))
	});
});

grievanceRoutes.post('/', async (c) => {
	const db = c.get('db');
	const uploadsDir = c.get('uploadsDir');
	const user = requireUser(c, db);
	if (user.role !== 'student') {
		throw new HttpError(403, 'unauthorized', 'Only students can file grievances.');
	}

	// Rate limit: max 20 grievance filings per 10 minutes per student
	const rate = checkRateLimit('create_grievance', user.id, 20, 600_000);
	if (!rate.allowed) {
		throw new HttpError(429, 'bad_request', 'Too many grievances filed. Please try again later.');
	}

	const contentType = c.req.header('content-type') ?? '';
	let rawTitle = '';
	let rawCategory = '';
	let rawDescription = '';
	let upload: File | undefined;

	if (contentType.includes('multipart/form-data')) {
		const body = await c.req.parseBody();
		rawTitle = readString(body.title) ?? '';
		rawCategory = readString(body.category) ?? '';
		rawDescription = readString(body.description) ?? '';
		if (body.file instanceof File) upload = body.file;
		else if (body.attachment instanceof File) upload = body.attachment;
	} else {
		let json: unknown;
		try {
			json = await c.req.json();
		} catch {
			throw new HttpError(400, 'bad_request', 'Request body must be JSON or multipart form data.');
		}
		if (!json || typeof json !== 'object') {
			throw new HttpError(400, 'bad_request', 'Request body must be JSON or multipart form data.');
		}
		rawTitle = readString('title' in json ? json.title : undefined) ?? '';
		rawCategory = readString('category' in json ? json.category : undefined) ?? '';
		rawDescription = readString('description' in json ? json.description : undefined) ?? '';
	}

	const trimmedTitle = rawTitle.trim();
	const trimmedDescription = rawDescription.trim();

	if (trimmedTitle.length < 5) {
		throw new HttpError(400, 'bad_request', 'Title must be at least 5 characters.');
	}
	if (trimmedTitle.length > 200) {
		throw new HttpError(400, 'bad_request', 'Title must not exceed 200 characters.');
	}
	if (trimmedDescription.length < 20) {
		throw new HttpError(400, 'bad_request', 'Description must be at least 20 characters.');
	}
	if (trimmedDescription.length > 10000) {
		throw new HttpError(400, 'bad_request', 'Description must not exceed 10000 characters.');
	}

	const parsedCategory = parseCategory(rawCategory);
	const sanitizedTitle = sanitizeText(trimmedTitle, 200);
	const sanitizedDescription = sanitizeText(trimmedDescription, 10000);

	const id = nextGrievanceId(db);
	const ts = nowIso();
	db.prepare(
		`INSERT INTO grievances (id, student_id, title, category, description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
	).run(id, user.id, sanitizedTitle, parsedCategory, sanitizedDescription, ts, ts);

	if (upload) {
		const bytes = await bufferFromUpload(upload);
		const stored = newStoredName(upload.type);
		writeStoredFile(uploadsDir, stored, bytes);
		db.prepare(
			`INSERT INTO attachments (id, grievance_id, original_filename, stored_filename, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
		).run(
			nextAttachmentId(db),
			id,
			originalBasename(upload.name),
			stored,
			upload.type,
			bytes.byteLength,
			ts
		);
		logSecurityEvent({
			type: 'upload_success',
			userId: user.id,
			resource: `/api/grievances/${id}`,
			detail: `Uploaded attachment: ${originalBasename(upload.name)} (${bytes.byteLength} bytes)`
		});
	}

	return c.json({ data: assembleGrievance(db, requireGrievance(db, id)) }, 201);
});

grievanceRoutes.get('/:id/comments', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = requireGrievance(db, c.req.param('id'));

	// Enforce authorization check to prevent IDOR on comments list
	assertCanViewGrievance(user, row);

	const comments = listCommentRows(db, row.id).map((comment) => {
		const authorRow = findUserById(db, comment.author_id);
		if (!authorRow) {
			throw new HttpError(500, 'internal', 'Internal server error.');
		}
		return toPublicComment(comment, toPublicUser(authorRow));
	});
	return c.json({ data: comments });
});

grievanceRoutes.post('/:id/comments', async (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = requireGrievance(db, c.req.param('id'));

	// Enforce authorization check before adding comments
	assertCanViewGrievance(user, row);

	// Rate limit comment postings (max 30 comments per 5 minutes per user)
	const rate = checkRateLimit('post_comment', user.id, 30, 300_000);
	if (!rate.allowed) {
		throw new HttpError(429, 'bad_request', 'Too many comments posted. Please try again later.');
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'JSON body is required.');
	}
	const text =
		body && typeof body === 'object' && 'body' in body && typeof body.body === 'string'
			? body.body.trim()
			: '';
	if (!text) {
		throw new HttpError(400, 'bad_request', 'Comment cannot be empty.');
	}
	if (text.length > 5000) {
		throw new HttpError(400, 'bad_request', 'Comment cannot exceed 5000 characters.');
	}

	// Server-side HTML entity escaping to eliminate Stored XSS
	const sanitizedBody = sanitizeText(text, 5000);

	const id = nextCommentId(db);
	const ts = nowIso();
	db.prepare(
		`INSERT INTO comments (id, grievance_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)`
	).run(id, row.id, user.id, sanitizedBody, ts);
	touchGrievance(db, row.id, ts);

	const author = findUserById(db, user.id);
	if (!author) {
		throw new HttpError(500, 'internal', 'Internal server error.');
	}
	const commentRow = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow;
	return c.json({ data: toPublicComment(commentRow, toPublicUser(author)) }, 201);
});

grievanceRoutes.post('/:id/attachments', async (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = requireGrievance(db, c.req.param('id'));
	if (user.role !== 'student' || row.student_id !== user.id) {
		logSecurityEvent({
			type: 'access_denied',
			userId: user.id,
			userRole: user.role,
			resource: `/api/grievances/${row.id}/attachments`,
			detail: 'Unauthorized attempt to attach file to grievance'
		});
		throw new HttpError(403, 'unauthorized', 'Only the student owner can add attachments.');
	}
	if (row.status === 'resolved') {
		throw new HttpError(409, 'conflict', 'Resolved grievances cannot be edited.');
	}

	const body = await c.req.parseBody();
	const upload = body.file instanceof File ? body.file : body.attachment instanceof File ? body.attachment : undefined;
	if (!upload) {
		throw new HttpError(400, 'bad_request', 'A file field named file is required.');
	}

	const bytes = await bufferFromUpload(upload);
	// Always use randomized safe name
	const stored = newStoredName(upload.type);
	const ts = nowIso();
	writeStoredFile(c.get('uploadsDir'), stored, bytes);
	const id = nextAttachmentId(db);
	db.prepare(
		`INSERT INTO attachments (id, grievance_id, original_filename, stored_filename, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
	).run(id, row.id, originalBasename(upload.name), stored, upload.type, bytes.byteLength, ts);
	touchGrievance(db, row.id, ts);

	logSecurityEvent({
		type: 'upload_success',
		userId: user.id,
		resource: `/api/grievances/${row.id}/attachments`,
		detail: `Uploaded additional attachment: ${originalBasename(upload.name)}`
	});

	const saved = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow;
	return c.json({ data: toPublicAttachment(saved) }, 201);
});

grievanceRoutes.get('/:id', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = requireGrievance(db, c.req.param('id'));

	// Enforce authorization check to prevent IDOR
	try {
		assertCanViewGrievance(user, row);
	} catch (err) {
		logSecurityEvent({
			type: 'access_denied',
			userId: user.id,
			userRole: user.role,
			resource: `/api/grievances/${row.id}`,
			detail: 'Unauthorized grievance retrieval attempt'
		});
		throw err;
	}

	return c.json({ data: assembleGrievance(db, row) });
});

grievanceRoutes.patch('/:id', async (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = requireGrievance(db, c.req.param('id'));

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}
	if (!body || typeof body !== 'object') {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}

	const title = 'title' in body ? body.title : undefined;
	const description = 'description' in body ? body.description : undefined;
	const category = 'category' in body ? body.category : undefined;
	const status = 'status' in body ? body.status : undefined;
	const wantsContent = title !== undefined || description !== undefined || category !== undefined;
	const wantsStatus = status !== undefined;

	if (!wantsContent && !wantsStatus) {
		throw new HttpError(400, 'bad_request', 'No updatable fields were provided.');
	}

	switch (user.role) {
		case 'student': {
			// Strict student ownership check to prevent BOLA / IDOR
			if (row.student_id !== user.id) {
				logSecurityEvent({
					type: 'access_denied',
					userId: user.id,
					userRole: user.role,
					resource: `/api/grievances/${row.id}`,
					detail: 'Student attempted to modify another student grievance'
				});
				throw new HttpError(403, 'unauthorized', 'You cannot modify this grievance.');
			}
			if (row.status === 'resolved') {
				throw new HttpError(409, 'conflict', 'Resolved grievances cannot be edited.');
			}
			if (wantsStatus) {
				throw new HttpError(403, 'unauthorized', 'Students cannot change grievance status.');
			}

			let nextTitle = row.title;
			let nextDescription = row.description;
			let nextCategory = row.category;
			let nextStatus: GrievanceStatusDb = row.status;

			if (title !== undefined) {
				if (typeof title !== 'string' || title.trim().length < 5) {
					throw new HttpError(400, 'bad_request', 'Title must be at least 5 characters.');
				}
				if (title.trim().length > 200) {
					throw new HttpError(400, 'bad_request', 'Title must not exceed 200 characters.');
				}
				nextTitle = sanitizeText(title.trim(), 200);
			}
			if (description !== undefined) {
				if (typeof description !== 'string' || description.trim().length < 20) {
					throw new HttpError(400, 'bad_request', 'Description must be at least 20 characters.');
				}
				if (description.trim().length > 10000) {
					throw new HttpError(400, 'bad_request', 'Description must not exceed 10000 characters.');
				}
				nextDescription = sanitizeText(description.trim(), 10000);
			}
			if (category !== undefined) {
				if (typeof category !== 'string') {
					throw new HttpError(400, 'bad_request', 'Invalid grievance category.');
				}
				nextCategory = parseCategory(category);
			}

			const ts = nowIso();
			db.prepare(
				'UPDATE grievances SET title = ?, description = ?, category = ?, status = ?, updated_at = ? WHERE id = ?'
			).run(nextTitle, nextDescription, nextCategory, nextStatus, ts, row.id);
			break;
		}
		case 'warden': {
			if (wantsContent) {
				throw new HttpError(403, 'unauthorized', 'Wardens cannot edit grievance content.');
			}
			if (typeof status !== 'string') {
				throw new HttpError(400, 'bad_request', 'Invalid grievance status.');
			}
			const nextStatus = statusToDb(status);
			const ts = nowIso();
			db.prepare('UPDATE grievances SET status = ?, updated_at = ? WHERE id = ?').run(
				nextStatus,
				ts,
				row.id
			);
			break;
		}
		default: {
			const _exhaustive: never = user.role;
			throw new HttpError(500, 'internal', 'Internal server error.');
			void _exhaustive;
		}
	}

	return c.json({ data: assembleGrievance(db, requireGrievance(db, row.id)) });
});
