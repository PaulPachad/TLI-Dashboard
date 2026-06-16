// ==============================================================================
// Google Sheets API Client — Service Account Authentication
// ==============================================================================

import { google, sheets_v4 } from "googleapis";

let sheetsClient: sheets_v4.Sheets | null = null;

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export class SheetsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetsConfigError";
  }
}

function hasSheetsCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

/**
 * Get an authenticated Google Sheets API client using service account credentials.
 * Credentials come from environment variables — never hardcoded.
 */
export function getSheetsClient(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new SheetsConfigError(
      "Google Sheets is not configured. Add the service account email and " +
        "private key to the environment, then share the sheet with that email."
    );
  }

  // The private key comes from env with literal \n — replace with actual newlines
  const formattedKey = privateKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email,
    key: formattedKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

export interface SheetTab {
  sheetId: number;
  title: string;
  index: number;
}

/**
 * Get all tab names from a spreadsheet.
 */
export async function getSheetTabs(spreadsheetId: string): Promise<SheetTab[]> {
  const client = getSheetsClient();

  try {
    const response = await client.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties",
    });

    const sheets = response.data.sheets || [];
    return sheets.map((s) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title ?? "Unknown",
      index: s.properties?.index ?? 0,
    }));
  } catch (error: unknown) {
    handleSheetsApiError(error, spreadsheetId);
    throw error; // TypeScript flow — handleSheetsApiError always throws
  }
}

/**
 * Read all data from a specific tab (by title).
 * Returns a 2D array of strings: rows × columns.
 */
export async function readSheetData(
  spreadsheetId: string,
  sheetTitle: string,
  gid: string | null = null
): Promise<string[][]> {
  if (!hasSheetsCredentials()) {
    return readPublicSheetData(spreadsheetId, gid);
  }

  const client = getSheetsClient();

  try {
    const response = await client.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetTitle}'`,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });

    return (response.data.values as string[][]) || [];
  } catch (error: unknown) {
    handleSheetsApiError(error, spreadsheetId);
    throw error;
  }
}

export type CellDataWithLink = { text: string; url: string | null };

interface GoogleSheetsCellWithChips extends sheets_v4.Schema$CellData {
  chipRuns?: Array<{
    chip?: {
      richLinkProperties?: {
        uri?: string;
        title?: string;
      };
    };
  }>;
}

/**
 * Read all data from a specific tab, extracting hyperlinks if present.
 * Uses spreadsheets.get with includeGridData instead of values.get.
 */
export async function readSheetDataWithLinks(
  spreadsheetId: string,
  sheetTitle: string,
  gid: string | null = null
): Promise<CellDataWithLink[][]> {
  if (!hasSheetsCredentials()) {
    const raw = await readPublicSheetData(spreadsheetId, gid);
    return raw.map(row => row.map(text => ({ text, url: null })));
  }

  const client = getSheetsClient();

  try {
    const response = await client.spreadsheets.get({
      spreadsheetId,
      ranges: [`'${sheetTitle}'`],
      fields: "sheets(data(rowData(values(formattedValue,userEnteredValue,hyperlink,textFormatRuns,chipRuns))))",
    });

    const rowData = response.data.sheets?.[0]?.data?.[0]?.rowData || [];
    
    return rowData.map(row => {
      return (row.values || []).map(cell => {
        let text = cell.formattedValue || cell.userEnteredValue?.stringValue || "";
        let url = cell.hyperlink || null;

        // Extract from textFormatRuns
        if (!url && cell.textFormatRuns && cell.textFormatRuns.length > 0) {
          const runWithLink = cell.textFormatRuns.find(run => run.format?.link?.uri);
          if (runWithLink?.format?.link?.uri) {
            url = runWithLink.format.link.uri;
          }
        }

        // Extract from Google Sheets API chipRuns (Smart Chips)
        const cellWithChips = cell as GoogleSheetsCellWithChips;
        if (cellWithChips.chipRuns && cellWithChips.chipRuns.length > 0) {
          const firstChip = cellWithChips.chipRuns[0]?.chip;
          if (firstChip?.richLinkProperties?.uri) {
            url = firstChip.richLinkProperties.uri;
            // The formattedValue might just be '@' for a smart chip.
            // If the chip has a title, we should use it. Otherwise, use the url.
            if (text === "@" || text.trim() === "") {
               text = firstChip.richLinkProperties.title || "Linked Document";
            }
          }
        }

        return { text, url };
      });
    });
  } catch (error: unknown) {
    handleSheetsApiError(error, spreadsheetId);
    throw error;
  }
}

