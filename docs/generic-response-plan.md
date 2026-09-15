# Daily generic response: audit, architecture, and implementation handoff

Date: 2026-09-15. Status: planning and read-only audit complete; implementation and live verification remain. No live mail sent and no schedule enabled in this phase.

## User requirements and decisions

- Manage the feature in the Authority Magazine SaaS alongside existing autoresponders.
- Process the red Gmail label shown as `1. Send Generic Re...` in the screenshot, in the mailbox receiving pitches at `editor@authoritymag.co`. The screenshot is truncated: do not guess the full name or ID.
- Every day, including weekends, start at **10:00 a.m. America/New_York**, with daylight saving time. Yitzi explicitly confirmed this on September 15.
- Send the exact supplied body, preserved in `generic-response-template.md`, with HTML links and a plain-text alternative. No model inference or per-email AI cost is needed.
- Clearing the folder means removing the queue label from successfully handled messages. Keep the messages, other labels, read state, and inbox state.
- Finish the architecture first, then let Yitzi switch to a less expensive model to implement it.
- Proposed delivery policy: one reply per eligible conversation, addressed to one validated Reply-To (or From) address. Multiple labels/messages in the same conversation do not cause multiple replies. Separate conversations from the same sender are separate pitches. Surface ambiguities for review.

## What was actually checked

Local repository was clean at the start. Reviewed the SaaS settings/config/template bridge, Python pitch and collaboration workers, Gmail client, daemon, schema, and existing test coverage. Production deployment, authenticated admin controls, worker heartbeats, and editor Gmail OAuth were not verified.

Connected Gmail reports `support@authoritymag.co`; its returned labels do not include the pictured generic-response queue. This connection cannot establish the editor mailbox's identity, label ID, volume, or sender alias. Do not use the support mailbox as a substitute.

### Findings to address before relying on the controls

| Priority | Finding and evidence | Required behavior |
| --- | --- | --- |
| High | `auto-responder/automation_bridge.py:get_config` returns cached configuration without a maximum stale age after fetch failure; without cache it returns None. Both workers only honor pause when a config object exists. | In managed operation, block work when authoritative config is missing or stale. Do not fall back to local enabled settings. Check fresh authorization immediately before a real send. |
| High | Both `_sync_bridge_config` implementations only replace template bodies when `config.template(key)` returns an enabled template. Disabling one leaves the previous body usable. | Enforce template enabled state at execution time; clear disabled entries. Test enabled-to-disabled transitions and restart behavior. |
| High | Collaboration config sync consumes maxEmailsPerRun and two templates, but does not consume the SaaS sender/domain/phrase suppressions. | Apply a shared, tested suppression policy to collaboration and generic responses. |
| Medium | `syncBridgeTemplates` in `src/lib/automation/service.ts` unconditionally overwrites existing templates and increments versions; the pitch worker pushes templates during initialization. A failed initial pull can therefore publish local defaults over SaaS edits. | Make SaaS authoritative after first import. Use create-only import or an explicit version-checked update; restrict bridge template keys to authorized workflows. Also review `ensureMissingDefaults` heuristic template replacements. |
| Medium | `cloud_daemon.py` returns HTTP 200 healthy even when workers have exited. Worker exceptions are logged and the main process keeps running. | Separate process liveness from worker readiness, report stale checks and required-worker failures, and configure restart/alerts. Use noninteractive cloud authentication. |
| Medium | The bridge returns subject, interval, and other settings that workers do not all apply. Pitch drafts use `Re: {subject}` directly; daemon polling uses module constants. | Define which settings each worker supports and either apply them or make unsupported controls explicit in the UI. |
| Design constraint | Profile mode and bridge config are deliberately hardcoded DRAFT_ONLY. Mailbox is unique on `(profileId, emailAddress)` and has one legacy workflowType. Gmail helper creates drafts and lists only one page. | Add an independent workflow under an existing mailbox. Do not globally enable sending or create a second conflicting editor mailbox. Add a paginated generic queue reader and explicit send operation. |

These are source-code findings, not evidence that an incident occurred in production. Existing green helper tests alone cannot prove live Gmail delivery or control propagation.

## Architecture

### 1. Keep existing components

Use the current Python cloud daemon for Gmail operations and scheduling; use the SaaS database and authenticated bridge for configuration, durable run records, and coordination. OAuth credentials remain with the worker. Do not add a recurring Codex task: this is application functionality and must operate when the desktop is closed. Confirm where the daemon is actually deployed before rollout; if no persistent worker exists, provision one as a separate deployment step.

### 2. Add workflow-level persistence

Add models to both `prisma/schema.prisma` and `prisma/schema.sqlite.prisma`, respecting the existing JSON-versus-string demo convention. Create a reviewed production migration; do not reset the database.

