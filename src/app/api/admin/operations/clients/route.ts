import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth-helpers";
import { safeApiErrorResponse } from "@/lib/api/safe-error";
import { getOperationsClients } from "@/lib/operations/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiAdmin();
    const clients = await getOperationsClients();
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      clients,
    });
  } catch (error: unknown) {
    return safeApiErrorResponse(error, {
      fallbackMessage: "Operations clients are unavailable right now.",
      logPrefix: "Operations clients failed:",
    });
  }
}
