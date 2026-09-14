import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth-helpers";
import { safeApiErrorResponse } from "@/lib/api/safe-error";
import { getOperationsSnapshot } from "@/lib/operations/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiAdmin();
    const snapshot = await getOperationsSnapshot();
    return NextResponse.json({
      generatedAt: snapshot.generatedAt,
      runs: snapshot.recentRuns,
      partialDataMessage: snapshot.partialDataMessage,
    });
  } catch (error: unknown) {
    return safeApiErrorResponse(error, {
      fallbackMessage: "Operations runs are unavailable right now.",
      logPrefix: "Operations runs failed:",
    });
  }
}
