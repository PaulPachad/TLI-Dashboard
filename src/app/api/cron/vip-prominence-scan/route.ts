import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { finishJob, tryStartJob } from "@/lib/jobs/idempotency";
import {
  buildBackgroundProminenceWhere,
  buildLegacyBackgroundProminenceWhere,
  getVipProminenceCronLimit,
  isMissingProminenceSignalsColumnError,
  isCronRequestAuthorized,
} from "@/lib/prominence/background-scan";
import {
  GOOGLE_SEARCH_NOT_CONFIGURED_CODE,
  GoogleSearchConfigError,
  getSearchDiagnostics,
} from "@/lib/prominence/research";
import { saveProminenceResearch } from "@/lib/prominence/service";

const researchableInterviewSelect = {
  id: true,
  clientId: true,
  intervieweeName: true,
  intervieweeCompany: true,
  intervieweeTitle: true,
  topic: true,
  articleUrl: true,
  buzzfeedUrl: true,
  interviewDocUrl: true,
  linkedinUrl: true,
  twitterUrl: true,
} as const;

export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const jobKey = "standout-cron-scan";
  const jobStarted = tryStartJob(jobKey);
  if (!jobStarted) {
    return NextResponse.json(
      {
        error: "Background standout research is already running.",
        jobStatus: "running",
      },
      { status: 409 }
    );
  }

  try {
    const limit = getVipProminenceCronLimit();
    const candidates = await findCronProminenceCandidates(limit);

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
      jobStatus: failed > 0 ? "failed" : "succeeded",
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
  } finally {
    if (jobStarted) finishJob(jobKey);
  }
}

async function findCronProminenceCandidates(limit: number) {
  try {
    return await db.interview.findMany({
      where: buildBackgroundProminenceWhere(),
      orderBy: [{ estimatedPublishDate: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: researchableInterviewSelect,
    });
  } catch (error) {
    if (!isMissingProminenceSignalsColumnError(error)) throw error;
    return db.interview.findMany({
      where: buildLegacyBackgroundProminenceWhere(),
      orderBy: [{ estimatedPublishDate: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: researchableInterviewSelect,
    });
  }
}
