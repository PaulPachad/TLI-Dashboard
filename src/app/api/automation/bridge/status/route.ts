import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createBridgeRun,
  getMailboxForBridgeToken,
  recordBridgeStatus,
} from "@/lib/automation/service";

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
    let targetMailbox = mailbox;
    if (body.workflowType && mailbox.profileId) {
      const matchingMailbox = await db.automationMailbox.findFirst({
        where: { profileId: mailbox.profileId, workflowType: body.workflowType },
      });
      if (matchingMailbox) {
        targetMailbox = matchingMailbox;
      }
    }

    if (body.action === "start_run") {
      const run = await createBridgeRun(
        targetMailbox.id,
        body.status || "RUNNING",
        body.summary || null,
        body.metadata || {}
      );
      await recordBridgeStatus(targetMailbox.id, {
        authStatus: body.authStatus,
        bridgeStatus: "CONNECTED",
        lastError: body.lastError || null,
      });
      return NextResponse.json({ success: true, run });
    }

    const result = await recordBridgeStatus(targetMailbox.id, {
      authStatus: body.authStatus,
      bridgeStatus: body.bridgeStatus,
      lastError: body.lastError || null,
      run: body.run,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Bridge status failed.", error);
    return NextResponse.json({ error: "Failed to record bridge status." }, { status: 500 });
  }
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
