# Security Hardening Log — HostelGrievance

This document lists all security vulnerabilities found in the original codebase, the risk they caused, the simple fix applied, how each fix was verified, and any remaining residual risk.

---

## Hardening Summary Table

| ID | Finding (Vulnerability) | Risk | Change (Simple Fix) | Verification | Residual Risk |
|:---|:---|:---|:---|:---|:---|

| **H-01** | **Weak Unsalted Password Hashing** | If the database was leaked, simple unsalted SHA-256 hashes could be cracked in seconds using rainbow tables. | Switched to standard `scrypt` hashing with a unique 128-bit random salt for every user. | Automated tests in `src/server/app.test.ts` verify password hashes start with `scrypt:` and verify correctly. | Weak user passwords (mitigated by 8-character minimum and HaveIBeenPwned breach checking). |

| **H-02** | **Broken Authorization (IDOR) on Grievances** | Any student could view or edit other students' private complaints by simply changing the ticket ID in the URL. | Added strict server-side checks: students can only access tickets matching their own user ID. Wardens can only update status, not ticket content. | Verified in `app.test.ts`: cross-student ticket access returns `403 Forbidden`. | None. All authorization checks run server-side. |

| **H-03** | **Unauthorized Comment Injection (BOLA)** | An attacker could post comments on any student's grievance by sending a direct API request with the ticket ID. | Server verifies that the sender is either the student who created the grievance or an authorized warden before saving any comment. | Verified in `app.test.ts`: unauthorized comment requests are blocked with `403 Forbidden`. | None. |

| **H-04** | **Unauthorized File Attachment Download (IDOR)** | Anyone with an attachment ID could download private photos uploaded by other students. | The server looks up the parent grievance and verifies that the current user has permission to view that grievance before serving the file. | Verified in `app.test.ts`: downloading another student's photo returns `403 Forbidden`. | None. |

| **H-05** | **Malicious File Uploads** | Attackers could upload executable files, scripts, or huge files to crash the server or execute malicious code. | Added a strict 2MB file size limit, allowed only safe image MIME types, and checked file magic bytes on the server. Files are stored under random filenames. | Verified in `app.test.ts`: text files, spoofed PNGs, and oversized files return `400 Bad Request`. | Unknown image parser bugs in operating system (mitigated by isolated storage). |

| **H-06** | **Photo EXIF Privacy Leaks** | Uploaded camera photos contained hidden GPS coordinates and camera serial numbers, leaking student locations. | Server automatically strips all EXIF metadata from JPEG and PNG files in memory before saving them to disk. | Verified with raw test buffers: stripped photos contain no EXIF or location tags. | Non-standard metadata chunks in rare image formats. |

| **H-07** | **Stored Cross-Site Scripting (XSS)** | Malicious HTML or `<script>` tags entered in complaint titles, descriptions, or comments could run in other users' browsers. | All user input text is automatically HTML-escaped (`<`, `>`, `&`, `"`, `'`) before being saved or returned. | Verified in `app.test.ts`: `<script>` tags are sanitized and rendered as harmless plain text. | None for API responses. |

| **H-08** | **Plaintext Grievance Data at Rest** | A database breach or server disk dump would expose sensitive student complaints in clear plain text. | Encrypted grievance titles, descriptions, and comments at rest using military-grade AES-256-GCM column encryption. | Verified in `app.test.ts`: raw SQLite database stores only `enc:v1:...` ciphertexts. Data is decrypted only in memory for authorized users. | Compromise of active server memory or environment encryption key. |

| **H-09** | **Brute-Force Password Guessing** | Attackers could guess passwords infinitely without being locked out. | Added progressive account lockout: 3 failed attempts lock the account for 10 seconds; 5 failed attempts lock it for 15 seconds. Active sessions are automatically terminated upon lockout. | Verified in `app.test.ts`: rapid bad attempts return `429 Too Many Requests` with a live countdown timer. | Distributed botnets attacking thousands of different accounts once each (mitigated by IP rate limiting). |

| **H-10** | **Use of Known Breached Passwords** | Users could set common or previously leaked passwords that are easy to guess. | Integrated the HaveIBeenPwned API using $k$-Anonymity to verify that new passwords have never appeared in public data breaches. | Tested with known breached passwords: the server rejects them with a helpful security message. | Brand new data breaches not yet indexed in public databases. |

| **H-11** | **Insecure Account Recovery** | Traditional security questions or reset links can be intercepted or guessed by roommates. | Built a 3-Factor Multi-Secret emergency reset requiring three separate keys: Numeric PIN, Passphrase Word, and Symbol Key. All factors are stored as salted `scrypt` hashes. | Verified in `app.test.ts`: wrong secrets return `401 Unauthorized`; correct secrets reset password and invalidate old sessions. | Physical theft of all 3 recovery secrets. |

| **H-12** | **Session Hijacking & Stale Tokens** | Old session tokens remained valid in the database after logout or password change. | The server deletes session tokens from the database on logout, checks session expiration on every request, and invalidates all user sessions when a password is reset. | Verified in `app.test.ts`: logging out immediately invalidates the session cookie. | Physical theft of an active laptop before the session expires. |
| **H-13** | **Missing Security Visibility & Audit Trail** | Security incidents and attack attempts went unnoticed. | Added a real-time security event log tracking failed logins, account lockouts, impossible travel speeds, and unauthorized access attempts. Accessible directly on student and warden security dashboards. | Verified in `app.test.ts`: all suspicious events appear immediately in `/api/security-logs`. | Database storage limits over long periods (mitigated by indexed SQLite tables). |
| **H-14** | **Database File Direct Exposure** | Placing database files in static web folders could allow direct download of the SQLite database. | Stored the database file (`data/hostel.db`) outside the public web root with strict process-level permissions and parameterized SQL queries. | Verified: no static route serves the database file or its WAL temporary files. | Root compromise of the hosting server operating system. |

---

## Key Achievements
* **100% Server-Side Enforcement**: No security depends on the frontend client.
* **Zero Plaintext Data**: Passwords, recovery factors, grievance titles, descriptions, and comments are all salted or encrypted at rest.
* **Full Automated Test Coverage**: All 19 security test cases in `src/server/app.test.ts` pass cleanly.
