import assert from "node:assert/strict";
import test from "node:test";
import {
  hashBridgeToken,
  isSameTokenHash,
  toJsonList,
  validateTemplateVariables,
} from "../src/lib/automation/service";

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
