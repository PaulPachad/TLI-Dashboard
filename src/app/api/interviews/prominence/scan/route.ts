import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { safeApiErrorResponse } from "@/lib/api/safe-error";
import { resolveRequestedClientId } from "@/lib/security/tenant-access";
import { finishJob, tryStartJob } from "@/lib/jobs/idempotency";
import { UserRole } from "@/types/db";
import {
  getStandoutResearchAllowance,
  StandoutResearchCostLimitError,
} from "@/lib/prominence/cost-control";
import {
  buildBackgroundProminenceWhere,
  buildLegacyBackgroundProminenceWhere,
  isMissingProminenceSignalsColumnError,
} from "@/lib/prominence/background-scan";
import {
  GOOGLE_SEARCH_NOT_CONFIGURED_CODE,
  GoogleSearchConfigError,
  getSearchDiagnostics,
  SearchProviderFallbackError,
} from "@/lib/prominence/research";
import { saveProminenceResearch } from "@/lib/prominence/service";

const DEFAULT_SCAN_LIMIT = 1;
const MAX_SCAN_LIMIT = 2;
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
} satisfies Prisma.InterviewSelect;

export async function POST(request: NextRequest) {
  let jobKey: string | null = null;
  let jobStarted = false;
  try {
    const user = await requireApiAuth();
    const body = (await request.json().catch(() => ({}))) as {
      clientId?: string;
      limit?: number;
      interviewIds?: string[];
    };
    const limit = Math.min(
      Math.max(Number(body.limit) || DEFAULT_SCAN_LIMIT, 1),
      MAX_SCAN_LIMIT
    );

    const targetClientId = resolveRequestedClientId(user, body.clientId);

    if (!targetClientId && user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "No client associated with this account." },
        { status: 400 }
      );
    }

    const requestedInterviewIds = Array.isArray(body.interviewIds)
      ? body.interviewIds
          .filter((id): id is string => typeof id === "string" && id.length > 0)
          .slice(0, limit)
      : [];

    jobKey = `standout-quiet-scan:${targetClientId || "all-clients"}:${requestedInterviewIds.join(",") || "auto"}`;
    jobStarted = tryStartJob(jobKey);
    if (!jobStarted) {
      return NextResponse.json(
        {
          error: "A quiet standout scan is already running for this scope.",
          jobStatus: "running",
        },
        { status: 409 }
      );
    }

    const allowance = await getStandoutResearchAllowance("QUIET_SCAN");
    const boundedLimit = Math.min(limit, allowance.remaining);

    const where: Prisma.InterviewWhereInput = {
      ...buildBackgroundProminenceWhere(),
      ...(targetClientId ? { clientId: targetClientId } : {}),
      ...(requestedInterviewIds.length > 0
        ? { id: { in: requestedInterviewIds } }
        : {}),
    };

    const candidates = await findProminenceCandidates(where, boundedLimit);
    const candidateOrder = new Map(
      requestedInterviewIds.map((id, index) => [id, index])
    );
    candidates.sort(
      (left, right) =>
        (candidateOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (candidateOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );

    let updated = 0;
    let failed = 0;
    let retryable = false;
    let setupAttention = false;
    let lastFailureCode: string | null = null;
    for (const interview of candidates) {
      try {
        await saveProminenceResearch(interview, user.id, {
          trigger: "QUIET_SCAN",
        });
        updated += 1;
      } catch (error) {
        if (error instanceof GoogleSearchConfigError) throw error;
        failed += 1;
        if (error instanceof SearchProviderFallbackError) {
          retryable ||= error.retryable;
          setupAttention ||= error.providerErrors.some((failure) =>
            ["not_configured", "configuration_or_auth"].includes(failure.code)
          );
          lastFailureCode =
            error.providerErrors[error.providerErrors.length - 1]?.code ??
            lastFailureCode;
        } else {
          retryable = true;
          lastFailureCode = "provider_error";
        }
        console.warn(`[Quiet VIP Scan Item Failed] Interview ${interview.id}:`, error);
      }
    }

    console.log(
      `[Quiet VIP Scan Completed] Client: ${targetClientId || "all-clients"}. Scanned: ${candidates.length}, Updated: ${updated}, Failed: ${failed}`
    );

    return NextResponse.json({
      success: true,
      jobStatus: failed > 0 ? "failed" : "succeeded",
      scanned: candidates.length,
      updated,
      failed,
      limit: boundedLimit,
      retryable: failed > 0 && retryable && !setupAttention,
      setupAttention,
      failureCode: lastFailureCode,
    });
  } catch (error: unknown) {
    if (error instanceof GoogleSearchConfigError) {
      console.warn("[Quiet VIP Scan Skipped] Google Search provider is not configured.");
      return NextResponse.json(
        {
          code: GOOGLE_SEARCH_NOT_CONFIGURED_CODE,
          error:
            "Standout quiet scan cannot see a search key in this deployment yet.",
          diagnostics: getSearchDiagnostics(),
        },
        { status: 503 }
      );
    }

    if (error instanceof StandoutResearchCostLimitError) {
      return NextResponse.json(
        {
          code: error.code,
          error: error.message,
          jobStatus: "skipped",
        },
        { status: error.status }
      );
    }

    const err = error as { status?: number; message?: string };
    if (err.status) {
      console.error(`[Quiet VIP Scan Error] Status ${err.status}: ${err.message || error}`);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("[Quiet VIP Scan Exception] Critical error running background scan:", error);
    return safeApiErrorResponse(error, {
      fallbackMessage: "Could not run the quiet standout scan.",
      logPrefix: "Quiet standout scan failed:",
    });
  } finally {
    if (jobKey && jobStarted) finishJob(jobKey);
  }
}

async function findProminenceCandidates(
  where: Prisma.InterviewWhereInput,
  limit: number
) {
  try {
    return await db.interview.findMany({
      where,
      orderBy: [{ estimatedPublishDate: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: researchableInterviewSelect,
    });
  } catch (error) {
    if (!isMissingProminenceSignalsColumnError(error)) throw error;
    return db.interview.findMany({
      where: {
        ...buildLegacyBackgroundProminenceWhere(),
        clientId: where.clientId,
        id: where.id,
      },
      orderBy: [{ estimatedPublishDate: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: researchableInterviewSelect,
    });
  }
}
