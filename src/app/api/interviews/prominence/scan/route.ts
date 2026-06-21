import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { UserRole } from "@/types/db";
import { buildBackgroundProminenceWhere } from "@/lib/prominence/background-scan";
import {
  GOOGLE_SEARCH_NOT_CONFIGURED_CODE,
  GoogleSearchConfigError,
  getSearchDiagnostics,
} from "@/lib/prominence/research";
import { saveProminenceResearch } from "@/lib/prominence/service";

const DEFAULT_SCAN_LIMIT = 3;
const MAX_SCAN_LIMIT = 6;

export async function POST(request: NextRequest) {
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

    let targetClientId: string | null = null;
    if (user.role === UserRole.ADMIN && body.clientId) {
      targetClientId = body.clientId;
    } else if (user.clientId) {
      targetClientId = user.clientId;
    }

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

    const where: Prisma.InterviewWhereInput = {
      ...buildBackgroundProminenceWhere(),
      ...(targetClientId ? { clientId: targetClientId } : {}),
      ...(requestedInterviewIds.length > 0
        ? { id: { in: requestedInterviewIds } }
        : {}),
    };

    const candidates = await db.interview.findMany({
      where,
      orderBy: [
        { estimatedPublishDate: "asc" },
        { createdAt: "desc" },
      ],
      take: limit,
    });
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
    for (const interview of candidates) {
      try {
        await saveProminenceResearch(interview, user.id, {
          trigger: "QUIET_SCAN",
        });
        updated += 1;
      } catch (error) {
        if (error instanceof GoogleSearchConfigError) throw error;
        failed += 1;
        console.warn("Quiet VIP scan failed:", interview.id, error);
      }
    }

    return NextResponse.json({
      success: true,
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
            "VIP quiet scan cannot see a search key in this deployment yet.",
          diagnostics: getSearchDiagnostics(),
        },
        { status: 503 }
      );
    }

    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("Quiet VIP scan failed:", error);
    return NextResponse.json(
      { error: "Could not run the quiet VIP scan." },
      { status: 500 }
    );
  }
}
