import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { UserRole } from "@/types/db";
import {
  parseGoogleSheetUrl,
  readSheetData,
  resolveTabTitle,
} from "@/lib/google-sheets";

// Helper for finding index of a fuzzy column name
function findColIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.findIndex((h) => 
      String(h).toLowerCase().replace(/[^a-z0-9]/g, "").includes(alias.replace(/[^a-z0-9]/g, ""))
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiAuth();
    
    const searchParams = request.nextUrl.searchParams;
    const reqClientId = searchParams.get("clientId");
    
    // Determine clients to sync
    const clientIdsToSync: string[] = [];
    if (user.role === UserRole.ADMIN && reqClientId) {
      clientIdsToSync.push(reqClientId);
    } else if (user.role === UserRole.ADMIN && !reqClientId) {
      const clients = await db.client.findMany({ where: { topicsSheetUrl: { not: null } } });
      clientIdsToSync.push(...clients.map(c => c.id));
    } else if (user.clientId) {
      clientIdsToSync.push(user.clientId);
    } else {
      return NextResponse.json({ error: "No client associated" }, { status: 400 });
    }

    if (clientIdsToSync.length === 0) {
      return NextResponse.json({ message: "No clients with topicsSheetUrl found." });
    }

    const errors: string[] = [];
    let topicsSynced = 0;
    let eventsSynced = 0;

    for (const cid of clientIdsToSync) {
      const client = await db.client.findUnique({ where: { id: cid } });
      if (!client?.topicsSheetUrl) {
        errors.push(`Client ${cid} has no topics sheet URL configured.`);
        continue;
      }

      let parsedUrl;
      try {
        parsedUrl = parseGoogleSheetUrl(client.topicsSheetUrl);
      } catch (err) {
        errors.push(`Invalid Topics URL format for client ${cid}.`);
        continue;
      }
      
      // SYNC TOPICS
      try {
        const topicsTitle = await resolveTabTitle(parsedUrl.spreadsheetId, parsedUrl.gid || "0");
        const topicsData = await readSheetData(parsedUrl.spreadsheetId, topicsTitle, parsedUrl.gid || "0");
        
        if (topicsData.length > 1) {
          const headers = topicsData[0].map(String);
          let titleIdx = findColIndex(headers, ["topic", "title", "name"]);
          let sourceReqIdx = findColIndex(headers, ["source request"]);
          let responseIdx = findColIndex(headers, ["response"]);
          let questionsIdx = findColIndex(headers, ["interview question", "suggested question"]);
          
          let startIndex = 1;
          
          if (titleIdx === -1) {
            titleIdx = 0;
            sourceReqIdx = 1;
            responseIdx = 2;
            questionsIdx = 3;
            startIndex = 0;
          }

          await db.topic.deleteMany({ where: { clientId: cid } });
          
          for (let i = startIndex; i < topicsData.length; i++) {
            const row = topicsData[i];
            const title = row[titleIdx] ? String(row[titleIdx]).trim() : "";
            if (!title) continue;
            
            await db.topic.create({
              data: {
                clientId: cid,
                title,
                sourceRequests: sourceReqIdx !== -1 && row[sourceReqIdx] ? String(row[sourceReqIdx]) : null,
                responses: responseIdx !== -1 && row[responseIdx] ? String(row[responseIdx]) : null,
                interviewQuestions: questionsIdx !== -1 && row[questionsIdx] ? String(row[questionsIdx]) : null,
              }
            });
            topicsSynced++;
          }
        }
      } catch (err) {
        console.error(`Error syncing topics for client ${cid}:`, err);
        errors.push(`Topics error: ${err instanceof Error ? err.message : String(err)}`);
      }

      // SYNC EVENTS
      try {
        const { getSheetTabs } = await import("@/lib/google-sheets");
        let tabs: any[] = [];
        try {
          tabs = await getSheetTabs(parsedUrl.spreadsheetId);
        } catch (e) {
          // If public endpoint without service account, tabs might be empty
          console.warn("Could not fetch tabs", e);
        }
        
        let eventsGid = "450141736"; // Fallback
        if (tabs.length > 0) {
          const eventsTab = tabs.find(t => t.title.toLowerCase().includes("event"));
          if (eventsTab) {
            eventsGid = eventsTab.sheetId.toString();
          } else if (tabs.length > 1) {
            eventsGid = tabs[1].sheetId.toString();
          }
        }

        const eventsTitle = await resolveTabTitle(parsedUrl.spreadsheetId, eventsGid);
        const eventsData = await readSheetData(parsedUrl.spreadsheetId, eventsTitle, eventsGid);

        if (eventsData.length > 1) {
          const headers = eventsData[0].map(String);
          let nameIdx = findColIndex(headers, ["event", "name", "title"]);
          let dateIdx = findColIndex(headers, ["date", "time"]);
          let locationIdx = findColIndex(headers, ["location", "place", "city"]);
          let statusIdx = findColIndex(headers, ["status", "attendance", "description"]);

          let startIndex = 1;

          if (nameIdx === -1) {
            nameIdx = 0;
            dateIdx = 1;
            locationIdx = 2;
            statusIdx = 3;
            startIndex = 0;
          }

          await db.event.deleteMany({ where: { clientId: cid } });

          for (let i = startIndex; i < eventsData.length; i++) {
            const row = eventsData[i];
            const eventName = row[nameIdx] ? String(row[nameIdx]).trim() : "";
            if (!eventName) continue;

            await db.event.create({
              data: {
                clientId: cid,
                eventName,
                date: dateIdx !== -1 && row[dateIdx] ? String(row[dateIdx]) : null,
                location: locationIdx !== -1 && row[locationIdx] ? String(row[locationIdx]) : null,
                status: statusIdx !== -1 && row[statusIdx] ? String(row[statusIdx]) : null,
              }
            });
            eventsSynced++;
          }
        }
      } catch (err) {
         console.error(`Error syncing events for client ${cid}:`, err);
         errors.push(`Events error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (errors.length > 0 && topicsSynced === 0 && eventsSynced === 0) {
      return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Topics synced: ${topicsSynced}. Events synced: ${eventsSynced}.`,
      errors: errors.length > 0 ? errors : undefined,
      details: { topicsSynced, eventsSynced }
    });

  } catch (error: any) {
    console.error("Sync topics error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during topic sync." },
      { status: 500 }
    );
  }
}
