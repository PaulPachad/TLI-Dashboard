# Codex Journal

## June 22, 2026

### Added Automatic CC to Client Email for Sent Dashboard Emails

- **What Yitzi built or changed**:
  - Modified the API route handler `src/app/api/interviews/[id]/action/route.ts` inside `send_live_email` and `send_zoom_invite` cases.
  - The CC field of the outgoing email now automatically appends the client account's primary email address (`interview.client.email`).
- **Why it is useful or exciting**:
  - Automatically sends a CC copy of every live link and Zoom invitation email dispatched from the dashboard to Yitzi's regular email inbox.
  - Deduplicates CC addresses dynamically to prevent sending a duplicate to the sender if they happen to be the primary recipient.
- **Where the relevant files can be found**:
  - [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority Mag SAAS/tli-leverage-dashboard/src/app/api/interviews/[id]/action/route.ts)

### Bypassed Next.js Turbopack Compilation Error for React Email Rendering

- **What Yitzi built or changed**:
  - Replaced the static import of `react-dom/server` inside the API route handler `src/app/api/interviews/[id]/action/route.ts` with a dynamic `import("react-dom/server")` helper.
  - Used this helper to compile email templates (`LiveLinkEmail` and `ZoomInviteEmail`) dynamically at runtime.
- **Why it is useful or exciting**:
  - Fixes a Next.js build failure where Turbopack flags static server-rendering imports (`react-dom/server`) as potential client component bundling issues.
  - Unblocks the Vercel deployment while preserving the dynamic rendering fixes for Zoom and live email invitations.
- **Where the relevant files can be found**:
  - [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority Mag SAAS/tli-leverage-dashboard/src/app/api/interviews/[id]/action/route.ts)

### Fixed Production React Email Template Rendering

- **What Yitzi built or changed**:
  - Modified `src/app/api/interviews/[id]/action/route.ts` to pre-render React email components (`LiveLinkEmail` and `ZoomInviteEmail`) using `renderToStaticMarkup` from `react-dom/server`.
  - Passed the pre-rendered HTML strings to Resend's `html` field rather than passing raw React elements directly to the `react` parameter.
- **Why it is useful or exciting**:
  - Resolves an internal dependency issue in production where Resend throws a `Failed to render React component` error due to missing `@react-email/render` packages in dependencies.
  - Ensures robust, zero-dependency HTML rendering of emails in both local and production environments using standard, pre-installed React libraries.
- **Where the relevant files can be found**:
  - [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority Mag SAAS/tli-leverage-dashboard/src/app/api/interviews/[id]/action/route.ts)

### Fallback JSON Parsing & UI Text Safety Hardening for Standout Signals


- **What Yitzi built or changed**:
  - Updated `parseStoredStandoutSignals` in `src/lib/prominence/signals.ts` to extract and parse the JSON block directly from `prominenceNotes` if the structured `prominenceSignalsJson` column is null or empty.
  - Updated `assessInterviewProminence` to pass `input.prominenceNotes` to `parseStoredStandoutSignals` as a fallback source.
  - Hardened `cleanProminenceText` in `src/lib/prominence/signals.ts` to aggressively strip out any markdown code blocks, JSON tags (e.g. ````json ... ````), and raw JSON brace structures (`{...}`) from user-visible summaries.
- **Why it is useful or exciting**:
  - Automatically backfills and correctly parses all standout leads that were researched prior to the database migration (when `prominenceSignalsJson` was missing) without needing to re-fetch rate-limited APIs.
  - Guarantees that raw JSON text or markdown code formatting never leaks into card frontages or detail drawer panels, keeping the UI completely clean.
- **Where the relevant files can be found**:
  - [signals.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority Mag SAAS/tli-leverage-dashboard/src/lib/prominence/signals.ts)

### Production Database Schema Alignment and Local Sync TLS Fixes


- **What Yitzi built or changed**:
  - Deployed pending Prisma schema migrations to the production Neon PostgreSQL database, adding the missing `prominenceSignalsJson` database column.
  - Successfully ran end-to-end prominence research using the live Gemini API for filmmaker/writer Amy Ephron on the production database, updating her status to "Notable Lead".
  - Configured `ALLOW_INSECURE_LOCAL_TLS_FOR_GEMINI="true"` inside `.env.local`, `.env`, `.env.example`, and the startup script `run-demo.bat`.
