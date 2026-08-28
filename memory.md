# Pre-Launch Security Hardening — HostelGrievance

## 1. Mission

HostelGrievance is a university web application used to manage hostel grievances.

Students can:
* Sign in
* Create grievances
* View and track their own grievances
* Add comments and supporting information
* Upload supporting attachments

Wardens can:
* Sign in
* Review grievances
* Communicate with students
* Add comments
* Update grievance status
* Access information necessary for their warden responsibilities

The application is scheduled for public deployment tomorrow.

The task is to act as the security engineering team responsible for the final pre-launch hardening of the application.
The objective is to reduce the application's blast radius as far as practically possible while preserving all existing legitimate Student and Warden functionality.

---

## 2. CRITICAL IMPLEMENTATION CONSTRAINTS

### 2.1 FRONTEND MUST NOT CHANGE
The existing frontend is frozen.

**Do not modify:**
* Frontend source code (`src/routes/**`, `src/lib/components/**`, `src/lib/stores/**`, etc.)
* UI components
* Pages
* Routes used by the frontend
* Styling
* Layout
* Client-side validation behaviour
* Existing frontend workflows
* Frontend authentication flow unless a backend-side change is strictly required for compatibility
* API request formats unless absolutely necessary

**Rules:**
* Do not add frontend security controls that require changing the existing frontend.
* Do not redesign the interface.
* Do not remove features from the interface.
* Do not solve a security problem by hiding functionality in the frontend.
* The existing frontend must continue working against the hardened backend.

**Security principle:**
* The frontend is untrusted. All security-sensitive decisions must be enforced server-side.
* Treat every request arriving at the backend as attacker-controlled except for security properties established and verified server-side.

---

### 2.2 DATABASE MUST BE LOCAL SQLITE ONLY
The application must use a local SQLite database (`data/hostel.db`).

**Forbidden:**
* PostgreSQL, MySQL, MariaDB, MongoDB, Supabase, Firebase, Neon, PlanetScale, MongoDB Atlas, or any hosted/online/external database service.

**SQLite security requirements:**
* Keep the database outside publicly served/static directories.
* Prevent direct HTTP access to the `.db` file, `-wal`, `-shm`, journal, and backup files.
* Restrict filesystem permissions.
* Ensure only the application process/user has the required database access.
* Avoid unnecessary write permissions elsewhere on the filesystem.
* Never expose the database path or raw SQL errors through responses.
* Never store secrets unnecessarily in the database.
* Use parameterized queries.
* Apply server-side authorization before database records are returned or modified.

---

## 3. ALLOWED CHANGE SCOPE

Security changes may be made to:
* Backend application code (`src/server/**`)
* API handlers / controllers / routes (`src/server/routes/**`)
* Authentication & session handling (`src/server/auth/**`)
* Authorization & object-level permissions
* Middleware & input validation
* Database access & SQLite queries (`src/server/db/**`)
* File upload handling, storage, and retrieval (`src/server/storage/**`)
* Filesystem permissions
* HTTP security configuration & headers
* Cookies & CSRF protection
* Rate limiting & abuse prevention
* Logging & audit logging
* Error handling & information disclosure defenses
* Secrets & runtime configuration
* Container / deployment configuration
* Security testing (`src/server/app.test.ts` and new test suites)
* Documentation (`SECURITY.md`, `THREAT-MODEL.md`, `HARDENING.md`, `TEST-EVIDENCE/`, `submission/`)

---

## 4. PRIMARY SECURITY OBJECTIVE & BLAST-RADIUS REDUCTION

Reduce the application's blast radius to the smallest practical boundary:
1. **What does the application trust?**
2. **What must never be trusted?**
3. **What happens if that control fails?**
4. **What additional control prevents the attacker from moving further?**
5. **What data or capability remains exposed after that failure?**

Assume controls can fail independently:
* If authentication is bypassed, authorization must still protect other users' data.
* If authorization fails, database access must still be constrained.
* If file upload validation is bypassed, the file must not become executable.
* If user controls a filename, it must not control the filesystem path.
* If a session is stolen, it must not permit privilege escalation.
* If the application process is compromised, filesystem, database, and network boundaries must minimize lateral movement.

---

## 5. THREAT MODEL & ACTORS

### Assets to Protect:
* Student & Warden account information
* Authentication / session credentials
* Grievance records & comments
* Attachment files & attachment metadata
* Personal information contained in grievances
* Warden-only information
* SQLite database file, WAL/SHM temp files
* Application / session secrets
* Server filesystem & source code
* Logs & audit records
* Runtime environment

### Actors:
* **Normal Student**: Authenticate, create/view own grievances, add comments, upload/view own attachments. Must not access/modify others' data or warden tools.
* **Normal Warden**: Review all grievances, communicate via comments, update status, view authorized attachments.
* **Malicious Student**: Authenticated student attempting IDOR/BOLA, parameter tampering, XSS injection, path traversal, privilege escalation, or resource exhaustion.
* **Unauthenticated Attacker**: Probing public endpoints, brute-forcing login, crafting forged sessions, attempting file injection.
* **Compromised Session Attacker**: Possesses stolen session token; permissions must be strictly constrained to associated account.
* **Compromised Application Process**: Minimized filesystem/database/network privileges to prevent lateral movement.

---

## 6. TRUST BOUNDARIES

