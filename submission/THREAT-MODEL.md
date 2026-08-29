# Threat Model & Attack Surface — HostelGrievance

> **🌐 Live Production Deployment**: [https://giet-learnathon-5-0.onrender.com](https://giet-learnathon-5-0.onrender.com)

This document outlines the threat model for the HostelGrievance application, identifying key assets, threat actors, trust boundaries, attack surface, and primary attack paths with their defenses.

---

## 1. Assets to Protect

The primary assets requiring protection in HostelGrievance include:

1. **Student Personal Information**: Student names, room numbers, emails, and grievance histories.
2. **Grievance Details**: Private complaint descriptions, maintenance issues, room access notes, and uploaded photos.
3. **Authentication Credentials**: User passwords, session tokens, and 3-factor recovery secrets.
4. **Warden Management Capabilities**: Administrative authority to update grievance status and view hostel-wide logs.
5. **Security & Audit Logs**: Historical records of logins, failed attempts, and unauthorized actions.
6. **Application Storage & Database**: The local SQLite database (`data/hostel.db`), uploads directory, and cryptographic keys.

---

## 2. Threat Actors

* **Unauthenticated Internet Attacker**: Anyone on the network probing public endpoints, attempting brute-force password guessing, credential stuffing, or uploading malicious files.
* **Malicious Authenticated Student**: A registered student who attempts to view or tamper with other students' grievances, alter status flags, inject malicious scripts (XSS), or access warden-only dashboards.
* **Compromised Account Attacker**: An adversary who has gained access to a valid student or warden session token.
* **Rogue Insider / Snooper**: A user trying to discover physical locations of students through image metadata (EXIF) or room maintenance reports.

---

## 3. Trust Boundaries

```
[ Untrusted Web Browser / Client / AI Crawlers ]
              │
              ▼  (HTTP / JSON Requests over TLS)
┌────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY 1: Edge, Network & Bot Defenses        │
│  - IP Rate Limiting (10 req / min per IP)              │
│  - Progressive Account Lockout (3 fails / 5 fails)     │
│  - Geo-IP Origin & Impossible Travel Anomaly Detection │
│  - AI Crawler / Scraper Blocking (`robots.txt`)        │
│  - Client Anti-Inspection & Anti-Clickjacking Frame CSP│
└─────────────────────────────┬──────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY 2: Authentication & Session Layer      │
│  - Session Token Validation (`readSessionUser`)        │
│  - Token Expiration & Cookie Security (`HttpOnly`)     │
│  - Salted Scrypt Password & 3-Factor Reset Engine      │
│  - HaveIBeenPwned k-Anonymity Credential Check         │
│  - Unregistered Account Attempt Alerting               │
└─────────────────────────────┬──────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY 3: Authorization & Object Security     │
│  - IDOR Ownership Checks (`student_id === user.id`)    │
│  - Parameter Whitelisting (Mass Assignment Defense)    │
│  - HTML Input Sanitization (Stored XSS Defense)        │
│  - Magic Byte Image Validation & EXIF Metadata Strip   │
│  - Protected Attachment Downloads with Sandbox CSP     │
└─────────────────────────────┬──────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY 4: Storage & Data Encryption Layer     │
│  - AES-256-GCM Column-Level Encryption at Rest         │
│  - Parameterized SQLite Queries (SQLi Prevention)      │
│  - Turso Cloud Distributed Persistence Synchronization │
│  - Isolated `uploads/` Storage with Random File Names  │
└────────────────────────────────────────────────────────┘
```

---

## 4. Attack Surface

The application exposes the following key entry points to clients:

| Entry Point | Method | Intended Purpose | Primary Threat | Mitigation Applied |
|:---|:---|:---|:---|:---|
| `/api/login` | `POST` | User authentication | Brute force, credential stuffing, impossible travel | Progressive account lockout (10s/15s), IP rate limits (10 req/min), Geo-IP anomaly alerts, unverified account logging. |
| `/api/logout` | `POST` | Session termination | Stale session reuse | Immediate session record deletion from database and cookie clearance. |
| `/api/auth/reset-password` | `POST` | Emergency password reset | Unauthorized account takeover | Requires 3 independent salted secrets (PIN + Word + Symbols) and checks HaveIBeenPwned. |
| `/api/grievances` | `GET` | List grievances | Data exposure | Students only receive their own rows; Wardens receive all. |
| `/api/grievances` | `POST` | Create a new grievance | Stored XSS, malicious file upload | Server-side text sanitization, 2MB file limit, magic byte validation, EXIF stripping. |
| `/api/grievances/:id` | `GET` | View grievance details | IDOR (reading others' tickets) | Server verifies ownership before returning data. AES-256 decrypted in memory. |
| `/api/grievances/:id` | `PATCH` | Edit grievance / update status | Privilege escalation | Students can only edit own open tickets; Wardens can only change status. Resolved tickets locked (`409`). |
| `/api/grievances/:id/comments` | `POST` | Add comment | BOLA / Unauthorized posting | Server verifies user owns grievance or is a warden. HTML content sanitized. |
| `/api/attachments/:id` | `GET` | Download photo | Direct object reference leak | Checks parent grievance authorization before serving file with `nosniff` and sandbox headers. |
| `/api/security-logs` | `GET` | View security alerts | Information disclosure | Scoped by role: students see only their account alerts; wardens see system threats. |
| `/api/audit` | `GET` | View activity audit logs | Log tampering / snooping | Role-scoped audit logs separated from security threat alerts. |
| `/robots.txt` | `GET` | Crawler policy | Search scraping of tickets | Disallows all AI bots and web scrapers from indexing `/student/`, `/warden/`, `/api/`. |
| `/.well-known/security.txt`| `GET`| Vulnerability reporting | Uncoordinated disclosures | RFC 9116 security disclosure policy and contact endpoints. |

---

## 5. Key Attack Paths & Defenses

### Attack Path 1: Brute-Force Password Takeover
* **Attack Scenario**: Attacker runs a wordlist attack against `student@example.test`.
* **Defense**: After 3 failed attempts, the account is locked for 10 seconds. After 5 failed attempts, it is locked for 15 seconds. Active sessions are terminated, and the event is written to the security log. Even if the correct password is entered during lockout, the login is blocked.

### Attack Path 2: IDOR / Snooping on Other Students' Tickets
* **Attack Scenario**: Student A inspects HTTP traffic, notices ticket `GRV-0003` belongs to Student B, and requests `GET /api/grievances/GRV-0003`.
* **Defense**: The server executes `assertCanViewGrievance(user, row)`. Since `row.student_id !== user.id`, the server immediately responds with `403 Forbidden` and logs an unauthorized access attempt.

### Attack Path 3: Malicious File Upload & EXIF Privacy Leak
* **Attack Scenario**: Attacker uploads a PHP/JS script renamed to `photo.png`, or uploads an image containing home GPS coordinates.
* **Defense**: The server validates file magic bytes to verify it is a genuine image, strips all EXIF metadata chunks, assigns a random filename, and stores it outside the web root.

### Attack Path 4: Database Leak / Physical File Dump
* **Attack Scenario**: An attacker gets a copy of `data/hostel.db` from disk.
* **Defense**: All password hashes use salted `scrypt`, and all grievance titles, descriptions, and comments are encrypted with AES-256-GCM. The raw database contains no plaintext complaint details.
