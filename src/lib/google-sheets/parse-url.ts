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

import { parseSpreadsheetColumnReference } from "./column-label";

export interface ParsedSheetUrl {
  spreadsheetId: string;
  gid: string | null;
  customMappings?: Record<string, number>;
  importAll?: boolean;
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

  // Extract customMappings and importAll from query parameters or hash fragment
  const customMappings: Record<string, number> = {};
  let importAll = false;

  const parseParams = (str: string) => {
    // extract colmap
    const colmapMatch = str.match(/[?&#]colmap=([^&]+)/);
    if (colmapMatch) {
      const parts = decodeURIComponent(colmapMatch[1]).split(",");
      for (const part of parts) {
        const [field, indexStr] = part.split(":");
        if (field && indexStr) {
          const idx = parseSpreadsheetColumnReference(indexStr);
          if (idx !== null) {
            customMappings[field] = idx;
          }
        }
      }
    }

    // extract importAll
    const importAllMatch = str.match(/[?&#]importAll=(true|false)/);
    if (importAllMatch) {
      importAll = importAllMatch[1] === "true";
    }
  };

  parseParams(trimmed);

  const result: ParsedSheetUrl = {
    spreadsheetId,
    gid,
  };

  if (Object.keys(customMappings).length > 0) {
    result.customMappings = customMappings;
  }
  if (importAll) {
    result.importAll = importAll;
  }

  return result;
}

export function appendSheetUrlParams(
  url: string,
  params: { customMappings?: Record<string, number>; importAll?: boolean }
): string {
  const cleanUrl = url.trim();
  let base = cleanUrl;
  let hash = "";

  const hashIdx = cleanUrl.indexOf("#");
  if (hashIdx !== -1) {
    base = cleanUrl.substring(0, hashIdx);
    hash = cleanUrl.substring(hashIdx + 1);
  }

  // Parse existing hash params
  const hashParts = hash ? hash.split("&") : [];
  const hashParams: Record<string, string> = {};
  for (const part of hashParts) {
    const [k, v] = part.split("=");
    if (k) hashParams[k] = v || "";
  }

  if (params.importAll !== undefined) {
    hashParams["importAll"] = String(params.importAll);
  }

  if (params.customMappings !== undefined) {
    if (Object.keys(params.customMappings).length > 0) {
      const colmapStr = Object.entries(params.customMappings)
        .map(([field, idx]) => `${field}:${idx}`)
        .join(",");
      hashParams["colmap"] = colmapStr;
    } else {
      delete hashParams["colmap"];
    }
  }

  const newHash = Object.entries(hashParams)
    .map(([k, v]) => (v ? `${k}=${v}` : k))
    .join("&");

  return newHash ? `${base}#${newHash}` : base;
}

export class SheetUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetUrlError";
  }
}
