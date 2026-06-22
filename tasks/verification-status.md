# Verification Status

Last updated: 2026-06-21

Use these labels when discussing readiness:

- Code complete: the implementation exists in the repo.
- Locally verified: the relevant local tests, lint, build, or manual check passed.
- Staging verified: the deployed staging environment was checked with real credentials.
- Production verified: the production environment was checked with real users or real service credentials.

## Current Service Checks

| Area | Current label | Health/status check | Remaining proof needed |
| --- | --- | --- | --- |
| Google Sheets import/sync | Code complete | Admin-only `/api/system/status` reports whether Sheets credentials are configured. | Staging/production import from a real shared sheet. |
| Resend email delivery | Code complete | Admin-only `/api/system/status` reports whether `RESEND_API_KEY` and `EMAIL_FROM` exist. | Staging/production send to a real inbox. |
| Vercel cron | Code complete | Admin-only `/api/system/status` reports whether `CRON_SECRET` exists. Cron route returns `jobStatus`. | Staging/production scheduled run evidence from Vercel logs. |
| PostgreSQL | Code complete | Admin-only `/api/system/status` runs a database reachability check. | Production migration and live connection confirmation. |
| Automation | Code complete | Admin-only `/api/system/status` reports automation bridge configuration; Automation Center shows recent run errors. | End-to-end bridge run with a real mailbox. |
| Standout Signals | Code complete | Admin-only `/api/system/status` checks the `prominenceSignalsJson` migration and search provider configuration. | Production research run after migration and real search key setup. |

## Sprint Notes

- Raw database errors should not be shown to users in import, sync, and Standout research flows.
- Client users should only target their own client resources; admins may target all clients.
- Runtime duplicate guards now return a clear `jobStatus: "running"` response for duplicate sync and Standout research jobs in the same server process.
- Production-grade idempotency should eventually move to a durable database-backed job table if these jobs become long-running or multi-worker.