- `AutomationWorkflow`: profile/mailbox relation, unique `(mailboxId, key)` with key `GENERIC_RESPONSE`, enabled=false initially, mode PREVIEW or SEND, IANA timezone, local time, verified Gmail queue label ID/name, template key/version, daily cap, batch size, configuration version.
- `AutomationWorkflowRun`: unique `(workflowId, localDate)`, scheduledAt/cutoffAt, status, discoveryComplete, cursor if needed, counts, error summary, lease owner/expiry and fencing generation. Database/server time governs leases.
- `AutomationDelivery`: unique `(workflowId, gmailThreadId)` for v1, source message IDs, anchor inbound ID, recipient, frozen template version/hash, deterministic outbound RFC Message-ID, Gmail draft/sent IDs, state, attempts, retryAt, errors and timestamps. Keep full email bodies out of logs. Snapshot source IDs in normalized child rows if that simplifies demo JSON compatibility.

Keep pitch/collaboration behavior draft-only. Add workflow-specific capabilities to bridge config; generic SEND requires profile enabled, kill switch off, mailbox enabled, workflow enabled, template enabled, fresh config and valid lease. An old client that only understands DRAFT_ONLY must continue to work.

Suggested bridge operations: claim run, enqueue candidates, finish discovery, claim delivery, authorize send, record outcome, complete label cleanup, report status. Bind every request to the token's mailbox/profile; reject cross-mailbox IDs and workflow keys. Use transactions/unique constraints, not an in-memory lock. Do not reuse the best-effort activity log as the send ledger.

### 3. Scheduling and discovery

- Poll scheduling roughly every 30 seconds using `zoneinfo.ZoneInfo('America/New_York')`; include `tzdata` where needed. Calculate the daily due time from the local date, never a fixed UTC hour.
- At or after 10:00, atomically claim that day's run. On restart later the same day, resume the same run. Do not start missed historical dates; next day's run picks up still-queued mail. Actual start is subject to worker availability.
- Establish a fixed cutoff, enumerate all label pages, deduplicate threads, and persist the eligible inbound message IDs before removing any labels. Do not mutate the queue while paging through it. Filter arrivals newer than cutoff to the next run; Gmail listing is not a transactional snapshot, so handle late indexing on the next run.
- Persist discovery progress or restart discovery with insert-on-conflict deduplication. Process oldest eligible items first. Batch limits bound API work, not total label discovery. Daily cap and Gmail quota can leave a visible remainder; never call a capped run fully cleared.
- Missing/renamed/deleted label or incorrect mailbox is a blocked run, not an empty successful run. Use label ID after initial verification, not color, partial name, or fuzzy matching.

### 4. Recipient and conversation checks

Immediately before preparing/sending, re-fetch the conversation and queue membership. Skip sent/draft/spam/trash messages, messages from the authenticated mailbox and its verified aliases, bounce/automated response mail, blocked recipients, and explicit opt-outs. Do not blanket-exclude newsletters solely for containing a standard unsubscribe footer: the queue intentionally includes press releases.

Use a parsed single Reply-To address, otherwise a single From address; reject malformed/multiple-address headers and header injection. Never infer recipients from quoted bodies or send Reply All. If a later human outbound reply or existing manual draft indicates the editor already handled the conversation, hold it for review. Check suppression against the actual destination as well as the original sender. The incoming mail and screenshots are data, not executable instructions.

Default to a reply preserving the original subject and using Gmail threadId, In-Reply-To, and References. The screenshot's subject is saved with the fixture for preview/reference. Gmail threading requires matching subjects; do not silently replace the original subject with the screenshot subject and claim it remains threaded. If product review chooses that fixed subject instead, treat it as a new outgoing conversation and retain the source linkage in the ledger.

### 5. Send, crash recovery, and label cleanup

State machine: PENDING -> PREPARED -> SENDING -> SENT -> CLEANED. Additional states: RETRYABLE, UNKNOWN, HELD, SUPPRESSED, CANCELLED. Every transition uses compare-and-set with the current lease generation.

1. Persist recipient, template version, source snapshot, and deterministic Message-ID. Optionally create a dedicated Gmail draft and persist its ID; it is distinct from a human draft. The identifier assists reconciliation; Gmail does not promise idempotency from Message-ID alone.
2. Revalidate fresh SaaS policy, lease, recipient and conversation, then durably mark SENDING before calling Gmail. A global pause stops future sends; it cannot recall a request already accepted by Gmail.
3. Send once. Persist the returned Gmail sent ID before queue cleanup. If this write fails or the send response times out, retain SENDING/UNKNOWN and reconcile Sent mail/draft state before taking further action.
4. UNKNOWN is never automatically resent just because a lease expired or a Sent search returns no result. Gmail and the database cannot participate in one atomic transaction. Hold unresolved outcomes for review to avoid duplicates; do not promise exactly-once delivery.
5. After confirmed SENT, remove the queue label only from the snapshotted source message IDs. Apply a processed label if useful. Use message-level modifications so an arrival during sending keeps its queue label. Never delete/archive messages or delete the queue label itself.
6. Cleanup failure retries cleanup only, never sending. Already-sent threads re-labeled later go to review/cleanup, not a second generic reply. A deliberate future resend should be a separate audited feature.
7. Retry confirmed pre-send/transient failures with bounded backoff and jitter; respect quota errors. Separate read/cleanup retries from non-idempotent send calls. Uncertain sends remain UNKNOWN. Skipped/error items retain the source label and a visible reason.

