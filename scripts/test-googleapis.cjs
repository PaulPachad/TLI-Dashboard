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
  
  await jwt.authorize(); // <-- Need this!

  const sheets = google.sheets({ version: "v4", auth: jwt });

  const spreadsheetId = "1miLrYezf22XzCdDC5Q45JxBnSuYGeEdcG0UOf81zqXg";
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: ["'Topics'!D1:D10"], // Just the questions column
    includeGridData: true,
  });

  const rowData = res.data.sheets?.[0]?.data?.[0]?.rowData;
  if (rowData) {
    for (let r = 0; r < rowData.length; r++) {
      const row = rowData[r];
      if (row.values) {
        for (let c = 0; c < row.values.length; c++) {
          const cell = row.values[c];
          console.log(`\n--- Row ${r} ---`);
          console.log("formattedValue:", cell.formattedValue);
          console.log("userEnteredValue:", cell.userEnteredValue);
          console.log("hyperlink:", cell.hyperlink);
          console.log("textFormatRuns:", JSON.stringify(cell.textFormatRuns, null, 2));
        }
      }
    }
  }
}

main().catch(console.error);
