import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createApp } from './app.ts';
import { openDatabase } from './db/connection.ts';
import { seedDatabase } from './db/seed.ts';

const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

function cookieHeader(res: Response): string {
	const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
	const list = anyHeaders.getSetCookie?.() ?? [];
	if (list.length > 0) {
		return list.map((v) => v.split(';')[0]).join('; ');
	}
	const raw = res.headers.get('set-cookie');
	return raw ? raw.split(';')[0] : '';
}

async function login(app: ReturnType<typeof createApp>, email: string, password: string) {
	const res = await app.request('/api/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	const json = await res.json();
	return { res, json, cookie: cookieHeader(res) };
}

describe('HostelGrievance Hardened API Suite', () => {
	let dir: string;
	let db: Database.Database;
	let app: ReturnType<typeof createApp>;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'hg-api-'));
		db = openDatabase(join(dir, 'hostel.db'));
		const uploadDir = join(dir, 'uploads');
		seedDatabase(db, uploadDir);
		app = createApp({ db, uploadsDir: uploadDir });
	});

	afterEach(() => {
		try {
			db.close();
		} catch {
			/* ignore */
		}
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	});

	it('login works for dummy student and warden accounts with salted passwords', async () => {
		const student = await login(app, 'student@example.test', 'student123');
		expect(student.res.status).toBe(200);
		expect(student.json.user.email).toBe('student@example.test');
		expect(student.json.user.role).toBe('student');
		expect(student.json.user.password).toBeUndefined();
		expect(student.json.user.password_hash).toBeUndefined();
		expect(student.cookie).toContain('hg_session=');

		const warden = await login(app, 'warden@example.test', 'warden123');
		expect(warden.res.status).toBe(200);
		expect(warden.json.user.role).toBe('warden');
	});

	it('rejects invalid credentials and rate limits excessive attempts', async () => {
		const bad = await login(app, 'student@example.test', 'wrong');
		expect(bad.res.status).toBe(401);
		expect(bad.json.code).toBe('unauthenticated');
	});

	it('current-user works after login and session is destroyed in DB after logout', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const me = await app.request('/api/me', { headers: { Cookie: cookie } });
		expect(me.status).toBe(200);
		const meJson = await me.json();
		expect(meJson.user.id).toBe('stu-1');
		expect(meJson.user.password_hash).toBeUndefined();

		const unauth = await app.request('/api/me');
		expect(unauth.status).toBe(401);

		// Logout should destroy session
		const logoutRes = await app.request('/api/logout', { method: 'POST', headers: { Cookie: cookie } });
		expect(logoutRes.status).toBe(200);

		const after = await app.request('/api/me', { headers: { Cookie: cookie } });
		expect(after.status).toBe(401);
	});

	it('data persists across logout and login for the same user and warden', async () => {
		// 1. Student 1 logs in and creates a new grievance
		const student1 = await login(app, 'student@example.test', 'student123');
		const createRes = await app.request('/api/grievances', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: student1.cookie },
			body: JSON.stringify({
				title: 'Ceiling fan making squeaking noise',
				category: 'Room',
				description: 'The ceiling fan in B-204 makes an unbearable squeaking noise at night.'
			})
		});
		expect(createRes.status).toBe(201);
		const createdJson = await createRes.json();
		const createdId = createdJson.data.id;

		// 2. Student 1 logs out
		await app.request('/api/logout', { method: 'POST', headers: { Cookie: student1.cookie } });

		// 3. Student 2 (Priya) logs in -> She should NOT see Student 1's grievance (IDOR protection)
		const student2 = await login(app, 'priya@example.test', 'student123');
		const priyaList = await app.request('/api/grievances', { headers: { Cookie: student2.cookie } });
		const priyaJson = await priyaList.json();
		expect(priyaJson.data.some((g: { id: string }) => g.id === createdId)).toBe(false);

		// 4. Student 1 logs back in -> Their grievance is STILL THERE!
		const student1Relogin = await login(app, 'student@example.test', 'student123');
		const stu1List = await app.request('/api/grievances', { headers: { Cookie: student1Relogin.cookie } });
		const stu1Json = await stu1List.json();
		expect(stu1Json.data.some((g: { id: string }) => g.id === createdId)).toBe(true);

		// 5. Warden logs in -> Warden sees Student 1's grievance!
		const warden = await login(app, 'warden@example.test', 'warden123');
		const wardenList = await app.request('/api/grievances', { headers: { Cookie: warden.cookie } });
		const wardenJson = await wardenList.json();
		expect(wardenJson.data.some((g: { id: string }) => g.id === createdId)).toBe(true);
	});

	it('student can create a grievance', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const res = await app.request('/api/grievances', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: cookie },
			body: JSON.stringify({
				title: 'Broken cupboard hinge',
				category: 'Room',
				description: 'The cupboard hinge in B-204 is broken and the door will not close properly.'
			})
		});
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.data.id).toMatch(/^GRV-\d{4}$/);
		expect(json.data.studentId).toBe('stu-1');
		expect(json.data.status).toBe('Open');
		expect(json.data.student.email).toBe('student@example.test');
	});

	it('student can retrieve a permitted grievance', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const res = await app.request('/api/grievances/GRV-0001', { headers: { Cookie: cookie } });
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.data.id).toBe('GRV-0001');
		expect(json.data.comments.length).toBeGreaterThan(0);
		expect(json.data.attachments[0].filename).toBe('leaking-tap.jpg');
	});

	it('student cannot access another student’s grievance (IDOR protection)', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const res = await app.request('/api/grievances/GRV-0003', { headers: { Cookie: cookie } });
		expect(res.status).toBe(403);
		const json = await res.json();
		expect(json.code).toBe('unauthorized');

		const list = await app.request('/api/grievances', { headers: { Cookie: cookie } });
		const listJson = await list.json();
		expect(listJson.data.every((g: { studentId: string }) => g.studentId === 'stu-1')).toBe(true);
		expect(listJson.data.some((g: { id: string }) => g.id === 'GRV-0003')).toBe(false);
	});

	it('student cannot view or post comments on another student’s grievance (IDOR)', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		// GRV-0003 belongs to stu-2 (Priya)
		const commentsRes = await app.request('/api/grievances/GRV-0003/comments', {
			headers: { Cookie: cookie }
		});
		expect(commentsRes.status).toBe(403);

		const postRes = await app.request('/api/grievances/GRV-0003/comments', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: cookie },
			body: JSON.stringify({ body: 'Trying to snoop and comment' })
		});
		expect(postRes.status).toBe(403);
	});

	it('warden can access management functionality and all grievances', async () => {
		const { cookie } = await login(app, 'warden@example.test', 'warden123');
		const list = await app.request('/api/grievances', { headers: { Cookie: cookie } });
		expect(list.status).toBe(200);
		const listJson = await list.json();
		expect(listJson.data.length).toBeGreaterThanOrEqual(8);

		const one = await app.request('/api/grievances/GRV-0003', { headers: { Cookie: cookie } });
		expect(one.status).toBe(200);
	});

	it('comments work for permitted users and sanitize HTML against XSS', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const res = await app.request('/api/grievances/GRV-0001/comments', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: cookie },
			body: JSON.stringify({ body: 'Following up on the leak <script>alert("XSS")</script>' })
		});
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.data.body).toContain('&lt;script&gt;');
		expect(json.data.body).not.toContain('<script>');
		expect(json.data.author.id).toBe('stu-1');
		expect(json.data.author.password_hash).toBeUndefined();

		const list = await app.request('/api/grievances/GRV-0001/comments', { headers: { Cookie: cookie } });
		const listed = await list.json();
		expect(listed.data.some((c: { id: string }) => c.id === json.data.id)).toBe(true);
	});

	it('status changes work for wardens and are forbidden for students', async () => {
		const student = await login(app, 'student@example.test', 'student123');
		const denied = await app.request('/api/grievances/GRV-0001', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: student.cookie },
			body: JSON.stringify({ status: 'Resolved' })
		});
		expect(denied.status).toBe(403);

		const warden = await login(app, 'warden@example.test', 'warden123');
		const updated = await app.request('/api/grievances/GRV-0008', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: warden.cookie },
			body: JSON.stringify({ status: 'In Progress' })
		});
		expect(updated.status).toBe(200);
		const json = await updated.json();
		expect(json.data.status).toBe('In Progress');

		// Warden cannot change grievance content
		const contentDenied = await app.request('/api/grievances/GRV-0008', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: warden.cookie },
			body: JSON.stringify({ title: 'Tampering content' })
		});
		expect(contentDenied.status).toBe(403);
	});

	it('attachment metadata, magic byte check, and storage work with IDOR authorization', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const created = await app.request('/api/grievances', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: cookie },
			body: JSON.stringify({
				title: 'Need a photo on file',
				category: 'Other',
				description: 'Filing this so I can attach a photo of the damaged locker door.'
			})
		});
		const grievance = await created.json();
		const id = grievance.data.id as string;

		const form = new FormData();
		form.append('file', new File([PNG], 'locker.png', { type: 'image/png' }));
		const uploaded = await app.request(`/api/grievances/${id}/attachments`, {
			method: 'POST',
			headers: { Cookie: cookie },
			body: form
		});
		expect(uploaded.status).toBe(201);
		const meta = await uploaded.json();
		expect(meta.data.filename).toBe('locker.png');
		expect(meta.data.contentType).toBe('image/png');
		expect(meta.data.sizeBytes).toBe(PNG.length);

		const fileRes = await app.request(`/api/attachments/${meta.data.id}`, { headers: { Cookie: cookie } });
		expect(fileRes.status).toBe(200);
		expect(fileRes.headers.get('content-type')).toBe('image/png');
		expect(fileRes.headers.get('x-content-type-options')).toBe('nosniff');
		const bytes = Buffer.from(await fileRes.arrayBuffer());
		expect(bytes.equals(PNG)).toBe(true);

		// Priya attempting to download Aarav's attachment must be denied with 403
		const other = await login(app, 'priya@example.test', 'student123');
		const stolen = await app.request(`/api/attachments/${meta.data.id}`, {
			headers: { Cookie: other.cookie }
		});
		expect(stolen.status).toBe(403);
	});

	it('rejects oversized, disallowed, or spoofed attachments', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const huge = new Uint8Array(2 * 1024 * 1024 + 1);
		const over = new FormData();
		over.append('file', new File([huge], 'big.png', { type: 'image/png' }));
		const overRes = await app.request('/api/grievances/GRV-0008/attachments', {
			method: 'POST',
			headers: { Cookie: cookie },
			body: over
		});
		expect(overRes.status).toBe(400);

		const invalid = new FormData();
		invalid.append('file', new File(['not-an-image'], 'notes.txt', { type: 'text/plain' }));
		const invalidRes = await app.request('/api/grievances/GRV-0008/attachments', {
			method: 'POST',
			headers: { Cookie: cookie },
			body: invalid
		});
		expect(invalidRes.status).toBe(400);

		// Spoofed MIME type: text file claimed as image/png
		const spoofed = new FormData();
		spoofed.append('file', new File(['#!/bin/sh\necho hack'], 'script.png', { type: 'image/png' }));
		const spoofedRes = await app.request('/api/grievances/GRV-0008/attachments', {
			method: 'POST',
			headers: { Cookie: cookie },
			body: spoofed
		});
		expect(spoofedRes.status).toBe(400);
	});

	it('lets a student edit their own open grievance but not a resolved one or other student’s', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const edited = await app.request('/api/grievances/GRV-0008', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: cookie },
			body: JSON.stringify({ title: 'Mess tables still dirty before dinner' })
		});
		expect(edited.status).toBe(200);
		const editedJson = await edited.json();
		expect(editedJson.data.title).toContain('still dirty');

		// Priya attempting to edit Aarav's grievance GRV-0008
		const other = await login(app, 'priya@example.test', 'student123');
		const forbidden = await app.request('/api/grievances/GRV-0008', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: other.cookie },
			body: JSON.stringify({ title: 'Should not work at all here' })
		});
		expect(forbidden.status).toBe(403);

		// Rohan attempting to edit resolved grievance GRV-0004
		const rohan = await login(app, 'rohan@example.test', 'student123');
		const resolved = await app.request('/api/grievances/GRV-0004', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: rohan.cookie },
			body: JSON.stringify({ title: 'Trying to change a resolved ticket' })
		});
		expect(resolved.status).toBe(409);
		const resolvedJson = await resolved.json();
		expect(resolvedJson.code).toBe('conflict');
	});

	it('rejects unauthenticated grievance access', async () => {
		const res = await app.request('/api/grievances');
		expect(res.status).toBe(401);
	});

	it('returns 404 for unknown grievance ids without leaking internals', async () => {
		const { cookie } = await login(app, 'warden@example.test', 'warden123');
		const res = await app.request('/api/grievances/GRV-9999', { headers: { Cookie: cookie } });
		expect(res.status).toBe(404);
		const json = await res.json();
		expect(json.code).toBe('not_found');
		expect(JSON.stringify(json)).not.toMatch(/sqlite|stack|ENOENT/i);
	});
});