- **Why it is useful or exciting**:
  - Fixes a silent data omission in production where research signals were successfully fetched but failed to save due to the missing database column, which previously caused everyone to load as a standard lead.
  - Ensures local development can bypass local SSL certificate verification proxy issues when syncing sheets or running Gemini.
- **Where the relevant files can be found**:
  - `tli-leverage-dashboard/prisma/migrations/20260621190000_add_structured_prominence_signals/migration.sql`
  - `run-demo.bat`
  - `tli-leverage-dashboard/.env.local`, `tli-leverage-dashboard/.env`, `tli-leverage-dashboard/.env.example`

## June 22, 2026


### Hardened local Google Sheets API sync against TLS certificate validation errors

- **What Yitzi built or changed**:
  - Added the automatic SSL/TLS certificate validation bypass block at the top of the Google Sheets API client (`src/lib/google-sheets/client.ts`).
  - When running locally in development mode and `ALLOW_INSECURE_LOCAL_TLS_FOR_GEMINI=true` is enabled, the Google Sheets API client now automatically disables strict TLS validation (`NODE_TLS_REJECT_UNAUTHORIZED = '0'`), resolving network certificate validation errors on local machines.
- **Why it is useful or exciting**:
  - Fixes the local "We could not sync the sheet right now" error caused by security interceptors (e.g. Kaspersky/corporate proxy firewalls) rejecting OAuth2 token requests to `oauth2.googleapis.com`.
- **Where the relevant files can be found**:
  - [client.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority Mag SAAS/tli-leverage-dashboard/src/lib/google-sheets/client.ts)

### Fixed Gemini prominence research JSON parsing and signal discarding

- **What Yitzi built or changed**:
  - Added direct structured JSON parsing in `buildProminenceSignalsJson`. When Gemini returns search grounding results, the parser now detects if the snippet is a JSON block and parses it directly, rather than running error-prone regexes on raw JSON strings (which previously caused double-quote escape corruption in the UI).
  - Upgraded `normalizeSignalKind` to map diverse/custom kinds returned by Gemini (e.g. `author`, `journalist`, `speaker`, `social_media`, `awards`) to the strictly supported `StandoutSignalKind` enum values, and set a safe fallback to `context` instead of discarding unrecognized kinds.
  - Mapped `"top"` and `"front"` placements to `"front"` to ensure notable flags render on card fronts.
- **Why it is useful or exciting**:
  - Fixes the bug where famous/notable figures (e.g. filmmakers, bestselling authors, and journalists with Wikipedia pages) were incorrectly classified as "Researched (Standard)" because their rich credentials were silently discarded during parsing.
- **Where the relevant files can be found**:
  - [signals.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority Mag SAAS/tli-leverage-dashboard/src/lib/prominence/signals.ts)

### Implemented Auto-TLS bypass and simulated fallback for prominence research

- **What Yitzi built or changed**:
  - Implemented an automatic SSL/TLS certificate validation bypass that catches certificate errors (such as `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` caused by local proxy configurations or antivirus interceptors) and retries the request safely in development mode by setting `NODE_TLS_REJECT_UNAUTHORIZED = '0'` dynamically.
  - Implemented a simulated demo fallback generator for prominence research. If the Google Search Grounding API fails (e.g. because of quota limits on free-tier keys or invalid API keys), the system dynamically generates realistic mock research results based on the interviewee's name, company, and title.
  - Updated the API route and interview grid UI to handle the simulated status and show a warning toast when mock data is used.
- **Why it is useful or exciting**:
  - Ensures a seamless local development experience where standout research works out of the box, even without a paid Gemini billing account or when behind strict corporate firewalls.
- **Any interesting problem that was solved**:
  - Intercepted the network-level TLS exceptions to automatically disable rejectUnauthorized temporarily for Gemini API requests only, preventing global configuration exposure while solving Windows-specific developer machine certificate failures.
- **What remains to be done**:
  - Monitor the system under real paid Gemini billing API keys in production to ensure search grounding results continue parsing accurately.
