import assert from "node:assert/strict";
import test from "node:test";
import { resolveTabTitle } from "../src/lib/google-sheets/client";
import { deduplicateInterviewRecords } from "../src/lib/google-sheets/deduplicate";
import { mapHeaders } from "../src/lib/google-sheets/header-mapper";
import { parseGoogleSheetUrl } from "../src/lib/google-sheets/parse-url";
import {
  extractSocialProfiles,
  normalizeRows,
} from "../src/lib/google-sheets/row-normalizer";
import {
  buildInterviewImageSources,
  extractArticleImage,
  extractArticleMetadata,
  extractArticleTitle,
  extractArticleTitleFromUrl,
  normalizeSheetImageUrl,
} from "../src/lib/images/interview-image";

test("parses spreadsheet id and gid from a normal Google Sheets URL", () => {
  assert.deepEqual(
    parseGoogleSheetUrl(
      "https://docs.google.com/spreadsheets/d/example-sheet_123/edit#gid=456"
    ),
    { spreadsheetId: "example-sheet_123", gid: "456" }
  );
});

test("parses supported Google Sheets URL variants", () => {
  const variants = [
    "https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=789#gid=789",
    "https://docs.google.com/spreadsheets/d/sheet-id/edit?resourcekey=abc&gid=789",
    "https://docs.google.com/spreadsheets/d/sheet-id/edit#gid=789",
  ];

  for (const url of variants) {
    assert.deepEqual(parseGoogleSheetUrl(url), {
      spreadsheetId: "sheet-id",
      gid: "789",
    });
  }
  assert.deepEqual(
    parseGoogleSheetUrl(
      "https://docs.google.com/spreadsheets/d/sheet-id/edit"
    ),
    { spreadsheetId: "sheet-id", gid: null }
  );
});

test("rejects links that are not Google Sheets URLs", () => {
  assert.throws(
    () => parseGoogleSheetUrl("https://example.com/spreadsheet"),
    /does not look like a Google Sheets URL/
  );
});

test("link-accessible mode preserves a real spreadsheet tab gid", async () => {
  const previousDemoMode = process.env.DEMO_MODE;
  const previousEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const previousKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  process.env.DEMO_MODE = "true";
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  try {
    assert.equal(
      await resolveTabTitle("real-sheet-id", "892423731"),
      "Google Sheet tab 892423731"
    );
  } finally {
    if (previousDemoMode === undefined) {
      delete process.env.DEMO_MODE;
    } else {
      process.env.DEMO_MODE = previousDemoMode;
    }
    if (previousEmail === undefined) {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    } else {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = previousEmail;
    }
    if (previousKey === undefined) {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    } else {
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = previousKey;
    }
  }
});

test("maps common Authority Magazine sheet headers", () => {
  const result = mapHeaders([
    "Authority Magazine Link",
    "Interviewee Name",
    "Interviewee Email",
    "Topic",
  ]);

  assert.equal(result.missingRequired.length, 0);
  assert.equal(
    result.mappings.find((mapping) => mapping.field === "articleUrl")
      ?.columnIndex,
    0
  );
});