```
Browser 
  ──> Frozen Frontend 
    ──> Authentication / Session Boundary 
      ──> Backend / API Router 
        ──> Authorization & Object Access Layer 
          ──> SQLite Database 
          ──> Filesystem (Uploads Storage)
        ──> Process / Container Runtime
          ──> Network
```

---

## 7. DETAILED SECURITY REQUIREMENTS & ACTION PLAN

### A. Authentication & Session Security
* **Password Hashing**: Replace weak unsalted SHA-256 with strong hashing (e.g. Scrypt / PBKDF2 / Argon2id) with unique salts, maintaining compatibility with seed credentials.
* **Session Lifecycle**:
  * Verify `expires_at` against current time in `readSessionUser`.
  * Fully delete session token from SQLite database upon logout (`destroySession`).
  * Enforce secure cookie attributes: `HttpOnly`, `SameSite=Lax` (or `Strict`), `Path=/`, and `Secure` (when in HTTPS/production).
  * Generate cryptographically secure, unpredictable session tokens.
  * Implement rate limiting on `/api/login` to prevent brute-force attacks.

### B. Authorization & IDOR/BOLA Protection (Top Priority)
* **Grievance Viewing (`GET /api/grievances/:id`)**: Enforce `assertCanViewGrievance(user, row)` server-side.
* **Grievance Modification (`PATCH /api/grievances/:id`)**:
  * For students: enforce strict ownership check (`row.student_id === user.id`) and prevent editing resolved grievances.
  * For wardens: allow only status updates; reject attempts to modify content fields.
  * For students: forbid changing status (or restrict transitions according to business rules).
* **Comment Access & Creation (`GET /api/grievances/:id/comments`, `POST /api/grievances/:id/comments`)**:
  * Enforce grievance view authorization before returning comments.
  * For comment submission: ensure only authorized participants (warden or the owning student) can post comments on the grievance.
* **Attachment Access (`GET /api/attachments/:id`)**:
  * Look up attachment, fetch parent grievance, and enforce `assertCanViewGrievance(user, grievanceRow)`.
  * Return 403/404 for unauthorized access attempts.

### C. Mass Assignment & Parameter Tampering
* Explicitly allowlist writable fields in every endpoint.
* Prevent users from setting `role`, `user_id`, `id`, `created_at`, `status`, or student ownership.

### D. File Upload & Storage Security
* **File Validation**:
  * Enforce strict size limits (max 2 MB per file, overall request limits).
  * Validate MIME types against allowed list (`image/jpeg`, `image/png`, `image/gif`, `image/webp`).
  * Verify file magic bytes / signatures server-side.
  * Sanitize original filenames and strip directory traversal sequences, null bytes, control characters.
* **File Storage**:
  * Always use server-generated random storage names (e.g. `<randomHex>.<ext>`) — never use client-provided names directly on disk.
  * Restrict uploads to designated `uploads/` directory; strictly enforce path containment with absolute path resolution.
* **File Retrieval & Consumption**:
  * Serve files with `X-Content-Type-Options: nosniff`.
  * Set appropriate `Content-Disposition` and `Content-Security-Policy` headers to prevent stored XSS or HTML/SVG execution.

### E. Stored XSS & Content Injection
* Sanitize or escape all user-supplied text (titles, descriptions, comments, filenames) server-side before storing or returning them, neutralizing HTML/script tags.

### F. HTTP Security & CORS
* Disallow wildcard/reflected origin CORS with credentials:
  * Restrict CORS origin to trusted local origin (`http://localhost:5173`, `http://127.0.0.1:5173`, etc.) or same-origin.
* Add standard security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

### G. Error Handling & Information Leakage
* Catch all unexpected server errors in `handleError` and return generic `{ error: "Internal server error.", code: "internal" }`.
* Never expose stack traces, SQLite messages, table names, or filesystem paths to clients.

### H. Rate Limiting & Resource Exhaustion Protection
* Implement in-memory rate limiting for sensitive endpoints (login, file uploads, ticket/comment creation).
* Cap body payload sizes to prevent Denial of Service.

### I. Logging & Security Visibility
* Log security events (login success/failure, logout, access denials, rate-limit hits, file upload/rejection) with timestamps, user IDs, IP context, and error codes.
* Never log passwords, tokens, or session secrets.

---

## 8. REGRESSION & COMPATIBILITY REQUIREMENTS

Legitimate workflows MUST continue functioning seamlessly:
* **Student**: Login -> View Dashboard -> View My Grievances -> Create Grievance with optional image -> View Grievance details -> Add Comment -> Download/View Attachment -> Track Status.
* **Warden**: Login -> View Warden Dashboard -> View All Grievances -> Open Grievance details -> Add Comment -> View Attachment -> Update Status (Open / In Progress / Resolved).

---

## 9. SUBMISSION DELIVERABLES STRUCTURE

```text
submission/
├── source/
│   └── (hardened application source code)
├── deployment/
│   └── (deployment scripts, Dockerfile, docker-compose, or setup scripts)
├── SECURITY.md
├── THREAT-MODEL.md
├── HARDENING.md
└── TEST-EVIDENCE/
    └── (automated test results, before/after evidence, verification logs)
```

### Format for HARDENING.md:
```markdown
| ID | Finding | Risk | Change | Verification | Residual Risk |
|----|---------|------|--------|--------------|---------------|
| H-01 | ... | ... | ... | ... | ... |
```

---
*File created and retained in memory for full project security hardening.*
