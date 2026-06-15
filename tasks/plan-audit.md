# Authoritative Implementation Plan Audit

This audit maps the user-supplied Antigravity implementation plan to current
evidence. A checked implementation item means the product code exists and has
local automated or live-application evidence. External acceptance is listed
separately and is not treated as complete without the real provider.

## Milestone 1: Project Scaffold & Auth

- [x] Next.js App Router, TypeScript, and Tailwind CSS
- [x] PostgreSQL Prisma schema and baseline production migration
- [x] Separate zero-configuration SQLite demo schema
- [x] Auth.js credentials provider and protected client/admin routes
- [x] Admin and demo-client seed data
- [x] Responsive sidebar, topbar, login, and branded logo
- [x] Complete `.env.example`
- [ ] Baseline Vercel deployment verified

## Milestone 2: Google Sheets Import

- [x] Normal Google Sheets URL parser with URL-variant tests
- [x] Read-only service-account client
- [x] Fuzzy header aliases, warnings, and raw mapping preview
- [x] Authority Magazine-only row normalization
- [x] Preview and confirm API/UI
- [x] Human-readable configuration, permission, missing-tab, and quota errors
- [x] Transactional re-sync that preserves manual contacts and action history
- [x] Row-move identity preservation and cross-sheet duplicate protection
- [ ] Import verified against the real production Sheet/service account

## Milestone 3: Dashboard Cards

- [x] Responsive interview cards and graceful image fallback
- [x] Status badges and tested next-action progression
- [x] Server-side workflow ordering prevents out-of-sequence actions
- [x] Search and status filters
- [x] Summary statistics
- [x] Detail side panel with all imported data and timeline
- [x] Loading skeletons, retryable errors, and empty states
- [x] Keyboard focus trapping, Escape behavior, and scroll locking
- [x] Screenshot-based desktop/mobile acceptance pass completed (visual-smoke.mjs, 9 screenshots, 0 errors)

## Milestone 4: Live-Link Email

- [x] Resend integration with explicit missing-provider failure
- [x] Branded React email template plus plain-text fallback
- [x] Interviewee-first/publicist-fallback recipient logic and publicist CC
- [x] Editable preview with recipient and CC visibility
- [x] Success/failure timeline recording with provider message ID
- [x] Duplicate-send and per-client rate limits
- [x] Needs-contact state
- [x] Missing Resend configuration is shown before send and blocks impossible delivery
- [ ] Delivery and rendering verified in real Gmail, Outlook, and Apple Mail inboxes

## Milestone 5: LinkedIn Generator

- [x] Three tested post variations
- [x] Editable post text and clipboard copy
- [x] Mark-shared workflow
- [x] Optional validated LinkedIn post URL
- [x] Generated, copied, shared, and URL-added timeline records
- [x] Card progression and badges

## Milestone 6: Zoom Follow-Up

- [x] Branded React email template plus plain-text fallback
- [x] Editable preview
- [x] Scheduling-link requirement with settings guidance
- [x] Missing scheduling configuration is shown in preview and blocks impossible send
- [x] Success/failure timeline recording and badge progression
- [ ] Delivery verified through a real Resend sender and inbox

## Milestone 7: Settings, Polish & README

- [x] Editable client name, contact email, signature, reply-to, scheduling link,
  hashtags, and signoff
- [x] Settings wired into email and LinkedIn generation
- [x] Complete action timeline and fully leveraged state
- [x] Responsive layouts, focus treatment, reduced-motion support, loading/error states
- [x] Production-first PostgreSQL scripts, migration, and deployment guide
- [x] Automated utility/workflow/email tests and live HTTP workflow evidence
- [x] Visual browser acceptance pass completed (visual-smoke.mjs, 9 screenshots, 0 errors)
- [ ] Final Vercel/Neon deployment and production environment verified (external)

## Current External Acceptance Items

1. Connect and test the real Google service account and shared source Sheet.
2. Connect a verified Resend sender and inspect delivered messages in real inboxes.
3. Deploy the checked-in PostgreSQL migration and app to Vercel/Neon.
4. Run the repaired visual smoke harness and inspect its desktop/mobile screenshots.
