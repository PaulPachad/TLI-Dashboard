import assert from "node:assert/strict";
import test from "node:test";

// Helper/sync formatting logic extracted for testing
const formatCell = (cell: { text: string; url: string | null } | undefined) => {
  if (!cell) return null;
  const text = cell.text ? cell.text.trim() : "";
  if (!text) return null;
  if (cell.url) {
    const url = cell.url.trim();
    if (url && url !== text) {
      return `[${text}](${url})`;
    }
  }
  return text;
};

// Column merging logic extracted for testing
const mergeQuestionsAndTemplates = (qText: string | null, tText: string | null) => {
  let interviewQuestionsValue: string | null = null;
  if (qText && tText) {
    const qt = qText.trim();
    const tt = tText.trim();
    if (qt && tt) {
      if (qt === tt) {
        interviewQuestionsValue = qt;
      } else {
        interviewQuestionsValue = `${qt}\n\n${tt}`;
      }
    } else {
      interviewQuestionsValue = qt || tt || null;
    }
  } else {
    interviewQuestionsValue = qText || tText || null;
  }
  return interviewQuestionsValue;
};

// Contact email parsing logic extracted for testing
function parseContactEmails(contactStr: string) {
  if (!contactStr) return [];
  const tokens = contactStr.split(/[\s,;]+/);
  return tokens
    .map(token => token.replace(/[\(\)]/g, "").trim())
    .filter(token => token.includes("@"));
}

test("formatCell handles empty and space values", () => {
  assert.equal(formatCell(undefined), null);
  assert.equal(formatCell({ text: "", url: null }), null);
  assert.equal(formatCell({ text: "  ", url: null }), null);
  assert.equal(formatCell({ text: "  ", url: "https://example.com" }), null);
  assert.equal(formatCell({ text: "Link", url: null }), "Link");
  assert.equal(formatCell({ text: "Link", url: "https://example.com" }), "[Link](https://example.com)");
  assert.equal(formatCell({ text: "https://example.com", url: "https://example.com" }), "https://example.com");
});

test("mergeQuestionsAndTemplates merges suggestions and templates correctly", () => {
  // Both empty/null
  assert.equal(mergeQuestionsAndTemplates(null, null), null);
  assert.equal(mergeQuestionsAndTemplates(" ", "  "), null);
  
  // Only one present
  assert.equal(mergeQuestionsAndTemplates("Eden Questions", null), "Eden Questions");
  assert.equal(mergeQuestionsAndTemplates(null, "[Template](https://doc)"), "[Template](https://doc)");
  
  // Both present, identical
  assert.equal(mergeQuestionsAndTemplates("Eden Questions", "Eden Questions"), "Eden Questions");
  
  // Both present, different
  assert.equal(
    mergeQuestionsAndTemplates("Eden Questions", "[Template](https://doc)"),
    "Eden Questions\n\n[Template](https://doc)"
  );
});

test("parseContactEmails parses various formatted emails", () => {
  assert.deepEqual(parseContactEmails(""), []);
  assert.deepEqual(parseContactEmails("events@mobiledisrupt.com"), ["events@mobiledisrupt.com"]);
  assert.deepEqual(
    parseContactEmails("hello@pne-uk.com / info@pne-uk.com"),
    ["hello@pne-uk.com", "info@pne-uk.com"]
  );
  assert.deepEqual(
    parseContactEmails("hello@pne-uk.com, info@pne-uk.com; support@pne.com"),
    ["hello@pne-uk.com", "info@pne-uk.com", "support@pne.com"]
  );
});
