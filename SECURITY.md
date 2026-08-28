# Security Architecture & Posture — HostelGrievance

## 1. Executive Summary

HostelGrievance has undergone a comprehensive pre-launch security hardening process. All security enforcement has been built **strictly on the backend**, maintaining complete compatibility with the **frozen Svelte 5 frontend** and adhering to the **local SQLite** database constraint (`data/hostel.db`).

The application enforces a **defense-in-depth / zero-trust architecture**: no client-supplied role, ownership, or parameter is trusted, every object access requires server-side validation, all user inputs are sanitized against injection and XSS, and uploaded attachments are strictly validated, randomized on disk, and sandboxed.

---

## 2. Core Security Models & Implementations

### 2.1 Authentication & Session Security
* **Password Key Derivation**: Uses Node.js `scryptSync` with a 16-byte cryptographically secure random salt and 64-byte key length (`scrypt:salt:hash`). Backward-compatible legacy SHA-256 validation is supported with timing-safe comparison.
* **Session Lifecycle**:
  * Generated with 32 bytes of cryptographically secure randomness (`randomBytes(32).toString('base64url')`).
  * Explicit expiration verification: `readSessionUser` checks `expires_at > nowIso()` and automatically prunes expired sessions.
  * Logout destruction: `POST /api/logout` invokes `destroySession(db, token)`, permanently deleting the session record from SQLite.
  * Cookie security flags: Cookies are issued with `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` (in production).
* **Brute-Force Rate Limiting**: In-memory sliding-window limiter on `/api/login` (max 10 attempts per minute per IP), returning HTTP 429 upon threshold breach.

### 2.2 Authorization & Object-Level Protection (BOLA/IDOR)
* **Principle of Least Privilege**:
  * **Students**: Can strictly list, view, and comment only on grievances matching their authenticated user ID (`row.student_id === user.id`). Cannot modify status or alter resolved grievances.
  * **Wardens**: Can view all grievances across the hostel, add official comments, and transition grievance statuses (`Open` -> `In Progress` -> `Resolved`), but cannot modify grievance titles, categories, or descriptions.
* **Granular Object Checks**:
  * `GET /api/grievances/:id`: `assertCanViewGrievance(user, row)` returns `403 Forbidden` for cross-tenant access.
  * `GET /api/grievances/:id/comments`: Checked for grievance view permissions.
  * `POST /api/grievances/:id/comments`: Checked for participation authorization.
  * `PATCH /api/grievances/:id`: Strict student ownership check; forbids student status changes; forbids warden content edits.
  * `GET /api/attachments/:id`: Parent grievance ownership verified prior to streaming file bytes.

### 2.3 File Upload & Storage Security
* **File Signature Verification**: `validateImageSignature` checks raw binary header magic bytes for JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), GIF (`GIF87a`/`GIF89a`), and WebP (`RIFF...WEBP`). Mismatched or spoofed extensions are rejected with HTTP 400.
* **Storage Isolation & Randomization**:
  * All files stored with random 16-byte hex identifiers (`newStoredName(mime)`) inside `uploads/`.
  * User-supplied filenames are never used for disk paths, neutralizing path traversal (`../`) and file overwrite attacks.
  * Canonical path resolution (`resolve(join(uploadsDir, storedName))`) strictly prevents directory escape.
* **Safe Serving Headers**:
  * `X-Content-Type-Options: nosniff`
  * `Content-Security-Policy: default-src 'none'; sandbox`
  * `Cache-Control: private, no-cache, no-store, must-revalidate`
  * Sanitized `Content-Disposition` header.

### 2.4 Stored XSS Mitigation
* Server-side HTML entity escaping (`sanitizeText`) converts `<`, `>`, `&`, `"`, `'`, and `/` into HTML character entities before database storage.
* Protects frontend views rendering `{@html comment.body}` without requiring frontend modifications.

### 2.5 Local SQLite Database Protection
* SQLite database file (`data/hostel.db`) is located outside public/static web directories.
* All queries use parameterized SQL prepared statements via `better-sqlite3`, preventing SQL injection.
* WAL mode and foreign key constraints are enforced on connection.
* Direct HTTP access to `.db`, `-wal`, `-shm`, and backup files is blocked.

### 2.6 HTTP Security & CORS
* CORS origin reflection with credentials is removed; restricted strictly to allowed frontend local origins (`http://localhost:5173`, `http://127.0.0.1:5173`).
* Global security headers applied to all responses:
  * `X-Content-Type-Options: nosniff`
  * `X-Frame-Options: DENY`
  * `Referrer-Policy: strict-origin-when-cross-origin`

### 2.7 Error Handling & Information Disclosure
* Centralized `handleError` catches all unhandled exceptions and returns a generic `{ error: "Internal server error.", code: "internal" }` on HTTP 500.
* Stack traces, database syntax errors, table names, and filesystem paths are never leaked to clients.

### 2.8 Security Visibility & Audit Logging
* Structured `[SECURITY AUDIT]` logs record authentication successes/failures, logouts, access denials, file uploads, and rate-limit triggers with timestamps, user IDs, roles, and IP addresses.

---

## 3. Assumptions & Operational Boundaries

1. **Deployment Environment**: Hosted behind a reverse proxy (e.g. Nginx, Caddy, or Node container) providing TLS/HTTPS termination in production.
2. **Filesystem Permissions**: The application process runs as a dedicated non-root user with write permissions restricted exclusively to `data/` and `uploads/`.
3. **Frontend Contract**: The frontend communicates via Vite proxy (`/api` -> port 3001) using session cookies (`credentials: 'include'`).

---

## 4. Residual Risks & Future Recommendations

| Residual Risk | Impact | Mitigating Factors | Recommended Future Enhancement |
| :--- | :--- | :--- | :--- |
| **In-Memory Rate Limiting in Clustered Mode** | Low | Single-instance deployment works reliably; limits resets on server restart. | Adopt Redis or SQLite-backed token bucket for multi-instance clusters. |
| **Local SQLite File Storage** | Low | Local storage matches challenge constraints; WAL mode handles concurrent reads/writes. | Implement automated off-site encrypted SQLite backup snapshots. |
| **Image EXIF Metadata** | Low | File magic bytes and dimensions are verified. | Strip EXIF GPS metadata server-side using Sharp or Canvas when image processing libraries are permitted. |

---

## 5. Security Verification Summary

* **Automated Test Suite**: 15/15 tests passing covering IDOR on grievances, comments, attachments, status changes, session invalidation, magic-byte validation, and XSS sanitization.
* **TypeScript Typecheck**: 0 errors, 0 warnings across frontend and server codebases.
