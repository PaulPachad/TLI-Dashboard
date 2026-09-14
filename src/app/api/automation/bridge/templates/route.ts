import { NextRequest, NextResponse } from "next/server";
import { getMailboxForBridgeToken, syncBridgeTemplates, toJsonList } from "@/lib/automation/service";

export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Bridge token required." }, { status: 401 });
    }
    const mailbox = await getMailboxForBridgeToken(token);
    if (!mailbox) {
      return NextResponse.json({ error: "Invalid bridge token." }, { status: 401 });
    }

    const templates = mailbox.profile.templates.map((template) => ({
      key: template.templateKey,
      name: template.name,
      subject: template.subject,
      body: template.body,
      allowedVariables: toJsonList(template.allowedVariablesJson),
      enabled: template.isEnabled,
      version: template.version,
    }));

    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error("Bridge templates GET failed.", error);
    return NextResponse.json({ error: "Failed to fetch templates." }, { status: 500 });
  }
}

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
    const templates = Array.isArray(body.templates) ? body.templates : Array.isArray(body) ? body : [];
    if (templates.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No templates provided." });
    }

    const result = await syncBridgeTemplates(mailbox.profileId, templates);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Bridge templates POST failed.", error);
    return NextResponse.json({ error: "Failed to sync templates." }, { status: 500 });
  }
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
