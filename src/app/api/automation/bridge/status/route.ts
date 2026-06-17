import { NextRequest, NextResponse } from "next/server";
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
    if (body.action === "start_run") {
      const run = await createBridgeRun(mailbox.id, body.status || "RUNNING");
      await recordBridgeStatus(mailbox.id, {
        authStatus: body.authStatus,
        bridgeStatus: "CONNECTED",
        lastError: body.lastError || null,
      });
      return NextResponse.json({ success: true, run });
    }

    const result = await recordBridgeStatus(mailbox.id, {
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