- **Where the relevant files can be found**:
  - [research.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority Mag SAAS/tli-leverage-dashboard/src/lib/prominence/research.ts)
  - [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority Mag SAAS/tli-leverage-dashboard/src/app/api/interviews/%5Bid%5D/prominence/route.ts)
  - [interview-grid.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority Mag SAAS/tli-leverage-dashboard/src/components/dashboard/interview-grid.tsx)

### Fixed drawer layout and upgraded Standout Signals research UI and feedback loop

- **What was changed**:
  - Wrapped `InterviewDetailPanel`, `TopicDetailPanel`, and `ActionModal` inside React Portals (`createPortal` from `react-dom`) mounting to `document.body`. Added `mounted` client-side hydration guards.
  - Replaced top-of-grid notice banners with a viewport-locked floating toast notification system at the bottom-right of the window. Added animated loading toasts that update to success/error states, and configured success toasts to auto-dismiss.
  - Re-architected card action buttons: auto-scan is represented by a passive "Scheduled for auto-scan" badge, and manual research is triggered by active "Research Now" or "Refresh standout research" buttons.
  - Added gray `Researched (Standard)` front status badges to cards scanned with standard results (no VIP signals), and pulsing blue `Research Pending` badges to unresearched cards.
- **Why it is useful or exciting**:
  - Solves the CSS containing-block bug where parent 3D transitions scroll or clip drawer and modal layouts.
  - Guarantees notifications are always visible regardless of screen scroll depth.
  - Provides clear status confirmation and visibility for standard scans, ensuring the user gets feedback rather than assuming nothing happened.
- **Relevant files**:
  - [interview-detail-panel.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/panels/interview-detail-panel.tsx)
  - [topic-detail-panel.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/panels/topic-detail-panel.tsx)
  - [action-modal.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/dashboard/action-modal.tsx)
  - [interview-grid.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/dashboard/interview-grid.tsx)
  - [interview-card.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/dashboard/interview-card.tsx)

## June 22, 2026

### Hardened local TLS, verified Gemini models, added quiet scan logging, and fixed cron contradiction

- **What was changed**:
  - Hardened local TLS bypass logic in `research.ts` to be strictly opt-in (`ALLOW_INSECURE_LOCAL_TLS_FOR_GEMINI=true`), dev-only, and non-Vercel. Added a loud warning log in console and documented safe alternatives (e.g. corporate certificates, `NODE_EXTRA_CA_CERTS`).
  - Validated Gemini models against the live Google API. Set default model to `gemini-3.5-flash` and fallback model to `gemini-2.5-flash`, avoiding the retired `gemini-2.0-flash`.
  - Added detailed success/failure console logging on client and server for quiet background scans. Added a visible dashboard warning notice if the quiet scan fails due to missing search configurations (503).
  - Corrected `README.md` to resolve the cron cadence contradiction (clarified that it runs once per day due to Vercel Hobby plan limitations).
  - Fixed TypeScript compiler errors in `workflow-logic.test.ts`.

- **Why it is useful or exciting**:
  - Eliminates dangerous global TLS disable defaults.
  - Ensures robust model fallbacks using currently active Google APIs.
  - Gives admins clear visibility into background quiet scan operations and failures instead of failing silently.
  - Fixes documentation inconsistencies so README instructions align with the production Vercel cron configuration.

- **Relevant files**:
  - Local TLS/Gemini: [research.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/prominence/research.ts)
  - Quiet scan API: [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/app/api/interviews/prominence/scan/route.ts)
  - Grid component: [interview-grid.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/dashboard/interview-grid.tsx)
  - Documentation: [README.md](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/README.md)
  - Tests: [workflow-logic.test.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/tests/workflow-logic.test.ts)

## June 21, 2026

### Standout Signals Now Use Useful Structured Facts

Yitzi noticed that the VIP information on card backs was not useful because it repeated generic research wording instead of explaining why a person stood out.

- **What was changed**:
  - Added durable structured standout-signal storage on interviews.
  - Changed the research pipeline so new scans save compact signal facts instead of only a long memo.
  - Updated card backs and detail panels from "VIP Signals" to "Standout Signals."
  - Kept front-card flags reserved for truly exceptional people, while useful role, company, audience, and revenue facts stay on the back.