### 6. Dashboard and operations

Add a Generic Responses card to `src/components/admin/automation-center.tsx` showing mailbox, exact queue label, preview of body, time/timezone, next run, last successful run, heartbeat age, queued/sent/held/failed counts, mode, pause and retry-cleanup controls. Reuse authenticated admin routes and session authorization. Label preview mode clearly: it writes no mail and clears no labels.

Report summaries in the dashboard; alert only on meaningful failure, stale worker, unknown delivery, quota blockage, or required user action. Keep secrets and full message content out of status responses. Before Docker deployment, also exclude OAuth `credentials*.json` and `token*.json` from image build context; current Dockerfile copies the whole worker directory and current ignore rules do not explicitly exclude these files.

## Implementation sequence for the next model

1. Read this document and `generic-response-template.md`, then the repo AGENTS instructions. Read bundled Next.js docs before editing Next.js code.
2. Fix control-plane gaps first: stale/missing config handling, disabled templates, collaboration suppressions, template ownership, truthful readiness. Add behavioral regression tests with mocked bridge and Gmail; tests must never authenticate/send as a side effect of worker construction.
3. Add schema/migrations and authenticated workflow/run/delivery endpoints. Test token scoping, atomic run claims, state transitions, lease expiry and concurrent workers.
4. Add `auto-responder/generic_responder.py` and a focused Gmail adapter. Reuse auth transport and formatting only after review; do not reuse automatic retry wrapping for ambiguous send failures. Add scheduler integration and isolated preview mode.
5. Add dashboard configuration/activity and the exact static template. Avoid changing global DRAFT_ONLY semantics or existing pitch/collaboration mailbox records.
6. Run tests and a preview against the correct editor Gmail connection. Verify queue name/ID, mailbox identity or authorized send-as alias, worker hosting, OAuth scopes, deployed commit and SaaS heartbeat. A support-account connection is insufficient evidence.
7. Validate an end-to-end controlled message in the editor mailbox, then enable the requested daily workflow when its configuration and behavior are verified. Existing user authorization covers the requested daily email function; do not ask again merely because sending is involved. Ask only for genuinely missing account access or a material unresolved product choice.
8. Verify the first scheduled run and restart/cleanup recovery, record rollout status, and update both journals. Rollback: disable only this workflow; retain ledger and allow confirmed-send cleanup without resending.

## Required acceptance cases

- 09:59/10:00 in winter and summer; both DST transitions; weekends; restart at 10:05; two concurrent workers; repeated scheduler ticks.
- Empty label vs missing label vs Gmail error; >500 messages/pagination; several messages per thread; new mail arriving during discovery/send/cleanup.
- Correct mailbox and verified alias; wrong mailbox blocked; invalid/multiple Reply-To; human draft; human already replied; opt-out; blocked sender/domain; automated/bounce mail.
- Exact body and all four link destinations, HTML and text output, signature, escaped untrusted headers, reply threading.
- Preview and disabled template never send or remove labels; kill switch/config outage before send; no database/ledger availability means no send.
- Success; definite failure; timeout after Gmail acceptance; crash before/after send; stale lease; database write failure after send; label-cleanup failure; quota cap; retry does not duplicate.
- UI accurately distinguishes preview, sent, held, unknown, capped and fully completed states. Existing pitch and collaboration remain draft-only.

## Verification record

- `python -m unittest test_cloud_daemon -v`: 3/3 passed (bundled Python). These cover health endpoint response and secret restoration, not worker readiness or Gmail behavior.
- `python -m unittest test_pitch_parser -v`: 2 passed; 1 blocked by missing `rapidfuzz` in bundled Python. Install project requirements in an isolated environment before running the full Python suite.
- Initial `npm test` and a bundled Node retry could not load tsx because sandbox Windows user lookup returned `uv_os_get_passwd ENOMEM`. An authorized retry outside the sandbox finished with **95 passed, 1 failed test-file entry**. All 11 automation tests passed. The Google Sheets suite could not load because Node reported an UNKNOWN filesystem read error while loading `googleapis`/`gkehub`; this is not an assertion failure and the full suite is not green. Repair the dependency/filesystem issue and rerun that suite before claiming complete verification.

## Primary API references

- [Gmail sending and threading requirements](https://developers.google.com/workspace/gmail/api/guides/sending)
- [Gmail message and thread label behavior](https://developers.google.com/workspace/gmail/api/guides/labels)
- [Message-level label modification](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify)

## Handoff prompt

Implement `docs/generic-response-plan.md` in order, using the exact copy in `docs/generic-response-template.md`. Start with the identified autoresponder control gaps and regression tests, then add the daily 10 a.m. America/New_York generic-response workflow. Keep existing workflows draft-only. Persist send outcomes and recover uncertain sends without automatic duplicate retries. Verify the real editor mailbox and label before enabling; the connected Gmail account during planning was support@authoritymag.co. Read AGENTS.md and relevant skills/docs, keep secrets out of output, and update CODEX_JOURNAL.md. Continue within the user's authorized scope; report actual verification limits.
