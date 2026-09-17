import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMailboxForBridgeToken, recordBridgeDraftLog } from "@/lib/automation/service";

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Bridge token required." }, { status: 401 });
    }
    const mailbox = await getMailboxForBridgeToken(token);
    if (!mailbox) {
      return NextResponse.json({ error: "Invalid bridge token." }, { status: 401 });
    }

    const body = await request.json();
    const entries = Array.isArray(body.entries) ? body.entries : [body];
    const requestedWorkflow = body.workflowType || entries[0]?.workflowType;
    let targetMailboxId = mailbox.id;
    if (requestedWorkflow && mailbox.profileId) {
      const matchingMailbox = await db.automationMailbox.findFirst({
        where: { profileId: mailbox.profileId, workflowType: requestedWorkflow },
        select: { id: true },
      });
      if (matchingMailbox) {
        targetMailboxId = matchingMailbox.id;
      }
    }

    const logs = [];
    for (const entry of entries) {
      logs.push(await recordBridgeDraftLog(targetMailboxId, entry));
    }

    return NextResponse.json({ success: true, count: logs.length, logs });
  } catch (error) {
    console.error("Bridge run log failed.", error);
    return NextResponse.json({ error: "Failed to record bridge run log." }, { status: 500 });
  }
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
