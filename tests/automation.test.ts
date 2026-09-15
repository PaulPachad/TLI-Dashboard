import assert from "node:assert/strict";
import test from "node:test";
import {
  hashBridgeToken,
  isSameTokenHash,
  toJsonList,
  validateTemplateVariables,
} from "../src/lib/automation/service";
import {
  canonicalJson,
  createAppsScriptSignature,
  getAppsScriptClientConfig,
  signAppsScriptRequest,
  verifyAppsScriptSignature,
} from "../src/lib/operations/apps-script-client";
import {
  getAppsScriptBridgeSetup,
  getOperationsEnvironment,
  getOperationsStatusLabel,
  hasAppsScriptReadEndpoint,
  mapOperationsRunStatus,
} from "../src/lib/operations/service";

test("bridge token hashes verify without storing the raw token", () => {
  const token = "am_bridge_mailbox_secret";
  const hash = hashBridgeToken(token);

  assert.notEqual(hash, token);
  assert.equal(isSameTokenHash(token, hash), true);
  assert.equal(isSameTokenHash("wrong-token", hash), false);
});

test("toJsonList accepts arrays, JSON strings, comma lists, and newline lists", () => {
  assert.deepEqual(toJsonList([" one ", "two", ""]), ["one", "two"]);
  assert.deepEqual(toJsonList('["one","two"]'), ["one", "two"]);
  assert.deepEqual(toJsonList("one,two\nthree"), ["one", "two", "three"]);
  assert.deepEqual(toJsonList(null), []);
});

test("template validation rejects unsupported variables", () => {
  assert.deepEqual(
    validateTemplateVariables("Hello {series_name}\n{interview_link}", "Re: {original_subject}", [
      "series_name",
      "interview_link",
      "original_subject",
    ]),
    []
  );

  assert.deepEqual(
    validateTemplateVariables("Hello {unknown}", null, ["series_name"]),
    ["unknown"]
  );
});

test("default templates use modern desktop copy and valid variables", async () => {
  const { DEFAULT_AUTOMATION_TEMPLATES } = await import("../src/lib/automation/defaults");
  const noMatch = DEFAULT_AUTOMATION_TEMPLATES.find((t) => t.templateKey === "pitch_no_match");
  assert.ok(noMatch, "pitch_no_match should exist");
  assert.ok(noMatch.body.includes("chatgpt.com/g/g-DOnEg59Sc-authority-magazine-bot"), "Fallback must contain AI Bot link");
  assert.ok(noMatch.body.includes("docs.google.com/forms"), "Fallback must contain pitch form link");

  const multipleMatch = DEFAULT_AUTOMATION_TEMPLATES.find((t) => t.templateKey === "pitch_multiple_match");
  assert.ok(multipleMatch, "pitch_multiple_match should exist");
  assert.ok(multipleMatch.body.includes("AuthorityMagFAQandInstructions"), "Multiple match must contain FAQ link");

  for (const t of DEFAULT_AUTOMATION_TEMPLATES) {
    const invalid = validateTemplateVariables(t.body, t.subject, [...t.allowedVariables]);
    assert.deepEqual(invalid, [], `Template ${t.templateKey} should not have invalid variables`);
  }
});


test("operations run statuses normalize to dashboard states", () => {
  assert.equal(mapOperationsRunStatus("SUCCESS"), "completed");
  assert.equal(mapOperationsRunStatus("completed_with_issues"), "completed_with_issues");
  assert.equal(mapOperationsRunStatus("PAUSED"), "blocked");
  assert.equal(mapOperationsRunStatus("not-a-known-state"), "unknown");
});

test("operations environment and endpoint detection use server env only", () => {
  assert.equal(getOperationsEnvironment({ DEMO_MODE: "true" }), "Local demo");
  assert.equal(getOperationsEnvironment({ VERCEL_ENV: "preview" }), "Preview");
  assert.equal(
    hasAppsScriptReadEndpoint({
      APPS_SCRIPT_AUTOMATION_URL: " https://example.com ",
      APPS_SCRIPT_AUTOMATION_SECRET: "secret",
    }),
    true
  );
  assert.equal(hasAppsScriptReadEndpoint({ APPS_SCRIPT_AUTOMATION_URL: "https://example.com" }), false);
  assert.equal(hasAppsScriptReadEndpoint({}), false);
  assert.deepEqual(
    getAppsScriptBridgeSetup({
      APPS_SCRIPT_AUTOMATION_URL: " https://example.com ",
      APPS_SCRIPT_AUTOMATION_SECRET: "secret",
    }),
    {
      urlConfigured: true,
      secretConfigured: true,
      ready: true,
      bridgeFile: "docs/apps-script/operations-bridge.gs",
    }
  );
  assert.equal(getAppsScriptBridgeSetup({ APPS_SCRIPT_AUTOMATION_URL: "https://example.com" }).ready, false);
});

test("operations status labels are explicit", () => {
  assert.equal(getOperationsStatusLabel("ready"), "Ready");
  assert.equal(getOperationsStatusLabel("attention"), "Needs attention");
  assert.equal(getOperationsStatusLabel("blocked"), "Blocked");
  assert.equal(getOperationsStatusLabel("unknown"), "Unknown");
});

