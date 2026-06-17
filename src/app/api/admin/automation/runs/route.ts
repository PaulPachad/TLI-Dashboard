import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth-helpers";
import { getAutomationOverview } from "@/lib/automation/service";

export async function GET() {
  try {
    await requireApiAdmin();
    const overview = await getAutomationOverview();
    return NextResponse.json({
      runs: overview.recentRuns,
      draftLogs: overview.draftLogs,
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to load automation runs.", error);
    return NextResponse.json(
      { error: err.message || "Failed to load automation runs." },
      { status: 500 }
    );
  }
}
