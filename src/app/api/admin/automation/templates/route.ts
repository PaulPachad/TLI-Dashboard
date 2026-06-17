import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth-helpers";
import { getAutomationOverview, updateAutomationTemplates } from "@/lib/automation/service";

export async function GET() {
  try {
    await requireApiAdmin();
    const overview = await getAutomationOverview();
    return NextResponse.json({ templates: overview.profile.templates });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to load automation templates.");
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireApiAdmin();
    const body = await request.json();
    await updateAutomationTemplates(Array.isArray(body.templates) ? body.templates : []);
    const overview = await getAutomationOverview();
    return NextResponse.json({ success: true, templates: overview.profile.templates });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to update automation templates.");
  }
}

function handleApiError(error: unknown, fallback: string) {
  const err = error as { status?: number; message?: string };
  if (err.status) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: err.message || fallback }, { status: 500 });
}