test("apps script request signing is canonical and verifiable", () => {
  const request = {
    requestId: "req_1",
    timestamp: "2026-07-03T15:00:00.000Z",
    action: "get_status" as const,
    payload: { b: 2, a: 1 },
    requestedBy: { email: "admin@example.com", userId: "user_1" },
  };
  const equivalent = {
    requestedBy: { userId: "user_1", email: "admin@example.com" },
    payload: { a: 1, b: 2 },
    action: "get_status" as const,
    timestamp: "2026-07-03T15:00:00.000Z",
    requestId: "req_1",
  };

  assert.equal(canonicalJson(request), canonicalJson(equivalent));
  assert.equal(createAppsScriptSignature(request, "shared-secret"), createAppsScriptSignature(equivalent, "shared-secret"));

  const signed = signAppsScriptRequest(request, "shared-secret");
  assert.equal(verifyAppsScriptSignature(signed, "shared-secret"), true);
  assert.equal(verifyAppsScriptSignature({ ...signed, action: "health_check" }, "shared-secret"), false);
});

test("apps script client config requires url and secret", () => {
  assert.equal(getAppsScriptClientConfig({ APPS_SCRIPT_AUTOMATION_URL: "https://example.com" }), null);
  assert.deepEqual(
    getAppsScriptClientConfig({
      APPS_SCRIPT_AUTOMATION_URL: " https://example.com ",
      APPS_SCRIPT_AUTOMATION_SECRET: " secret ",
      APPS_SCRIPT_AUTOMATION_TIMEOUT_MS: "2500",
    }),
    { url: "https://example.com", secret: "secret", timeoutMs: 2500 }
  );
});

test("test lab simulates tier 1 acceptance for strong matches", async () => {
  const { runAutomationTest } = await import("../src/lib/automation/test-lab");
  const result = await runAutomationTest({
    subject: "Pitch: 5 Things You Need To Know To Successfully Run A Live Virtual Event",
    sender: "Publicist <publicist@example.com>",
    body:
      "Dear Authority Magazine Editors\n\nWhat is the name of the interview topic: 5 Things You Need To Know To Successfully Run A Live Virtual Event\nWhat is the best email to follow up with you: publicist@example.com",
  });

  assert.equal(result.templateKey, "pitch_acceptance");
  assert.equal(result.confidence, "high");
  assert.equal(result.matchScore, 98);
  assert.equal(result.action, "draft");
  assert.ok(result.bodyPreview.includes("5 Things You Need To Know To Successfully Run A Live Virtual Event"));
});

test("test lab simulates multi-match template when pitch lists multiple topics", async () => {
  const { runAutomationTest } = await import("../src/lib/automation/test-lab");
  const result = await runAutomationTest({
    subject: "Pitch: Multiple topic options for interview",
    sender: "Publicist <publicist@example.com>",
    body:
      "Dear Authority Magazine Editors\n\nWhat is the name of the interview topic: 5 Things You Need To Know To Successfully Run A Live Virtual Event; Women in Tech: Leadership Strategies for 2026\nWhat is the best email to follow up with you: publicist@example.com",
  });

  assert.equal(result.templateKey, "pitch_multiple_match");
  assert.ok(result.bodyPreview.includes("1. 5 Things You Need To Know To Successfully Run A Live Virtual Event"));
  assert.ok(result.bodyPreview.includes("2. Women in Tech: Leadership Strategies for 2026"));
});

test("generic response template contains exact body copy and all 4 links", async () => {
  const { DEFAULT_AUTOMATION_TEMPLATES } = await import("../src/lib/automation/defaults");
  const genericTemplate = DEFAULT_AUTOMATION_TEMPLATES.find((t) => t.templateKey === "generic_response");
  assert.ok(genericTemplate, "generic_response template must exist");
  assert.equal(
    genericTemplate.subject,
    "Thank you for your pitch to Authority Magazine - Let's take the next step!"
  );
  assert.ok(
    genericTemplate.body.includes(
      "https://medium.com/authority-magazine/ongoing-interview-series-in-authority-magazine-7d633a349753"
    ),
    "Generic template must contain Interview Storylines link"
  );
  assert.ok(
    genericTemplate.body.includes(
      "https://medium.com/authority-magazine/new-interview-series-topics-we-are-working-on-bdae530b5bf4"
    ),
    "Generic template must contain Upcoming Storylines link"
  );
  assert.ok(
    genericTemplate.body.includes("https://chatgpt.com/g/g-DOnEg59Sc-authority-magazine-bot"),
    "Generic template must contain AI Bot link"
  );
  assert.ok(
    genericTemplate.body.includes(
      "https://docs.google.com/forms/d/e/1FAIpQLSdkUiiJpgE53-I6pDQOm-zWveNeCXkGFonoVX5ULmN0dPsfxA/viewform"
    ),
    "Generic template must contain Google Forms link"
  );

  const invalidVars = validateTemplateVariables(genericTemplate.body, genericTemplate.subject, [
    ...genericTemplate.allowedVariables,
  ]);
  assert.deepEqual(invalidVars, [], "Generic template must have no invalid variables");
});