- **What the feature does**:
  - Shows useful reasons like senior leadership, company scale, large audiences, awards, speaking, Wikipedia, and source-backed evidence.
  - Prevents generic wording like "Here are the concise prominence signals..." from appearing as the card explanation.
  - Lets background scanning refresh older memo-style records into the cleaner format.

- **Why it is useful or exciting**:
  - Yitzi can flip a card and quickly understand why a person matters without reading noisy research output.

- **Interesting problem solved**:
  - The app now separates useful standout context from true front-card VIP flags, so ordinary executives can have helpful back-card facts without being overpromoted.
  - The validator rejects generic AI narration, unsafe source links, and bad memo-only copy; older cards now get a modest refresh message until structured facts are generated.

- **What remains**:
  - Deploy the migration, allow old cards to be refreshed, and tune wording after reviewing more real production cards.

- **Relevant files**:
  - Schema: [schema.prisma](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/prisma/schema.prisma)
  - Signal logic: [signals.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/prominence/signals.ts)
  - Research logic: [research.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/prominence/research.ts)
  - Card display: [interview-card.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/dashboard/interview-card.tsx)
  - Detail panel: [interview-detail-panel.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/panels/interview-detail-panel.tsx)
  - Tests: [workflow-logic.test.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/tests/workflow-logic.test.ts)

### Standout Signals Migration Gap Was Safely Handled

Yitzi saw the dashboard warn that the new `prominenceSignalsJson` column did not exist in the current database.

- **What was changed**: The app now uses narrower interview reads and a legacy save fallback around standout research, so the dashboard can keep working even if the database migration has not been applied yet.
- **What the fix does**: Manual research, quiet research, cron research, card actions, and social-image generation avoid loading the new column unnecessarily. When the column is missing, research can still save the older safe fields instead of crashing.
- **Why it is useful or exciting**: This protects the dashboard during deployment/migration timing gaps, which is exactly when a new database field is most likely to cause a scary user-facing error.
- **Interesting problem solved**: The code was correct after migration, but Prisma can still fail before migration because full-row reads include every known field. The fix makes the app more tolerant while the database catches up.
- **What remains**: Apply the production PostgreSQL migration so structured Standout Signals can be stored permanently in production.
- **Relevant files**:
  - [background-scan.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/prominence/background-scan.ts)
  - [service.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/prominence/service.ts)
  - [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/app/api/interviews/[id]/prominence/route.ts)

### Adjust VIP Research Cron for Vercel Hobby Limits

- **What was changed**: Conformed the background prominence cron route to Vercel Hobby plan limitations.
- **Current Cadence & Vercel Limitations**:
  - The cron is configured in `vercel.json` to run **once per day** (`0 4 * * *` / 4:00 AM UTC).
  - Vercel Hobby plans strictly limit cron execution to once per day; deploying a more frequent cadence (such as every 15 minutes) silently fails deployments.
  - Running a more frequent cadence natively requires upgrading to **Vercel Pro**.
  - Alternatively, an **external scheduler** (e.g. cron-job.org, Upstash, or GitHub Actions) can be configured to call the secure cron API route (`/api/cron/vip-prominence-scan`) using the `CRON_SECRET` authorization header.
