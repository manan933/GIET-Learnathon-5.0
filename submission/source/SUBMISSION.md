# Submission Guide — HostelGrievance

> **🌐 Live Production Deployment**: [https://giet-learnathon-5-0.onrender.com](https://giet-learnathon-5-0.onrender.com)

Before submission, provide a package that can be reviewed and run independently:

```text
submission/
├── source/
├── deployment/
├── SECURITY.md
├── THREAT-MODEL.md
├── HARDENING.md
└── TEST-EVIDENCE/
```

The package keeps all normal business workflows available. It includes all commands needed to build, reset the database, run the application, and execute verification tests.

`HARDENING.md` is the security hardening register:

```text
| ID | Finding | Risk | Change | Verification | Residual Risk |
|----|---------|------|--------|--------------|---------------|
```

All seeded vulnerabilities and discovered security weaknesses are remediated, tested, and documented.