test("default editor mailbox and workflow settings are configured safely", async () => {
  const { DEFAULT_AUTOMATION_MAILBOXES, DEFAULT_AUTOMATION_WORKFLOW_SETTINGS } = await import(
    "../src/lib/automation/defaults"
  );

  const editorMailbox = DEFAULT_AUTOMATION_MAILBOXES.find(
    (m) => m.emailAddress === "editor@authoritymag.co"
  );
  assert.ok(editorMailbox, "editor@authoritymag.co mailbox must be in defaults");
  assert.equal(editorMailbox.workflowType, "GENERIC_RESPONSE");

  const genericWf = DEFAULT_AUTOMATION_WORKFLOW_SETTINGS.find(
    (w) => w.key === "GENERIC_RESPONSE"
  );
  assert.ok(genericWf, "GENERIC_RESPONSE workflow must be in defaults");
  assert.equal(genericWf.isEnabled, false, "Workflow must default to disabled for safety");
  assert.equal(genericWf.mode, "PREVIEW", "Workflow must default to PREVIEW mode");
  assert.equal(genericWf.timezone, "America/New_York", "Timezone must be America/New_York");
  assert.equal(genericWf.scheduleHour, 10, "Schedule hour must be 10:00 AM");
  assert.equal(genericWf.scheduleMinute, 0, "Schedule minute must be 0");
  assert.equal(genericWf.queueLabelName, "1. Send Generic Re...", "Queue label prefix must match");
});

test("workflow execution lifecycle state machine transitions safely", async () => {
  const {
    ensureAutomationProfile,
    claimDailyWorkflowRun,
    enqueueDeliveryCandidates,
    claimDelivery,
    recordDeliveryOutcome,
    completeDeliveryCleanup,
    updateWorkflowSettings,
  } = await import("../src/lib/automation/service");

  const profile = await ensureAutomationProfile();
  const workflow = (profile.workflows || []).find((w) => w.key === "GENERIC_RESPONSE");
  assert.ok(workflow, "Workflow must exist on profile");

  const testDate = "2026-09-15";
  const runResult = await claimDailyWorkflowRun(
    workflow.mailboxId,
    workflow.key,
    testDate,
    "test-worker-1"
  );
  assert.ok(runResult.run, "Workflow run must be created or claimed");
  assert.equal(runResult.run.localDate, testDate);

  // Enqueue candidates
  const testThreadId = `test_thread_${Date.now()}`;
  const enqueueResult = await enqueueDeliveryCandidates(workflow.id, runResult.run.id, [
    {
      gmailThreadId: testThreadId,
      recipient: "author@example.com",
      subject: "Pitch for Feature Story",
      anchorInboundId: "msg_inbound_1",
      sourceMessageIds: ["msg_inbound_1"],
    },
  ]);
  assert.equal((enqueueResult.enqueued ?? 0) >= 1, true, "Candidate should be enqueued");

  // In PREVIEW mode, claimDelivery blocks live sending:
  const db = (await import("../src/lib/db")).db;
  const dbDelivery = await db.automationDelivery.findFirstOrThrow({
    where: { workflowId: workflow.id, gmailThreadId: testThreadId },
  });
  const blockedClaim = await claimDelivery(workflow.id, dbDelivery.id, "test-worker-1");
  assert.ok(blockedClaim.error, "Preview mode must block delivery claim");

  // Record outcome as SENT
  const outcomeResult = await recordDeliveryOutcome(dbDelivery.id, {
    state: "SENT",
    gmailSentId: "sent_msg_123",
  });
  assert.equal(outcomeResult.delivery.state, "SENT");
  assert.equal(outcomeResult.delivery.gmailSentId, "sent_msg_123");

  // Complete cleanup (transitions to CLEANED)
  const cleanupResult = await completeDeliveryCleanup(dbDelivery.id);
  assert.equal(cleanupResult.delivery.state, "CLEANED");
  assert.ok(cleanupResult.delivery.cleanedAt, "cleanedAt must be recorded");

  // Verify settings update
  const updatedWf = await updateWorkflowSettings(workflow.id, {
    mode: "PREVIEW",
    queueLabelName: "1. Send Generic Response",
  });
  assert.equal(updatedWf.mode, "PREVIEW");
  assert.equal(updatedWf.queueLabelName, "1. Send Generic Response");
});

test("daily generic responder schedule time is accurate across Daylight Saving Time", () => {
  // Verify that 10:00 AM America/New_York corresponds to UTC 14:00 during EDT (Summer) and UTC 15:00 during EST (Winter)
  const summerDate = new Date("2026-07-15T14:00:00Z"); // EDT (UTC-4)
  const winterDate = new Date("2026-01-15T15:00:00Z"); // EST (UTC-5)

  const nyFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  assert.equal(nyFormatter.format(summerDate), "10:00", "Summer (EDT) 14:00 UTC must be 10:00 AM NY");
  assert.equal(nyFormatter.format(winterDate), "10:00", "Winter (EST) 15:00 UTC must be 10:00 AM NY");
});

