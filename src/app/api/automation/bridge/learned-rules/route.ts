import { NextRequest, NextResponse } from "next/server";
import { getMailboxForBridgeToken, syncBridgeLearnedRules } from "@/lib/automation/service";

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
    const rules = Array.isArray(body.rules) ? body.rules : Array.isArray(body) ? body : [];
    if (rules.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No rules provided." });
    }

    const result = await syncBridgeLearnedRules(mailbox.profileId, rules);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Bridge learned rules sync failed.", error);
    return NextResponse.json({ error: "Failed to sync learned rules." }, { status: 500 });
  }
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
