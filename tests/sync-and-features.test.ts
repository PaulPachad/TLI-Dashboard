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

// Event date parsing function extracted for testing
function parseEventDate(dateStr: string | null): Date {
  if (!dateStr) return new Date(864000000000000);
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  const str = dateStr.toLowerCase();
  let foundMonthIndex = -1;
  let earliestPos = Infinity;
  months.forEach((m, idx) => {
    const pos = str.indexOf(m);
    if (pos !== -1 && pos < earliestPos) {
      earliestPos = pos;
      foundMonthIndex = idx;
    }
  });
  if (foundMonthIndex === -1) return new Date(864000000000000);
  const afterMonth = str.substring(earliestPos + months[foundMonthIndex].length);
  const dayMatch = afterMonth.match(/\d+/);
  const day = dayMatch ? parseInt(dayMatch[0], 10) : 1;
  return new Date(2026, foundMonthIndex, day);
}

test("parseEventDate parses and chronologically sorts date strings", () => {
  const dateJune = parseEventDate("June 28–July 1");
  const dateJulyEarly = parseEventDate("July 7–8");
  const dateJulyLate = parseEventDate("July 22–27");
  const dateSeptEarly = parseEventDate("September 4–7");
  const dateSeptLate = parseEventDate("September 15–17");

  assert.equal(dateJune.getMonth(), 5); // June
  assert.equal(dateJune.getDate(), 28);
  
  assert.equal(dateJulyEarly.getMonth(), 6); // July
  assert.equal(dateJulyEarly.getDate(), 7);

  // June 28 < July 7
  assert.ok(dateJune.getTime() < dateJulyEarly.getTime());
  
  // July 7 < July 22
  assert.ok(dateJulyEarly.getTime() < dateJulyLate.getTime());

  // July 22 < Sept 4
  assert.ok(dateJulyLate.getTime() < dateSeptEarly.getTime());

  // Sept 4 < Sept 15
  assert.ok(dateSeptEarly.getTime() < dateSeptLate.getTime());
});
