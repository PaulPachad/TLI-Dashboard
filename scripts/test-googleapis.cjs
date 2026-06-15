const { google } = require("googleapis");
const fs = require("fs");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  const envText = fs.readFileSync(".env", "utf8");
  let client_email = "";
  let private_key = "";
  
  for (const line of envText.split("\n")) {
    if (line.startsWith("GOOGLE_CLIENT_EMAIL=")) {
      client_email = line.split("=")[1].replace(/"/g, "").trim();
    }
    if (line.startsWith("GOOGLE_PRIVATE_KEY=")) {
      private_key = line.split("=")[1].replace(/"/g, "").trim().replace(/\\n/g, "\n");
    }
  }

  const jwt = new google.auth.JWT(
    client_email,
    undefined,
    private_key,
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );

  const sheets = google.sheets({ version: "v4", auth: jwt });

  const spreadsheetId = "1miLrYezf22XzCdDC5Q45JxBnSuYGeEdcG0UOf81zqXg";
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: ["'Topics'!A1:F5"],
    includeGridData: true,
  });

  const rowData = res.data.sheets?.[0]?.data?.[0]?.rowData;
  if (rowData) {
    for (let r = 0; r < rowData.length; r++) {
      const row = rowData[r];
      if (row.values) {
        for (let c = 0; c < row.values.length; c++) {
          const cell = row.values[c];
          console.log(`[Row ${r} Col ${c}] Formatted:`, cell.formattedValue);
          console.log(`[Row ${r} Col ${c}] Hyperlink:`, cell.hyperlink);
          if (cell.textFormatRuns) {
             console.log(`[Row ${r} Col ${c}] textFormatRuns:`, JSON.stringify(cell.textFormatRuns));
          }
        }
      }
    }
  }
}

main().catch(console.error);
