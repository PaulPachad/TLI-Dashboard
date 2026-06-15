// ==============================================================================
// parseGoogleSheetUrl — Extracts spreadsheetId and gid from any Google Sheets URL
// ==============================================================================
//
// Supports:
//   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=123
//   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?gid=123#gid=123
//   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?resourcekey=&gid=123#gid=123
//   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
//
// If no gid is found, returns null (caller should use first tab).

export interface ParsedSheetUrl {
  spreadsheetId: string;
  gid: string | null;
}

export function parseGoogleSheetUrl(url: string): ParsedSheetUrl {
  if (!url || typeof url !== "string") {
    throw new SheetUrlError("Please provide a Google Sheets URL.");
  }

  const trimmed = url.trim();

  // Validate it looks like a Google Sheets URL
  if (!trimmed.includes("docs.google.com/spreadsheets/d/")) {
    throw new SheetUrlError(
      "This does not look like a Google Sheets URL. " +
        "Please paste a link like: https://docs.google.com/spreadsheets/d/..."
    );
  }

  // Extract spreadsheet ID — the segment between /d/ and the next /
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch || !idMatch[1]) {
    throw new SheetUrlError(
      "Could not find a spreadsheet ID in this URL. " +
        "Please paste the full Google Sheets URL from your browser."
    );
  }

  const spreadsheetId = idMatch[1];

  // Extract gid — check both query params and hash fragment
  let gid: string | null = null;

  // Try query parameter first: ?gid=123 or &gid=123
  const queryGidMatch = trimmed.match(/[?&]gid=(\d+)/);
  if (queryGidMatch) {
    gid = queryGidMatch[1];
  }

  // Try hash fragment: #gid=123
  if (!gid) {
    const hashGidMatch = trimmed.match(/#gid=(\d+)/);
    if (hashGidMatch) {
      gid = hashGidMatch[1];
    }
  }

  return { spreadsheetId, gid };
}

export class SheetUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetUrlError";
  }
}
