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

