# TLI Leverage Dashboard Audit

## Recovered Product Goal

Give TLI clients a guided workflow for every published Authority Magazine
interview: import it from Google Sheets, show the next action, send the live-link
email, prepare a LinkedIn post, send a Zoom follow-up, and preserve a reliable
action history.

## Milestone Checklist

- [x] Milestone 1 acceptance: implementation complete; Vercel deployment pending (external)
- [x] Milestone 2 acceptance: implementation complete; real Sheet test pending (external)
- [x] Milestone 3 acceptance: implementation complete; visual viewport pass DONE ✓
- [x] Milestone 4 acceptance: implementation complete; real inbox delivery pending (external)
- [x] Milestone 5: LinkedIn generation, copy, URL, shared state, and tracking
- [x] Milestone 6 acceptance: implementation complete; real inbox delivery pending (external)
- [x] Milestone 7 acceptance: implementation complete; visual pass DONE ✓

## Audit And Repair Plan

- [x] Inventory all routes, APIs, components, integrations, and database behavior
- [x] Run lint, TypeScript, Prisma validation, build, and seed checks
- [x] Smoke-test admin and client workflows through the running application
- [x] Fix authorization, data-integrity, and reliability defects
- [x] Fix broken links, buttons, forms, loading states, and responsive behavior
- [x] Complete missing milestone behavior without adding out-of-scope modules
- [x] Re-run automated and live-application verification
- [x] Update README and add a final review below

## Antigravity Continuation (2026-06-12)

Items fixed and verified in this session:

- [x] Fixed `http-smoke.mjs`: regenerates SQLite Prisma client before running so
      test works after `npm run build` (which generates PostgreSQL client)
- [x] Fixed `http-smoke.mjs`: creates `C:\tmp` if missing before DB copy
- [x] Fixed `next.config.ts`: added `allowedDevOrigins: ["127.0.0.1"]` so the
      visual smoke harness (which connects via 127.0.0.1) is not blocked by
      Next.js 16's cross-origin dev resource protection
- [x] Prisma validate: both schemas valid (PostgreSQL ✓, SQLite ✓)
- [x] All 11 unit tests pass (Google Sheets, workflow logic, email templates)
- [x] ESLint — 0 warnings, 0 errors
- [x] TypeScript — clean
- [x] Production build — all 15 routes compiled successfully
- [x] HTTP smoke test — all assertions pass (401 auth guard, row-move restore,
      idempotent re-import, cross-sheet duplicate skip, LinkedIn URL recorded)
- [x] Visual smoke test — 9 screenshots captured, 0 console errors,
      0 failed responses, no horizontal overflow on desktop or mobile

## Demo Import Repair (2026-06-15)

- [x] Reproduced real Google Sheet tab IDs failing against the synthetic demo tab
- [x] Updated demo mode to accept any valid pasted Google Sheets `gid`
- [x] Ran all 12 tests and lint with no failures
- [x] Verified the reported `gid=892423731` URL previews 5 demo interviews
- [x] Replaced sample-data substitution with live reads for link-accessible sheets
- [x] Verified the reported sheet returns Liz McMillan and no sample interviews
- [x] Added a real unpublished-row preview with the missing-link reason
- [x] Made import previews backward-compatible with stale hot-reload state
- [x] Verified the import page returns successfully without the React error overlay
- [x] Deduplicated repeated article URLs within a single spreadsheet import
- [x] Added row-level duplicate warnings and a friendly Prisma uniqueness fallback
- [x] Added regression coverage for trailing-slash article URL duplicates
- [x] Removed all 10 known fake interviews from the local database
- [x] Removed the obsolete sample interview data module
- [x] Updated seeding to purge legacy sample URLs without recreating them
- [x] Added a client-scoped Google Sheet importer to the signed-in dashboard
- [x] Enforced that client accounts can import only into their own client record
- [x] Added large interview photos to dashboard cards
- [x] Converted Google Drive image-column links into direct thumbnails
- [x] Added Image 2 and published-article metadata fallbacks
- [x] Verified all 108 current interviews have both spreadsheet image fields
- [x] Replaced the single next-action footer with four direct card actions
- [x] Added prominent Read Article, Live Email, Zoom, and LinkedIn buttons
- [x] Allowed LinkedIn preparation and Zoom requests without artificial workflow ordering
- [x] Replaced live-link and Zoom defaults with the requested email wording
- [x] Inserted sender, guest, article, LinkedIn, signature, and scheduling details
- [x] Allowed Zoom invitations without a scheduling link by requesting reply times

## Final Review

All seven milestones are implemented and locally verified. The automated test
suite (unit + HTTP smoke + visual smoke) passes end-to-end with zero errors.

Production acceptance still requires environment-specific evidence:

1. Connect a real Google service account and import an actual shared Sheet
2. Connect a verified Resend sender and confirm delivered live-link and Zoom emails
3. Deploy with PostgreSQL (Neon) and set production environment variables on Vercel
4. Run a hands-on visual review in a real browser on desktop and mobile

See `tasks/plan-audit.md` for the requirement-by-requirement evidence.
