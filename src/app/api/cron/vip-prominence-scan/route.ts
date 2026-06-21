import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildBackgroundProminenceWhere,
  getVipProminenceCronLimit,
  isCronRequestAuthorized,
} from "@/lib/prominence/background-scan";
import {
  GOOGLE_SEARCH_NOT_CONFIGURED_CODE,
  GoogleSearchConfigError,
  getSearchDiagnostics,
} from "@/lib/prominence/research";
import { saveProminenceResearch } from "@/lib/prominence/service";

export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const limit = getVipProminenceCronLimit();
    const candidates = await db.interview.findMany({
      where: buildBackgroundProminenceWhere(),
      orderBy: [
        { estimatedPublishDate: "asc" },
        { createdAt: "desc" },
      ],
      take: limit,
    });

    let updated = 0;
    let failed = 0;
    for (const interview of candidates) {
      try {
        await saveProminenceResearch(interview, null, { trigger: "CRON" });
        updated += 1;
      } catch (error) {
        if (error instanceof GoogleSearchConfigError) throw error;
        failed += 1;
        console.warn("Cron standout scan failed:", interview.id, error);
      }
    }

    return NextResponse.json({
      success: true,
      trigger: "CRON",
      scanned: candidates.length,
      updated,
      failed,
      limit,
    });
  } catch (error: unknown) {
    if (error instanceof GoogleSearchConfigError) {
      return NextResponse.json(
        {
          code: GOOGLE_SEARCH_NOT_CONFIGURED_CODE,
          error:
            "Background standout research cannot see a search key in this deployment yet.",
          diagnostics: getSearchDiagnostics(),
        },
        { status: 503 }
      );
    }

    console.error("Cron standout scan failed:", error);
    return NextResponse.json(
      { error: "Could not run background standout research." },
      { status: 500 }
    );
  }
}