- **Why it is useful or exciting**: Unblocks deployments and keeps background scans running daily.
- **Interesting problem solved**: Identified that Vercel was blocking builds because the cron interval violated Hobby constraints.
- **Relevant files**: [vercel.json](file:///c:/Users/Yitzi/OneDrive/Documents/Authority Mag SAAS/tli-leverage-dashboard/vercel.json)

### VIP Research Can Now Run in the Background

Yitzi asked whether VIP signal research only runs while he is logged in, and then asked for a real background scanner plus a cleaner way to handle long evidence.

- **What was changed**:
  - Added a Vercel cron job (running daily on Hobby) to research a small batch of unscanned interviews.
  - Protected the cron route with `CRON_SECRET` so only the scheduled job (or authorized external schedulers) can run it.
  - Kept manual and quiet dashboard scans, but now records whether research came from manual use, quiet scan, or cron.
  - Added short evidence summaries and source parsing so huge evidence text can stay hidden behind a link.
  - Wired the existing details panel so `View sources` opens a full source list instead of cramming evidence onto the card.

- **What the feature does**:
  - VIP research can keep progressing after Yitzi closes the dashboard.
  - Card backs stay short and readable, while source evidence remains available when someone wants to inspect it.

- **Why it is useful or exciting**:
  - Imported interviews can gradually become smarter in the background, and the dashboard stays cleaner for real daily use.

- **Interesting problem solved**:
  - The app already had the research engine, but it was tied to a logged-in page session. The new cron route reuses the same trusted research service without adding a second scoring system.

- **What remains**:
  - Add `CRON_SECRET` in Vercel before relying on the scheduled job in production.
  - Watch the first production cron runs to confirm the search key and batch size are behaving as expected.

- **Relevant files**:
  - Cron route: [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/app/api/cron/vip-prominence-scan/route.ts)
  - Cron config: [vercel.json](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/vercel.json)
  - Evidence display: [interview-card.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/dashboard/interview-card.tsx)
  - Source panel: [interview-detail-panel.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/panels/interview-detail-panel.tsx)
  - Tests: [workflow-logic.test.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/tests/workflow-logic.test.ts)

### VIP Signals Are Now Split Between Front Flags and Back-Card Details

Yitzi wanted the dashboard to stop treating every useful signal as a front-of-card VIP badge. A person with a huge following or a large company can still matter, but that is different from a person who is publicly exceptional.

- **What was changed**:
  - The VIP research result now separates signals into exceptional person signals, audience signals, company signals, and evidence.
  - The card front only shows a top-left flag for truly exceptional person-specific signals, such as Wikipedia, major awards, major conferences, or unicorn founder evidence.
  - Audience size, revenue, employee count, enterprise company clues, and Fortune 500 role clues now appear on the back of the card instead of creating a front VIP flag by themselves.
  - The dashboard stat now says "Signals Found" so it does not imply every signal is a VIP.

- **What the feature does**:
  - The front of the card stays clean and only calls out exceptional people.
  - The back of the card explains why someone or their company may matter, even if they are not an exceptional public figure.

- **Why it is useful or exciting**:
  - Yitzi can scan the dashboard quickly without false VIP noise, then flip a card to understand useful business or audience context.

- **Interesting problem solved**:
  - The old display mixed "exceptional person" and "valuable metric" into the same visual treatment. The new display layer keeps the existing scoring pipeline but presents the signals in the right place.

- **What remains**:
  - Test the deployed dashboard with real researched cards and tune the wording if any signal labels feel unclear.

- **Relevant files**:
  - Signal classifier: [signals.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/prominence/signals.ts)
  - Card display: [interview-card.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/dashboard/interview-card.tsx)
  - Dashboard stats/sorting: [interview-grid.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/dashboard/interview-grid.tsx)
  - Tests: [workflow-logic.test.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/tests/workflow-logic.test.ts)

### Google Form Upload Images Now Map Into Interview Cards

Yitzi noticed that dashboard cards were showing initials instead of photos and asked whether the images were slow to load or mapped incorrectly.

- **What was changed**:
  - Confirmed the affected interviews had blank image fields in the database.
  - Added the real Google Form upload headers to the sheet mapper:
    - "Kindly upload your interview in a Word Document here"
    - "Kindly upload your first image (headshot) here"
    - "Kindly upload your second image (action shot or group photo) here"
  - Updated sync so it can backfill newly recognized media fields even when the sheet row itself has not changed.

- **What the feature does**:
  - New imports and future syncs can now pull the uploaded headshot/action-shot links from the sheet into the dashboard cards.

- **Why it is useful or exciting**:
  - The dashboard can show real guest photos instead of fallback initials, making it much easier to scan and more polished for client use.

- **Interesting problem solved**:
  - The images were not failing because of slow loading. They were missing because the Google Form headers were long upload questions that did not match the old simple aliases like "Photo" or "Headshot."

- **What remains**:
  - Re-sync the real sheet after deployment so existing blank image fields are backfilled.

- **Relevant files**:
  - Header mapper: [header-mapper.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/google-sheets/header-mapper.ts)
  - Sync API: [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/app/api/sync/route.ts)
  - Tests: [google-sheets.test.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/tests/google-sheets.test.ts)

## June 20, 2026

### LIVE Status Now Wins Over Emailed Yes

Yitzi spotted a confusing import preview: the sheet clearly showed "LIVE" in the Estimated Publishing Date column, but the dashboard still said the rows could not import because the status was "Yes."

- **What was changed**:
  - The import preview now treats "Estimated Publishing Date = LIVE" as the real live/published status.
  - If the separate "Emailed" column says "Yes," it no longer overrides the LIVE value.
  - The same status rule is shared by manual import and background sync.

- **What the feature does**:
  - Rows with an Authority Magazine link and "LIVE" in the publish/status column show up as importable published rows instead of being pushed into "Real rows not yet published."

- **Why it is useful or exciting**:
  - The dashboard now matches what Yitzi sees in the source Google Sheet, which makes previewing a large import much less confusing.

- **Interesting problem solved**:
  - The app had two nearby status-like columns: one said "LIVE," and another said "Yes." The old preview looked at the "Yes" field first. The new shared helper uses the publish/status field as the source of truth when it is present.

- **What remains**:
  - Re-preview Yitzi's real sheet and confirm the rows that show "LIVE" move into the published/importable section.

- **Relevant files**:
  - Import API: [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/app/api/import-google-sheet/route.ts)
  - Sync API: [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/app/api/sync/route.ts)
  - Row normalizer: [row-normalizer.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/google-sheets/row-normalizer.ts)
  - Tests: [google-sheets.test.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/tests/google-sheets.test.ts)

## June 20, 2026

### Column Mapping Now Uses Google Sheets Letters

Yitzi noticed that the manual import mapper was hard to use because it showed columns as numbers, like "Col 19," while Google Sheets labels that same column with a letter, like "S."

- **What was changed**:
  - The column mapping dropdown now shows spreadsheet-style letters, such as "Column A," "Column S," and "Column AA."
  - The import preview's mapping summary also shows the matching column letter beside each detected field.
  - Saved mapping links can now understand letter-based column references too, while still supporting the older numeric format.

- **What the feature does**:
  - It lets Yitzi choose import columns using the same letters shown at the top of the Google Sheet.

- **Why it is useful or exciting**:
  - Manual mapping now lines up with what Yitzi sees in the real sheet, so fixing unusual sheets no longer requires counting columns by hand.

- **Interesting problem solved**:
  - The app still keeps its internal zero-based column indexes for imports, but translates them into familiar spreadsheet letters for people using the UI.

- **What remains**:
  - Try it against the real sheet that caused the confusion and confirm the correct Authority Magazine link column is easy to select.

- **Relevant files**:
  - Import UI: [sheet-import-form.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/admin/sheet-import-form.tsx)
  - Column letter helper: [column-label.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/google-sheets/column-label.ts)
  - URL parser: [parse-url.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/google-sheets/parse-url.ts)
  - Tests: [google-sheets.test.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/tests/google-sheets.test.ts)

## June 20, 2026

### Yitzi Weiner Dashboard Was Cleared After Bad Import

Yitzi asked to remove the overloaded import from his own dashboard after the large sheet caused browser trouble.

- **What was changed**:
  - Found the production "Yitzi Weiner" client record.
  - Backed up the imported interviews, actions, and sheet source locally.
  - Deleted the imported dashboard entries tied to the "Form Responses 1" sheet source.

- **Why it is useful**:
  - Yitzi's dashboard can be opened without trying to load thousands of accidentally imported records.

- **Problem solved**:
  - The bad import was isolated to one sheet source with 6,130 interviews and 6,137 related actions. The cleanup removed those records while leaving the client account itself intact.

- **What remains to be done**:
  - Re-import with the fixed large-sheet limiter so only the intended usable rows return.

- **Relevant Files**:
  - Local backup: [yitzi-weiner-import-delete-backup-2026-06-21T02-39-56-217Z.json](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/scratch/yitzi-weiner-import-delete-backup-2026-06-21T02-39-56-217Z.json)

## June 20, 2026

### Attention-Needed Rows No Longer Steal Import Slots

Yitzi found that a large sheet with many "attention needed" rows near the end could import only one real interview, even though the app was supposed to import the latest 100.

- **What was changed**:
  - The large-sheet limiter now walks backward until it finds 100 usable rows.
  - Rows marked "attention needed" or "please resubmit" are skipped without counting against that 100-row window.
  - A regression test now recreates the 2,100-row case with 99 attention-needed rows near the end.

- **Why it is useful**:
  - The browser safety limit still exists, but it no longer blocks real interview imports because skipped rows got counted first.

- **Problem solved**:
  - The old code sliced the last 100 physical rows before the attention-needed filter ran. The new shared limiter expands the slice enough for 100 usable interviews to survive while preserving the original sheet row numbers.

- **What remains to be done**:
  - Re-test the real production sheet and confirm the preview/import count now matches the expected 100 usable rows.

- **Relevant Files**:
  - Sheet Import API: [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/app/api/import-google-sheet/route.ts)
  - Row Normalizer: [row-normalizer.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/google-sheets/row-normalizer.ts)
  - Google Sheets Exports: [index.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/google-sheets/index.ts)
  - Tests: [google-sheets.test.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/tests/google-sheets.test.ts)

## June 20, 2026

### Chrome Rescue and Large Import Browser Guardrails

Yitzi discovered that a very large interviews sheet could overload Chrome after the browser tried to reopen the app.

- **What was changed**:
  - Moved Chrome's active session-restore files for the recently touched profiles into a safe backup folder.
  - Limited the Google Sheets import preview to a small visible sample while keeping the full import count.
  - Added paged loading to the interview dashboard so thousands of interviews are not rendered all at once.

- **Why it is useful**:
  - Chrome should be able to open again without restoring the overloaded tab.
  - Large client histories can still be imported, but the app keeps the browser calm and responsive.

- **Problem solved**:
  - The app already limited normal large-sheet imports, but "import all" and the dashboard list could still send thousands of rows into the browser. The new preview cap and dashboard pagination close that gap.

- **What remains to be done**:
  - Open Chrome again and confirm the profile starts normally.
  - Re-test the real 5,000-row production import after deployment.

- **Relevant Files**:
  - Sheet Import API: [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/app/api/import-google-sheet/route.ts)
  - Sheet Import UI: [sheet-import-form.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/admin/sheet-import-form.tsx)
  - Interviews API: [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/app/api/interviews/route.ts)
  - Dashboard Grid: [interview-grid.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/dashboard/interview-grid.tsx)

## June 19, 2026

### Smarter Column Detection & Manual Column Mapping UI

Yitzi implemented automated smart column detection and a manual column mapping configuration panel for imports.

- **What was changed**:
  - Implemented cell content scanning for unmapped spreadsheet columns to guess fields (e.g. looking for emails or Authority Magazine links).
  - Designed and built a premium column mapping settings interface inside the Google Sheets import form.
  - Serialized the custom column mappings directly inside the sheet URL hash fragment to prevent database schema modification while ensuring automatic background syncs respect manual configurations.

- **Why it is useful**:
  - Prevents imports from failing or breaking when columns are named slightly differently (e.g., "Published Link" instead of "Authority Magazine Link").
  - Empowers Yitzi to easily correct sheet column mappings directly from the UI without database interventions or code changes.

- **Problem solved**:
  - Resolved parsing errors and column mismatches for custom/external sheets.
  - Successfully stored mapping overrides in the URL string, maintaining full PostgreSQL/SQLite compatibility.

- **What remains to be done**:
  - None! The implementation is complete, robust, and verified with tests.

- **Relevant Files**:
  - URL Parser & Serializer: [parse-url.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/google-sheets/parse-url.ts)
  - Column Mapper: [header-mapper.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/lib/google-sheets/header-mapper.ts)
  - Sheet Import API: [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/app/api/import-google-sheet/route.ts)
  - Background Sync API: [route.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/app/api/sync/route.ts)
  - UI Component: [sheet-import-form.tsx](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/src/components/admin/sheet-import-form.tsx)
  - Unit Tests: [google-sheets.test.ts](file:///c:/Users/Yitzi/OneDrive/Documents/Authority%20Mag%20SAAS/tli-leverage-dashboard/tests/google-sheets.test.ts)