/**
 * Find the tab title that matches a given gid.
 * If gid is null, returns the first tab.
 */
export async function resolveTabTitle(
  spreadsheetId: string,
  gid: string | null
): Promise<string> {
  if (!hasSheetsCredentials()) {
    return gid ? `Google Sheet tab ${gid}` : "First Google Sheet tab";
  }

  const tabs = await getSheetTabs(spreadsheetId);

  if (tabs.length === 0) {
    throw new Error("This spreadsheet has no tabs. It may be empty or corrupted.");
  }

  if (gid === null) {
    return tabs[0].title;
  }

  const gidNum = parseInt(gid, 10);
  const matched = tabs.find((t) => t.sheetId === gidNum);

  if (!matched) {
    throw new Error(
      `Could not find tab with gid=${gid} in this spreadsheet. ` +
        `Available tabs: ${tabs.map((t) => `"${t.title}" (gid=${t.sheetId})`).join(", ")}. ` +
        `Please check your URL.`
    );
  }

  return matched.title;
}

interface VisualizationResponse {
  status?: string;
  errors?: Array<{ detailed_message?: string; message?: string }>;
  table?: {
    cols?: Array<{ label?: string }>;
    rows?: Array<{
      c?: Array<{ v?: unknown; f?: string } | null>;
    }>;
  };
}

async function readPublicSheetData(
  spreadsheetId: string,
  gid: string | null
): Promise<string[][]> {
  const url = new URL(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq`
  );
  url.searchParams.set("tqx", "out:json");
  url.searchParams.set("headers", "1");
  if (gid) url.searchParams.set("gid", gid);

  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow" });
  } catch (error) {
    throw new Error(
      `Could not connect to Google Sheets: ${
        error instanceof Error ? error.message : "network error"
      }.`
    );
  }

  if (!response.ok) {
    throwPublicSheetAccessError();
  }

  const text = await response.text();
  if (!text.includes("google.visualization.Query.setResponse(")) {
    throwPublicSheetAccessError();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Google Sheets returned an unreadable response.");
  }

  let payload: VisualizationResponse;
  try {
    payload = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Google Sheets returned an unreadable response.");
  }

  if (payload.status !== "ok" || !payload.table) {
    const detail =
      payload.errors?.[0]?.detailed_message ||
      payload.errors?.[0]?.message;
    throw new Error(detail || "Google Sheets could not read this tab.");
  }

  const headers = (payload.table.cols || []).map((column) => column.label || "");
  const rows = (payload.table.rows || []).map((row) =>
    headers.map((_, index) => {
      const cell = row.c?.[index];
      if (!cell) return "";
      if (cell.f !== undefined) return cell.f;
      if (cell.v === null || cell.v === undefined) return "";
      return String(cell.v);
    })
  );

  return [headers, ...rows];
}

function throwPublicSheetAccessError(): never {
  throw new Error(
    "We could not read this Google Sheet by link. In Google Sheets, open Share, " +
      'set General access to "Anyone with the link" as Viewer, then try again. ' +
      "For private sheets, configure the Google service account."
  );
}

/**
 * Convert Google API errors to human-readable messages.
 */
function handleSheetsApiError(error: unknown, spreadsheetId: string): never {
  const err = error as { code?: number; message?: string; errors?: Array<{ reason?: string }> };
  const code = err.code;
  const reason = err.errors?.[0]?.reason;

  if (code === 403 || reason === "forbidden") {
    throw new Error(
      "We could not access this sheet. " +
        "Please share it with the service account email: " +
        `${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}. ` +
        "Grant 'Viewer' access."
    );
  }

  if (code === 404) {
    throw new Error(
      "This spreadsheet was not found. " +
        "Please check that the URL is correct and the spreadsheet still exists. " +
        `Spreadsheet ID: ${spreadsheetId}`
    );
  }

  if (code === 401) {
    throw new Error(
      "Google Sheets API authentication failed. " +
        "Please verify the service account credentials in your environment variables."
    );
  }

  if (code === 429) {
    throw new Error(
      "Google Sheets API rate limit reached. Please wait a moment and try again."
    );
  }

  // Generic fallback
  throw new Error(
    `Google Sheets API error: ${err.message || "Unknown error"}. ` +
      "Please try again or check the sheet URL."
  );
}
