# Codex Journal

## June 21, 2026

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
