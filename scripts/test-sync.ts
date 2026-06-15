import { parseGoogleSheetUrl } from "../src/lib/google-sheets/parse-url";
import { readSheetData, resolveTabTitle, getSheetTabs } from "../src/lib/google-sheets/client";

function findColIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.findIndex((h) => 
      String(h).toLowerCase().replace(/[^a-z0-9]/g, "").includes(alias.replace(/[^a-z0-9]/g, ""))
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

async function main() {
  const url = "https://docs.google.com/spreadsheets/d/1miLrYezf22XzCdDC5Q45JxBnSuYGeEdcG0UOf81zqXg/edit?gid=0#gid=0";
  const parsedUrl = parseGoogleSheetUrl(url);
  console.log("Parsed URL:", parsedUrl);

  const topicsTitle = await resolveTabTitle(parsedUrl.spreadsheetId, parsedUrl.gid || "0");
  console.log("Topics Title:", topicsTitle);

  const topicsData = await readSheetData(parsedUrl.spreadsheetId, topicsTitle, parsedUrl.gid || "0");
  console.log("Topics Data length:", topicsData.length);

  if (topicsData.length > 1) {
    const headers = topicsData[0].map(String);
    console.log("Topics Headers:", headers);
    let titleIdx = findColIndex(headers, ["topic", "title", "name"]);
    console.log("titleIdx:", titleIdx);
    if (titleIdx !== -1) {
        console.log("First row title:", topicsData[1][titleIdx]);
    }
  }

  const tabs = await getSheetTabs(parsedUrl.spreadsheetId);
  let eventsGid = "450141736"; // Fallback
  const eventsTab = tabs.find((t: any) => t.title.toLowerCase().includes("event"));
  if (eventsTab) {
    eventsGid = eventsTab.sheetId.toString();
  } else if (tabs.length > 1) {
    eventsGid = tabs[1].sheetId.toString();
  }
  console.log("Events GID:", eventsGid);

  const eventsTitle = await resolveTabTitle(parsedUrl.spreadsheetId, eventsGid);
  console.log("Events Title:", eventsTitle);

  const eventsData = await readSheetData(parsedUrl.spreadsheetId, eventsTitle, eventsGid);
  console.log("Events Data length:", eventsData.length);
  if (eventsData.length > 1) {
      const headers = eventsData[0].map(String);
      console.log("Events Headers:", headers);
      console.log("First event row:", eventsData[1]);
  }
}

main().catch(console.error);
