import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth-helpers";
import {
  getAutomationOverview,
  rotateMailboxBridgeToken,
  updateAutomationSettings,
} from "@/lib/automation/service";

export async function GET() {
  try {
    await requireApiAdmin();
    const overview = await getAutomationOverview();
    return NextResponse.json(overview);
  } catch (error: unknown) {
    return handleApiError(error, "Failed to load automation settings.");
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireApiAdmin();
    const body = await request.json();
    await updateAutomationSettings(body);
    const overview = await getAutomationOverview();
    return NextResponse.json({ success: true, ...overview });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to update automation settings.");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireApiAdmin();
    const body = await request.json();
    if (body.action !== "rotate_bridge_token" || !body.mailboxId) {
      return NextResponse.json(
        { error: "Unknown automation settings action." },
        { status: 400 }
      );
    }
    const result = await rotateMailboxBridgeToken(String(body.mailboxId));
    const overview = await getAutomationOverview();
    return NextResponse.json({ success: true, bridgeToken: result.token, ...overview });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to rotate bridge token.");
  }
}

function handleApiError(error: unknown, fallback: string) {
  const err = error as { status?: number; message?: string };
  if (err.status) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(fallback, error);
  return NextResponse.json(
    { error: err.message || fallback },
    { status: 500 }
  );
}
