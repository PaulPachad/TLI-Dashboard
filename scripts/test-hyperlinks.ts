import { getSheetsClient } from "../src/lib/google-sheets/client";
import { parseGoogleSheetUrl } from "../src/lib/google-sheets/parse-url";

async function main() {
  const url = "https://docs.google.com/spreadsheets/d/1miLrYezf22XzCdDC5Q45JxBnSuYGeEdcG0UOf81zqXg/edit?gid=0#gid=0";
  const parsed = parseGoogleSheetUrl(url);
  const client = getSheetsClient();
  
  // Try values.get
  console.log("=== values.get ===");
  const valRes = await client.spreadsheets.values.get({
    spreadsheetId: parsed.spreadsheetId,
    range: "'Topics'!A1:F5",
    valueRenderOption: "UNFORMATTED_VALUE"
  });
  console.log(JSON.stringify(valRes.data.values, null, 2));

  // Try spreadsheets.get with includeGridData
  console.log("=== spreadsheets.get ===");
  const gridRes = await client.spreadsheets.get({
    spreadsheetId: parsed.spreadsheetId,
    ranges: ["'Topics'!A1:F5"],
    includeGridData: true,
  });
  
  const rowData = gridRes.data.sheets?.[0]?.data?.[0]?.rowData;
  if (rowData) {
    for (let r = 0; r < rowData.length; r++) {
      const row = rowData[r];
      if (row.values) {
        for (let c = 0; c < row.values.length; c++) {
          const cell = row.values[c];
          if (cell.hyperlink) {
            console.log(`Row ${r} Col ${c} hyperlink:`, cell.hyperlink);
          }
        }
      }
    }
  }
}

main().catch(console.error);
