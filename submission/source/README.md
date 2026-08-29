# 🛡️ HostelGrievance — University Grievance Management System

> **🌐 Live Production Deployment**: [https://giet-learnathon-5-0.onrender.com](https://giet-learnathon-5-0.onrender.com)

A university hostel grievance portal built with a **Svelte 5** frontend and a hardened **Hono + SQLite** backend. This system implements a **Zero-Trust Architecture** with column-level **AES-256-GCM encryption at rest**, strict **IDOR/BOLA object authorization**, **progressive brute-force lockout**, **EXIF metadata stripping**, and **3-Factor Multi-Secret emergency account recovery**.

---

## 🔒 Security Architecture & Threat Analysis

### 1. What can be attacked?
An adversary targeting the portal could attempt attacks across multiple layers:
* **Authentication & Login**: Brute-force dictionary attacks, credential stuffing, and session hijacking.
* **Grievance Data & Comments**: Insecure Direct Object References (IDOR/BOLA) to read or tamper with complaints filed by other students.
* **File Uploads**: Uploading malicious scripts disguised as images or exploiting sensitive EXIF GPS location data.
* **Database Storage**: Dumping cleartext database tables containing private grievances and passwords.
* **User Interface**: Injecting Stored Cross-Site Scripting (XSS) payloads into complaint titles, descriptions, or comment threads.

#### Implemented Hardening Fixes:
* `fix-1` - Replaced unsalted hashes with **`scrypt`** key derivation with unique 128-bit random salts per user.
* `fix-2` - Enforced strict server-side **IDOR authorization** (`student_id === user.id`) on all ticket and comment routes.
* `fix-3` - Protected attachments with parent-grievance ownership checks and automatic **EXIF GPS metadata stripping**.
* `fix-4` - Encrypted grievance titles, descriptions, and comments with **AES-256-GCM** at rest (`enc:v1:<iv>:<tag>:<cipher>`).
* `fix-5` - Automatically sanitized all text fields against **Stored XSS** by escaping HTML control characters (`<`, `>`, `&`, `"`, `'`).

---

### 2. What should the application trust?
The application establishes trust strictly through cryptographic proofs and verified server-side state:
* **Cryptographic Verification**: Only inputs validated against salted `scrypt` hashes, constant-time comparisons (`timingSafeEqual`), and verified AES-256-GCM authentication tags are trusted.
* **Server-Side Session State**: Active session records in the database with validated expiration timestamps.
* **Environment Secrets**: Cryptographically secure keys (`ENCRYPTION_KEY`, `SESSION_SECRET`) loaded into memory at startup.
* **Database Relational Integrity**: User roles and ownership bindings stored securely in the SQLite database.

#### Implemented Hardening Fixes:
* `fix-1` - Replaced string comparisons with **`crypto.timingSafeEqual`** to prevent side-channel timing attacks during password and recovery verification.
* `fix-2` - Added automatic session expiration validation (`expires_at`) and instant token destruction on logout and password reset.
* `fix-3` - Restricted database queries to parameterized SQL statements to eliminate SQL injection vulnerabilities.

---

### 3. What should it never trust?
The application operates on a **Zero-Trust Model** regarding all external and client-side inputs:
* **The Client Browser & Frontend State**: Client-side validations, route guards, and hidden form fields can be easily bypassed by direct HTTP requests (e.g., Postman, cURL).
* **User-Supplied Text**: Complaint titles, descriptions, room numbers, and comment bodies are treated as untrusted.
* **File Metadata & MIME Types**: Client-supplied filenames, Content-Type headers, and file extensions cannot be trusted.
* **Incoming HTTP Headers**: Unfiltered IP and geolocation headers cannot be trusted without rate-limiting and spoofing defenses.

#### Implemented Hardening Fixes:
* `fix-1` - Moved all business authorization logic to the server; the backend never relies on client role headers.
* `fix-2` - Validated file magic bytes directly from binary buffers to verify true image signatures (JPEG/PNG/WebP/GIF) independent of client headers.
* `fix-3` - Assigned server-generated random filenames (`<randomHex>.<ext>`) and stored files outside the publicly served web root with `X-Content-Type-Options: nosniff`.
* `fix-4` - Enforced IP rate limits (30 req/min) and progressive account lockout on failed authentication attempts.

---

### 4. What can an authenticated user access?
Access is partitioned with granular role-based and object-level permissions:

#### Student Permissions:
* Can view, edit, and comment **only on their own grievances**.
* Can upload and download attachments **only for their own grievances**.
* Can view account security logs and reset their password using **3-Factor Multi-Secret Recovery**.
* **Forbidden**: Accessing other students' grievances, modifying ticket statuses, or accessing warden management routes.

#### Warden Permissions:
* Can view all grievances filed across the hostel to coordinate maintenance.
* Can update grievance statuses (`Open` $\rightarrow$ `In Progress` $\rightarrow$ `Resolved`) and post official comments.
* Can view system-wide threat and security incidents (including failed logins and unregistered account attempts).
* **Forbidden**: Altering or tampering with the original text written by students.

#### Implemented Hardening Fixes:
* `fix-1` - Implemented `assertCanViewGrievance` middleware returning `403 Forbidden` for unauthorized ticket or comment access.
* `fix-2` - Protected `GET /api/attachments/:id` by inspecting parent grievance ownership before serving images.
* `fix-3` - Blocked wardens from altering grievance titles or descriptions during status updates.

---

### 5. What happens if an attacker bypasses one security control?
The system utilizes **Defense-in-Depth** to ensure that the failure of any single control does not result in a total compromise:
* **If an attacker obtains stolen credentials**: They cannot access other students' records due to strict per-user IDOR authorization checks.
* **If an attacker downloads the raw SQLite database**: All grievance titles, descriptions, and comments remain unreadable ciphertext encrypted with AES-256-GCM. Passwords remain protected behind salted `scrypt` hashes.
* **If an attacker bypasses file extension checks**: The server rejects the file via magic byte inspection; even if stored, the file cannot be executed because it is stored outside the web root with randomized names.
* **If an attacker attempts automated brute force**: The account-level lockout locks the target account after 3 attempts (10s) and 5 attempts (15s), while automatically invalidating all active sessions.

#### Implemented Hardening Fixes:
* `fix-1` - Combined column-level AES-256-GCM encryption with database filesystem access controls.
* `fix-2` - Linked account lockout to automated session termination to immediately revoke access upon suspicious hammering.
* `fix-3` - Structured security event logging to alert administrators in real time to anomalous activity.

---

## 👥 Demo Credentials

| Role | Email | Password | Room |
| :--- | :--- | :--- | :--- |
| **Student (Aarav)** | `student@example.test` | `student123` | B-204 |
| **Student (Priya)** | `priya@example.test` | `student123` | A-112 |
| **Student (Rohan)** | `rohan@example.test` | `student123` | C-008 |
| **Warden (Mr. Sahu)** | `warden@example.test` | `warden123` | Admin |

### 🔑 3-Factor Multi-Secret Emergency Recovery Keys
* **Factor 1 (Numeric PIN)**: `849201`
* **Factor 2 (Passphrase Word)**: `HostelMasterAdmin`
* **Factor 3 (Symbol Key)**: `@#*&$!`

---

## 🚀 Quick Start & Development

### 1. Installation
```bash
git clone https://github.com/manan933/GIET-Learnathon-5.0.git
cd GIET-Learnathon-5.0
npm install
```

### 2. Database Initialization
```bash
npm run db:reset
```

### 3. Run Locally
```bash
# Starts Frontend (Vite :5173) and API (Hono :3001) concurrently
npm run dev:all
```

---

## 🧪 Verification & Testing

Execute the comprehensive automated test suite (19 passing security & API tests):
```bash
npm test
```

Execute TypeScript strict typecheck:
```bash
npm run typecheck
```

---

## 📁 Repository & Submission Structure

```text
submission/
├── HARDENING.md         # Vulnerability register table (ID, Finding, Risk, Change, Verification, Residual Risk)
├── SECURITY.md          # Security posture, defense-in-depth, assumptions & residual risks
├── THREAT-MODEL.md      # Assets, actors, trust boundaries diagram, and attack surface
├── deployment/          # Dockerfile, render.yaml, and deployment instructions
├── source/              # Hardened application source code
└── TEST-EVIDENCE/       # Test logs & verification output
```
