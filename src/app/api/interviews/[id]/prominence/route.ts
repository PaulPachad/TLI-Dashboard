import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { safeApiErrorResponse } from "@/lib/api/safe-error";
import { canAccessClientResource } from "@/lib/security/tenant-access";
import { finishJob, tryStartJob } from "@/lib/jobs/idempotency";
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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let jobKey: string | null = null;
  let jobStarted = false;
  try {
    const user = await requireApiAuth();
    const { id } = await params;

    const interview = await db.interview.findUnique({
      where: { id },
      select: researchableInterviewSelect,
    });

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found." },
        { status: 404 }
      );
    }

    if (!canAccessClientResource(user, interview.clientId)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    jobKey = `standout-research:${interview.id}`;
    jobStarted = tryStartJob(jobKey);
    if (!jobStarted) {
      return NextResponse.json(
        {
          error: "Standout research is already running for this interview.",
          jobStatus: "running",
        },
        { status: 409 }
      );
    }

    const { result, updated } = await saveProminenceResearch(
      interview,
      user.id,
      { trigger: "MANUAL" }
    );

    return NextResponse.json({
      success: true,
      jobStatus: "succeeded",
      interview: updated,
      prominence: result.assessment,
      sourceCount: result.sourceResults.length,
      note:
        result.assessment.tier === "standard"
          ? "Research complete. No strong standout found yet."
          : `Research complete: ${result.assessment.tierLabel} (${result.assessment.score}/100).`,
    });
  } catch (error: unknown) {
    if (error instanceof GoogleSearchConfigError) {
      const diagnostics = getSearchDiagnostics();
      return NextResponse.json(
        {
          code: GOOGLE_SEARCH_NOT_CONFIGURED_CODE,
          error:
            "Standout research cannot see GEMINI_API_KEY in this project environment yet. Add it under Project Settings > Environment Variables, not AI Gateway > Bring Your Own Key, then redeploy.",
          diagnostics,
        },
        { status: 503 }
      );
    }

    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    return safeApiErrorResponse(error, {
      fallbackMessage:
        "Could not research standout signals. Check the search configuration and try again.",
      logPrefix: "Prominence research failed:",
    });
  } finally {
    if (jobKey && jobStarted) finishJob(jobKey);
  }
}