test("maps and extracts social profiles from the combined sheet question", () => {
  const socialHeader =
    "(Optional:) If you would like us to tag you on social media when we share it, please list your profiles: ";
  const rows = [
    ["Authority Magazine Link", "Interviewee Name", socialHeader],
    [
      "https://medium.com/authority-magazine/jane-doe",
      "Jane Doe",
      "LinkedIn: https://www.linkedin.com/in/jane-doe Instagram: https://instagram.com/janedoe",
    ],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const result = normalizeRows(rows, mappings);

  assert.equal(
    mappings.find((mapping) => mapping.field === "socialProfiles")?.columnIndex,
    2
  );
  assert.equal(
    result.published[0].linkedinUrl,
    "https://www.linkedin.com/in/jane-doe"
  );
  assert.equal(result.published[0].twitterUrl, null);
  assert.deepEqual(extractSocialProfiles("Find me at https://x.com/janedoe"), {
    linkedinUrl: null,
    twitterUrl: "https://x.com/janedoe",
  });
});

test("imports only Authority Magazine article URLs", () => {
  const rows = [
    ["Authority Magazine Link", "Interviewee Name"],
    [
      "https://medium.com/authority-magazine/a-valid-interview-123",
      "Valid Guest",
    ],
    ["https://example.com/not-authority-magazine", "Wrong Publication"],
    ["", "Unpublished Guest"],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const result = normalizeRows(rows, mappings);

  assert.equal(result.published.length, 1);
  assert.equal(result.published[0].intervieweeName, "Valid Guest");
  assert.equal(result.unpublished.length, 2);
  assert.equal(result.unpublished[0].intervieweeName, "Wrong Publication");
  assert.equal(result.unpublished[1].reason, "Authority Magazine Link is missing");
  assert.equal(result.skippedInvalidArticle, 1);
  assert.equal(result.skippedNoArticle, 1);
});

test("imports unpublished guest rows when spreadsheetId is provided", () => {
  const rows = [
    ["Authority Magazine Link", "Interviewee Name"],
    [
      "https://medium.com/authority-magazine/a-valid-interview-123",
      "Valid Guest",
    ],
    ["https://example.com/not-authority-magazine", "Wrong Publication"],
    ["", "Unpublished Guest"],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const result = normalizeRows(rows, mappings, 0, "test-spreadsheet-id");

  assert.equal(result.published.length, 3);
  assert.equal(result.published[0].intervieweeName, "Valid Guest");
  assert.equal(result.published[1].intervieweeName, "Wrong Publication");
  assert.equal(result.published[2].intervieweeName, "Unpublished Guest");

  assert.equal(result.published[1].articleUrl, "https://authoritymagazine.com/unpublished/test-spreadsheet-id/3");
  assert.equal(result.published[2].articleUrl, "https://authoritymagazine.com/unpublished/test-spreadsheet-id/4");
});

test("deduplicates repeated article links within one sheet", () => {
  const rows = [
    ["Authority Magazine Link", "Interviewee Name"],
    [
      "https://medium.com/authority-magazine/repeated-article/",
      "Original Guest",
    ],
    [
      "https://medium.com/authority-magazine/repeated-article",
      "Duplicate Guest",
    ],
    [
      "https://medium.com/authority-magazine/unique-article",
      "Unique Guest",
    ],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const normalized = normalizeRows(rows, mappings);
  const result = deduplicateInterviewRecords(normalized.published);

  assert.deepEqual(
    result.records.map((record) => record.intervieweeName),
    ["Original Guest", "Unique Guest"]
  );
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].duplicate.sourceRowNumber, 3);
  assert.equal(result.duplicates[0].originalRowNumber, 2);
});

test("converts Google Drive image links to direct thumbnails", () => {
  assert.equal(
    normalizeSheetImageUrl(
      "https://drive.google.com/open?id=example-drive-image"
    ),
    "https://lh3.googleusercontent.com/d/example-drive-image=w1200"
  );
  assert.equal(
    normalizeSheetImageUrl(
      "https://drive.google.com/file/d/example-file-image/view"
    ),
    "https://lh3.googleusercontent.com/d/example-file-image=w1200"
  );
});

test("interview cards use normalized image fields before article fallback", () => {
  assert.deepEqual(
    buildInterviewImageSources({
      id: "interview_1",
      image1Url: "https://drive.google.com/open?id=image-one",
      image2Url: "https://example.com/image-two.jpg",
    }),
    [
      "https://lh3.googleusercontent.com/d/image-one=w1200",
      "https://example.com/image-two.jpg",
      "/api/interviews/interview_1/article-image",
    ]
  );
});

test("extracts article social images from metadata", () => {
  assert.equal(
    extractArticleImage(
      '<meta property="og:image" content="https://cdn.example.com/photo.jpg">'
    ),
    "https://cdn.example.com/photo.jpg"
  );
  assert.equal(
    extractArticleImage(
      '<meta content="https://cdn.example.com/twitter.jpg" name="twitter:image">'
    ),
    "https://cdn.example.com/twitter.jpg"
  );
});

test("extracts and cleans article titles from metadata", () => {
  assert.equal(
    extractArticleTitle(
      '<meta property="og:title" content="Grace Muggeridge Of Alice Camera On The Five Things You Need To Shine In Film - Authority Magazine">'
    ),
    "Grace Muggeridge Of Alice Camera On The Five Things You Need To Shine In Film"
  );
  assert.equal(
    extractArticleTitle("<title>Jane Doe &amp; Her Story | Medium</title>"),
    "Jane Doe & Her Story"
  );
  assert.deepEqual(
    extractArticleMetadata(
      '<meta property="og:title" content="A Real Article"><meta property="og:image" content="https://cdn.example.com/a.jpg">'
    ),
    {
      title: "A Real Article",
      imageUrl: "https://cdn.example.com/a.jpg",
    }
  );
});

test("extracts readable article titles from Medium URL slugs", () => {
  assert.equal(
    extractArticleTitleFromUrl(
      "https://medium.com/authority-magazine/rising-star-tegan-muggeridge-on-the-five-things-you-need-to-shine-in-the-entertainment-industry-87e9d984f96f"
    ),
    "Rising Star Tegan Muggeridge on the Five Things You Need to Shine in the Entertainment Industry"
  );
  assert.equal(
    extractArticleTitleFromUrl(
      "https://authoritymagazine.com/unpublished/sheet/3"
    ),
    null
  );
});

test("ignores rows with 'attention needed' in the estimated publishing date", () => {
  const rows = [
    ["Authority Magazine Link", "Interviewee Name", "Estimated Publishing Date"],
    [
      "https://medium.com/authority-magazine/jane-doe",
      "Jane Doe",
      "2026-07-01",
    ],
    [
      "https://medium.com/authority-magazine/john-doe",
      "John Doe",
      "Attention Needed",
    ],
    [
      "https://medium.com/authority-magazine/bob-doe",
      "Bob Doe",
      "Attention Needed, please resubmit",
    ],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const result = normalizeRows(rows, mappings);

  assert.equal(result.published.length, 1);
  assert.equal(result.published[0].intervieweeName, "Jane Doe");
  assert.equal(result.unpublished.length, 0);
});
