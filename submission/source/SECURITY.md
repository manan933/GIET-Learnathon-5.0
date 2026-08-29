# Security Posture & Architecture — HostelGrievance

## 1. Executive Summary

HostelGrievance is a secure web application built for university hostel management. It allows students to submit maintenance issues and enables wardens to track, manage, and resolve them.

Our team applied a **defense-in-depth, zero-trust security model** to harden the application before launch. We treated the frontend browser as completely untrusted and enforced all security, authorization, and data encryption rules on the server.

All sensitive data is encrypted at rest, every API endpoint enforces strict user ownership checks, and an automated test suite validates all security controls.

---

## 2. Major Security Improvements

### A. Authentication & Account Protection
* **Salted `scrypt` Hashing**: All passwords and recovery keys are hashed with unique 128-bit random salts and verified using constant-time comparison (`timingSafeEqual`) to prevent timing attacks.
* **Progressive Lockout Defense**: 3 failed login attempts trigger an immediate 10-second account lockout. 5 failed attempts trigger a 15-second lockout. Active user sessions are terminated automatically upon lockout.
* **Breached Password Prevention**: Integrated HaveIBeenPwned via $k$-Anonymity to stop users from choosing passwords already leaked on the internet.
* **3-Factor Emergency Recovery**: Accounts can be securely recovered using three independent secrets (Numeric PIN, Passphrase Word, and Symbol Key), each salted and hashed independently.

### B. Strict Authorization (IDOR / BOLA Prevention)
* **Student Isolation**: Students can only view, comment on, and edit their own grievances. Access to any other student's ticket is strictly blocked with `403 Forbidden`.
* **Warden Boundaries**: Wardens can view grievances and update statuses, but cannot edit student complaint titles or descriptions.
* **Protected File Downloads**: Direct attachment links are protected. The server checks grievance ownership before sending any image to the user.

### C. Data Encryption at Rest (AES-256-GCM)
* Grievance titles, descriptions, and discussion comments are encrypted using **AES-256-GCM** before saving to SQLite and Turso Cloud.
* Even if an attacker downloads a copy of the database file, all complaint details remain encrypted and unreadable.
* Data is decrypted only in server memory for authorized users.

### D. Safe File Uploads & Privacy Protection
* **Content Validation**: File uploads are capped at 2MB, restricted to safe image formats, and verified using server-side magic byte inspection.
* **Automatic EXIF Stripping**: Photos taken by phones often contain GPS location coordinates. The server strips all metadata chunks from images before writing them to disk.
* **Random File Storage**: Uploaded files are stored with random filenames outside the web root to prevent path traversal and script execution.

### E. Real-Time Security Monitoring
* The server maintains an audit log of all security events: failed logins, account lockouts, impossible travel speeds, and unauthorized access attempts.
* Wardens and students have dedicated security dashboards to review alerts in real time.

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
