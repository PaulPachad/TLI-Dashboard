import assert from "node:assert/strict";
import test from "node:test";
import {
  getSpreadsheetColumnLabel,
  parseSpreadsheetColumnReference,
} from "../src/lib/google-sheets/column-label";
import { resolveTabTitle } from "../src/lib/google-sheets/client";
import { deduplicateInterviewRecords } from "../src/lib/google-sheets/deduplicate";
import { mapHeaders } from "../src/lib/google-sheets/header-mapper";
import { parseGoogleSheetUrl, appendSheetUrlParams } from "../src/lib/google-sheets/parse-url";
import {
  applyMappedHyperlinks,
  extractSocialProfiles,
  getImportedPublishStatus,
  isImportedRecordLive,
  normalizeRows,
  takeLastUsableRows,
} from "../src/lib/google-sheets/row-normalizer";
import {
  buildInterviewImageSources,
  buildBrowserSocialImageSources,
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

test("formats spreadsheet column indexes as Google Sheets letters", () => {
  assert.equal(getSpreadsheetColumnLabel(0), "A");
  assert.equal(getSpreadsheetColumnLabel(18), "S");
  assert.equal(getSpreadsheetColumnLabel(25), "Z");
  assert.equal(getSpreadsheetColumnLabel(26), "AA");
  assert.equal(getSpreadsheetColumnLabel(27), "AB");
  assert.equal(getSpreadsheetColumnLabel(701), "ZZ");
  assert.equal(getSpreadsheetColumnLabel(702), "AAA");
});

test("parses spreadsheet column letters in saved custom mappings", () => {
  assert.equal(parseSpreadsheetColumnReference("A"), 0);
  assert.equal(parseSpreadsheetColumnReference("S"), 18);
  assert.equal(parseSpreadsheetColumnReference("AA"), 26);
  assert.equal(parseSpreadsheetColumnReference("19"), 19);

  const parsed = parseGoogleSheetUrl(
    "https://docs.google.com/spreadsheets/d/sheet-id/edit#gid=789&colmap=articleUrl:S,intervieweeName:B"
  );

  assert.deepEqual(parsed.customMappings, {
    articleUrl: 18,
    intervieweeName: 1,
  });
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

test("maps Google Form upload columns to interview document and sheet images", () => {
  const rows = [
    [
      "Interviewee's Name and Company",
      "Kindly upload your interview in a Word Document here",
      "Kindly upload your first image (headshot) here ",
      "Kindly upload your second image (action shot or group photo) here ",
      "(Optional:) If you would like to include additional images, kindly upload your hi resolution images (headshots and action shots) to a google photos, googledrive, or dropbox file and paste the share link here:",
      "Authority Magazine Link",
    ],
    [
      "Adam Temple | Evolved Extraction Solutions",
      "https://drive.google.com/open?id=interview-doc",
      "https://drive.google.com/open?id=headshot-image",
      "https://drive.google.com/open?id=action-shot-image",
      "https://drive.google.com/open?id=extra-images-folder",
      "https://medium.com/authority-magazine/adam-temple",
    ],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const result = normalizeRows(rows, mappings, 0, "test-spreadsheet-id");

  assert.equal(
    mappings.find((mapping) => mapping.field === "interviewDocUrl")
      ?.columnIndex,
    1
  );
  assert.equal(
    mappings.find((mapping) => mapping.field === "image1Url")?.columnIndex,
    2
  );
  assert.equal(
    mappings.find((mapping) => mapping.field === "image2Url")?.columnIndex,
    3
  );
  assert.equal(
    mappings.find((mapping) => mapping.field === "extraImagesUrl")
      ?.columnIndex,
    4
  );
  assert.equal(result.published[0].interviewDocUrl, rows[1][1]);
  assert.equal(result.published[0].image1Url, rows[1][2]);
  assert.equal(result.published[0].image2Url, rows[1][3]);
  assert.equal(result.published[0].extraImagesUrl, rows[1][4]);
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

test("treats Estimated Publishing Date LIVE as the live status even when Emailed says Yes", () => {
  const rows = [
    ["Estimated Publishing Date", "Authority Magazine Link", "Emailed"],
    ["LIVE", "https://medium.com/authority-magazine/live-guest", "Yes"],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const result = normalizeRows(rows, mappings, 0, "test-spreadsheet-id");
  const record = result.published[0];

  assert.equal(record.estimatedPublishDate, "LIVE");
  assert.equal(record.liveEmailStatusImported, "Yes");
  assert.equal(getImportedPublishStatus(record), "LIVE");
  assert.equal(isImportedRecordLive(record), true);
});

test("keeps rows with a future publish date unpublished even when Emailed says Yes", () => {
  const rows = [
    ["Estimated Publishing Date", "Authority Magazine Link", "Emailed"],
    ["2026-07-01", "https://medium.com/authority-magazine/future-guest", "Yes"],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const result = normalizeRows(rows, mappings, 0, "test-spreadsheet-id");
  const record = result.published[0];

  assert.equal(getImportedPublishStatus(record), "2026-07-01");
  assert.equal(isImportedRecordLive(record), false);
});

test("valid Authority article links still require imported LIVE status", () => {
  const rows = [
    ["Estimated Publishing Date", "Authority Magazine Link", "Emailed"],
    ["", "https://medium.com/authority-magazine/live-link-with-blank-status", ""],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const result = normalizeRows(rows, mappings, 0, "test-spreadsheet-id");
  const record = result.published[0];

  assert.equal(getImportedPublishStatus(record), null);
  assert.equal(isImportedRecordLive(record), false);
});

test("Emailed column is ignored when deciding whether an interview is live", () => {
  const rows = [
    ["Estimated Publishing Date", "Authority Magazine Link", "Emailed"],
    ["2026-07-01", "https://medium.com/authority-magazine/live-guest", "LIVE"],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const result = normalizeRows(rows, mappings, 0, "test-spreadsheet-id");
  const record = result.published[0];

  assert.equal(record.liveEmailStatusImported, "LIVE");
  assert.equal(getImportedPublishStatus(record), "2026-07-01");
  assert.equal(isImportedRecordLive(record), false);
});

test("Send Press Email column is ignored when deciding whether an interview is live", () => {
  const rows = [
    ["Authority Magazine Link", "Send Press Email"],
    ["https://medium.com/authority-magazine/live-guest", "LIVE"],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const result = normalizeRows(rows, mappings, 0, "test-spreadsheet-id");
  const record = result.published[0];

  assert.equal(record.liveEmailStatusImported, null);
  assert.equal(getImportedPublishStatus(record), null);
  assert.equal(isImportedRecordLive(record), false);
});

test("maps a Live column as imported publish status, not email status", () => {
  const rows = [
    ["Live", "Authority Magazine Link", "Emailed"],
    ["LIVE", "https://medium.com/authority-magazine/live-guest", "No"],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const result = normalizeRows(rows, mappings, 0, "test-spreadsheet-id");
  const record = result.published[0];

  assert.equal(record.estimatedPublishDate, "LIVE");
  assert.equal(record.liveEmailStatusImported, "No");
  assert.equal(getImportedPublishStatus(record), "LIVE");
  assert.equal(isImportedRecordLive(record), true);
});

test("mapped URL columns use rich hyperlinks from Google Sheets cells", () => {
  const rows = [
    ["Authority Magazine Link", "Interviewee Name"],
    ["Read interview", "Jim Hamel"],
  ];
  const linkedRows = [
    [
      { text: "Authority Magazine Link", url: null },
      { text: "Interviewee Name", url: null },
    ],
    [
      {
        text: "Read interview",
        url: "https://medium.com/authority-magazine/jim-hamel-live-article",
      },
      { text: "Jim Hamel", url: null },
    ],
  ];
  const mappings = mapHeaders(rows[0]).mappings;
  const linked = applyMappedHyperlinks(rows, linkedRows, mappings);
  const result = normalizeRows(linked, mappings, 0, "test-spreadsheet-id");

  assert.equal(
    result.published[0].articleUrl,
    "https://medium.com/authority-magazine/jim-hamel-live-article"
  );
  assert.equal(result.published[0].intervieweeName, "Jim Hamel");
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

test("browser social image sources keep same-origin article fallback", () => {
  assert.deepEqual(
    buildBrowserSocialImageSources({
      id: "interview_1",
      image1Url: null,
      image2Url: null,
    }),
    ["/api/interviews/interview_1/article-image"]
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
  assert.equal(result.skippedNeedsAttention, 2);
  assert.ok(result.warnings.some(w => w.includes("2 row(s) were ignored because their Estimated Publishing Date contains")));
});

test("large sheet limiter does not count attention-needed rows toward the 100-row import window", () => {
  const rows = [
    ["Authority Magazine Link", "Interviewee Name", "Estimated Publishing Date"],
  ];

  for (let index = 1; index <= 2000; index++) {
    rows.push([
      `https://medium.com/authority-magazine/valid-older-${index}`,
      `Older Guest ${index}`,
      "2026-07-01",
    ]);
  }

  for (let index = 1; index <= 99; index++) {
    rows.push([
      `https://medium.com/authority-magazine/attention-needed-${index}`,
      `Attention Guest ${index}`,
      "Attention Needed",
    ]);
  }

  rows.push([
    "https://medium.com/authority-magazine/newest-valid",
    "Newest Valid Guest",
    "2026-07-02",
  ]);

  const mappings = mapHeaders(rows[0]).mappings;
  const limitedRows = takeLastUsableRows(rows, mappings, 100);
  const normalized = normalizeRows(
    [rows[0], ...limitedRows.rows],
    mappings,
    0,
    "test-spreadsheet-id",
    limitedRows.rowOffset
  );

  assert.equal(limitedRows.usableRows, 100);
  assert.equal(limitedRows.rows.length, 199);
  assert.equal(normalized.published.length, 100);
  assert.equal(normalized.skippedNeedsAttention, 99);
  assert.equal(
    normalized.published.at(-1)?.intervieweeName,
    "Newest Valid Guest"
  );
});

test("serializes and parses customMappings and importAll parameters in Google Sheets URLs", () => {
  const originalUrl = "https://docs.google.com/spreadsheets/d/abc-123/edit#gid=456";
  const updatedUrl = appendSheetUrlParams(originalUrl, {
    importAll: true,
    customMappings: {
      articleUrl: 5,
      intervieweeName: 1,
    },
  });

  assert.ok(updatedUrl.includes("importAll=true"));
  assert.ok(updatedUrl.includes("colmap=articleUrl:5,intervieweeName:1"));

  const parsed = parseGoogleSheetUrl(updatedUrl);
  assert.equal(parsed.spreadsheetId, "abc-123");
  assert.equal(parsed.gid, "456");
  assert.equal(parsed.importAll, true);
  assert.deepEqual(parsed.customMappings, {
    articleUrl: 5,
    intervieweeName: 1,
  });
});

test("supports smart content-based detection of columns", () => {
  const headers = ["Random Header 1", "Guest", "Unrelated Col", "Published Link"];
  const rows = [
    headers,
    ["", "Sheri Bronstein", "Random Text", "https://medium.com/authority-magazine/sheri-bronstein-live"],
    ["", "Kim Dixon", "Other Stuff", "https://medium.com/authority-magazine/kim-dixon"],
  ];

  // Run header mapping with row data. Published Link is not in FIELD_ALIASES, but contains Authority Mag URLs.
  // Guest is mapped to intervieweeName fuzzy/alias.
  const result = mapHeaders(headers, rows);

  const articleUrlMapping = result.mappings.find((m) => m.field === "articleUrl");
  assert.ok(articleUrlMapping);
  assert.equal(articleUrlMapping.columnIndex, 3);
  assert.equal(articleUrlMapping.matchedHeader, "Published Link");
});

test("applies customMapping overrides correctly", () => {
  const headers = ["Wrong Guest Name", "Correct Guest Name", "Authority Magazine Link"];
  const customMappings = {
    intervieweeName: 1, // manually map to Correct Guest Name instead of auto-matching Wrong Guest Name
  };

  const result = mapHeaders(headers, undefined, customMappings);
  
  const nameMapping = result.mappings.find((m) => m.field === "intervieweeName");
  assert.ok(nameMapping);
  assert.equal(nameMapping.columnIndex, 1);
  assert.equal(nameMapping.matchedHeader, "Correct Guest Name");
  assert.equal(nameMapping.matchType, "manual");
});

test("smart detection ignores dropbox.com/ URLs and URLs whose path merely contains x.com/ when matching twitterUrl", () => {
  // Column 1 (Dropbox Link): should not map
  const res1 = mapHeaders(["Header"], [["Header"], ["https://www.dropbox.com/sh/abc/xyz"]]);
  assert.ok(!res1.mappings.find((m) => m.field === "twitterUrl"));

  // Column 2 (Path With X Link): should not map
  const res2 = mapHeaders(["Header"], [["Header"], ["https://example.com/some/path/x.com/abc"]]);
  assert.ok(!res2.mappings.find((m) => m.field === "twitterUrl"));

  // Column 3 (Subdomain Twitter Link): should map
  const res3 = mapHeaders(["Header"], [["Header"], ["https://sub.twitter.com/user"]]);
  assert.ok(res3.mappings.find((m) => m.field === "twitterUrl"));

  // Column 4 (Valid X Link): should map
  const res4 = mapHeaders(["Header"], [["Header"], ["x.com/user"]]);
  assert.ok(res4.mappings.find((m) => m.field === "twitterUrl"));
});
