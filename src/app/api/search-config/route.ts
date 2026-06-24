import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth-helpers";
import {
  getSearchDiagnostics,
  getGeminiHealthStatus,
  GoogleCustomSearchProvider,
} from "@/lib/prominence/research";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireApiAuth();

    const checkProviders =
      request.nextUrl.searchParams.get("check") === "providers";

    if (checkProviders) {
      // Admin-triggered live health check. Runs a real test query against Google Custom Search
      // and returns static configuration status for Gemini (no live request needed).
      // Results are cached briefly inside each provider to avoid burning quota on repeated checks.
      const geminiStatus = getGeminiHealthStatus();
      const googleCseProvider = new GoogleCustomSearchProvider();
      const googleCseStatus = await googleCseProvider.checkHealth();

      return NextResponse.json({
        ok: true,
        diagnostics: getSearchDiagnostics(),
        providers: [geminiStatus, googleCseStatus],
      });
    }

    return NextResponse.json({
      ok: true,
      diagnostics: getSearchDiagnostics(),
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    return NextResponse.json(
      { error: "Could not check search configuration." },
      { status: 500 }
    );
  }
}
