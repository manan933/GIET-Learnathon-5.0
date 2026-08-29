# Security Posture & Architecture — HostelGrievance

> **🌐 Live Production Deployment**: [https://giet-learnathon-5-0.onrender.com](https://giet-learnathon-5-0.onrender.com)

## 1. Executive Summary

HostelGrievance is a secure web application built for university hostel management. It allows students to submit maintenance issues and enables wardens to track, manage, and resolve them.

Our team applied a **defense-in-depth, zero-trust security model** to harden the application before launch. We treated the frontend browser as completely untrusted and enforced all security, authorization, and data encryption rules on the server.

All sensitive data is encrypted at rest, every API endpoint enforces strict user ownership checks, and an automated test suite validates all 26 implemented security controls.

---

## 2. Major Security Improvements (26 Implemented Controls)

### A. Authentication & Credential Security
* **Salted `scrypt` Key Derivation**: Passwords and 3-factor recovery keys are hashed with unique 128-bit random salts and verified via `timingSafeEqual` (eliminating rainbow table and side-channel timing attacks).
* **Progressive Account Lockout (10s / 15s)**: 3 failed attempts lock the account for 10 seconds; 5 failed attempts lock it for 15 seconds. Active sessions are automatically terminated upon lockout.
* **3-Factor Multi-Secret Recovery**: Allows students and wardens to recover accounts using 3 independent secret keys (Numeric PIN, Passphrase Word, and Symbol Key), each independently salted and hashed with `scrypt`.
* **Breached Credential Prevention ($k$-Anonymity)**: Integrates the HaveIBeenPwned API by sending only the first 5 characters of SHA-1 hashes, preventing users from setting compromised passwords without exposing credentials.
* **IP Rate Limiting (10 req/min)**: Restricts authentication attempts to 10 requests per minute per IP address to eliminate brute-force and DDoS hammering.

### B. Authorization & IDOR/BOLA Protection
* **Per-Object IDOR Enforcement**: Validates ticket ownership (`student_id === user.id`) on all viewing, editing, and commenting endpoints.
* **Warden Boundaries**: Wardens can manage statuses (`Open` $\rightarrow$ `In Progress` $\rightarrow$ `Resolved`), but are strictly blocked from modifying original student grievance text.
* **Protected File Downloads**: Direct attachment links are protected. The server checks parent grievance ownership before serving any file.
* **Resolved Grievance Locking**: Locks resolved grievances against modifications (`409 Conflict`).

### C. Data Encryption at Rest & Cloud Persistence
* **Column-Level AES-256-GCM Encryption**: Grievance titles, descriptions, and comments are encrypted with random 12-byte IVs and 16-byte authentication tags at rest (`enc:v1:`). Raw database dumps reveal zero plaintext.
* **Turso Cloud SQLite Replication**: Synchronizes encrypted SQLite data to Turso Cloud using 100% parameterized SQL prepared statements, ensuring permanent persistence and zero SQL injection risks.

### D. File Upload Security & Privacy Protection
* **Binary Magic Byte Inspection**: Inspects binary header bytes directly from file buffers to block executable scripts disguised as images.
* **In-Memory EXIF Metadata Stripping**: Automatically strips GPS location coordinates, camera models, and timestamp metadata from JPEG and PNG buffers before disk write.
* **Randomized Storage Names & CSP Sandboxing**: Files are stored with random hex names outside the web root and served with `Content-Security-Policy: default-src 'none'; sandbox` and `X-Content-Type-Options: nosniff`.

### E. Web Crawler, Browser & Anti-Tampering Defenses
* **AI & Web Crawler Blocking (`robots.txt`)**: Disallows indexing of `/student/`, `/warden/`, and `/api/` by search engines and AI scrapers (`GPTBot`, `Claude-Web`, `CCBot`, `Bytespider`).
* **Anti-Inspection Client Protections**: Intercepts right-click context menus, `F12`, `Ctrl+Shift+I/J/C`, and `Ctrl+U` in the DOM capture phase.
* **Anti-Clickjacking Frame Sandboxing**: Enforces `X-Frame-Options: DENY` across all HTTP responses to stop iframe UI redressing attacks.
* **Stored XSS Sanitization**: Automatically escapes HTML control characters (`<`, `>`, `&`, `"`, `'`) across all inputs before database write.

### F. Session Lifecycle & Security Auditing
* **`HttpOnly` & `Secure` Cookies**: Stores session tokens in `HttpOnly`, `SameSite=Lax`, and `Secure` cookies, preventing JavaScript access.
* **Instant Session Destruction**: Deletes session tokens from the database on logout and revokes all active sessions upon password reset.
* **Session Expiration Lifecycle**: Validates `expires_at` timestamps on every request, rejecting stale or abandoned sessions.
* **Real-Time Security & Activity Logs**: Maintains separated streams for User Activity Logs and Security Threat Logs.
* **Unregistered Account Probing Alerts**: Detects and logs failed login attempts on non-existent accounts with username and IP to Warden logs.
* **Geo-IP Location & Impossible Travel Math**: Tracks login geographic origins and calculates Haversine travel velocities, flagging impossible speed anomalies (> 800 km/h).
* **Information Disclosure Prevention**: Global error handlers return standardized JSON codes (`internal`, `bad_request`, `unauthorized`) hiding all stack traces and SQL errors.
* **RFC 9116 `security.txt`**: Implements `/.well-known/security.txt` for responsible security disclosure.

---

## 3. Core Assumptions

1. **Secure Transport (HTTPS)**: In production, the application runs behind TLS/HTTPS so session cookies marked `Secure` and `HttpOnly` cannot be intercepted over public Wi-Fi.
2. **Protected Server Environment**: The server host machine and environment variables (`ENCRYPTION_KEY`, `SESSION_SECRET`) are managed securely and not exposed to unauthorized users.
3. **Local Database Security**: The SQLite database file (`data/hostel.db`) is stored in a private directory accessible only by the application process.

---

## 4. Residual Risks & Next Steps

* **Distributed Botnet Attacks**: An attacker rotating through thousands of IP addresses could attempt slow credential stuffing across different accounts. The account-level lockout limits this risk, and adding Cloudflare WAF / Turnstile captcha in front of the login route provides complete edge defense.
* **Hardware Token Authentication**: Adding WebAuthn / FIDO2 security keys (like YubiKeys) for wardens would provide hardware-backed multi-factor authentication in future updates.
* **Database Backup Encryption**: Backups of the SQLite file should be encrypted at the storage level in addition to the column-level AES-256 encryption already protecting sensitive fields.
