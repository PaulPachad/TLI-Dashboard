import { NextRequest, NextResponse } from "next/server";
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
    const logs = [];
    for (const entry of entries) {
      logs.push(await recordBridgeDraftLog(mailbox.id, entry));
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
