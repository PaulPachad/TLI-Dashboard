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

    let totalTopics = 0;
    let totalEvents = 0;

    for (const cid of clientIdsToSync) {
      const client = await db.client.findUnique({ where: { id: cid } });
      if (!client?.topicsSheetUrl) continue;

      const parsedUrl = parseGoogleSheetUrl(client.topicsSheetUrl);
      
      // SYNC TOPICS (gid 0 by default for the first sheet, or we search for "Topics")
      try {
        const topicsTitle = await resolveTabTitle(parsedUrl.spreadsheetId, "0");
        const topicsData = await readSheetData(parsedUrl.spreadsheetId, topicsTitle, "0");
        
        if (topicsData.length > 1) {
          const headers = topicsData[0].map(String);
          const titleIdx = findColIndex(headers, ["topic", "title", "name"]);
          const sourceReqIdx = findColIndex(headers, ["source request"]);
          const responseIdx = findColIndex(headers, ["response"]);
          const questionsIdx = findColIndex(headers, ["interview question"]);
          
          if (titleIdx !== -1) {
            // Clear old topics
            await db.topic.deleteMany({ where: { clientId: cid } });
            
            for (let i = 1; i < topicsData.length; i++) {
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
              totalTopics++;
            }
          }
        }
      } catch (err) {
        console.error(`Error syncing topics for client ${cid}:`, err);
      }

      // SYNC EVENTS (we assume gid=450141736 from user data, or search for Events tab)
      try {
        // Fallback: If we don't know the GID or want to search by name:
        const eventsTitle = await resolveTabTitle(parsedUrl.spreadsheetId, "450141736");
        const eventsData = await readSheetData(parsedUrl.spreadsheetId, eventsTitle, "450141736");

        if (eventsData.length > 1) {
          const headers = eventsData[0].map(String);
          const nameIdx = findColIndex(headers, ["event", "name", "title"]);
          const dateIdx = findColIndex(headers, ["date", "time"]);
          const locationIdx = findColIndex(headers, ["location", "place"]);
          const statusIdx = findColIndex(headers, ["status", "attendance"]);

          if (nameIdx !== -1) {
             // Clear old events
             await db.event.deleteMany({ where: { clientId: cid } });

             for (let i = 1; i < eventsData.length; i++) {
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
               totalEvents++;
             }
          }
        }
      } catch (err) {
         console.error(`Error syncing events for client ${cid}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${totalTopics} topics and ${totalEvents} events.`,
      details: { totalTopics, totalEvents }
    });

  } catch (error: any) {
    console.error("Sync topics error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during topic sync." },
      { status: 500 }
    );
  }
}
