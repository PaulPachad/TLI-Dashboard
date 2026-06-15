// ==============================================================================
// GET /api/interviews — List interviews for the current client
// ==============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { UserRole } from "@/types/db";
import type { Prisma } from "@prisma/client";
import { getInterviewProgress } from "@/lib/actions/progress";

const interviewInclude = {
  actions: {
    orderBy: { createdAt: "desc" as const },
  },
  client: {
    select: { name: true, company: true },
  },
} satisfies Prisma.InterviewInclude;

type InterviewWithActions = Prisma.InterviewGetPayload<{
  include: typeof interviewInclude;
}>;

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiAuth();

    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get("clientId");
    const search = searchParams.get("search");
    const status = searchParams.get("status"); // "new" | "email_sent" | "shared" | "needs_contact" | "all"

    // Determine which client's interviews to fetch
    let targetClientId: string;

    if (user.role === UserRole.ADMIN && clientId) {
      targetClientId = clientId;
    } else if (user.clientId) {
      targetClientId = user.clientId;
    } else if (user.role === UserRole.ADMIN) {
      // Admin without specific client — return all
      const interviews = await db.interview.findMany({
        include: interviewInclude,
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ interviews: interviews.map(enrichInterview) });
    } else {
      return NextResponse.json(
        { error: "No client associated with this account." },
        { status: 400 }
      );
    }

    // Build where clause
    const where: Prisma.InterviewWhereInput = { clientId: targetClientId };

    // Search filter
    if (search) {
      where.OR = [
        { intervieweeName: { contains: search } },
        { topic: { contains: search } },
        { intervieweeCompany: { contains: search } },
        { publicistName: { contains: search } },
      ];
    }

    // Status filter
    if (status === "needs_contact") {
      where.intervieweeEmail = null;
      where.publicistEmail = null;
    }

    const interviews = await db.interview.findMany({
      where,
      include: interviewInclude,
      orderBy: { createdAt: "desc" },
    });

    let enriched = interviews.map(enrichInterview);

    // Client-side status filtering (based on actions)
    if (status && status !== "all") {
      enriched = enriched.filter((i) => {
        const isUnpub = i.articleUrl.includes("/unpublished/") || i.liveEmailStatusImported?.toUpperCase() !== "LIVE";
        if (status === "upcoming") return isUnpub;
        if (status !== "needs_contact" && isUnpub) return false; // Hide unpublished from action-based tabs, but keep in needs_contact if needed

        if (status === "new") return i.currentStatus === "new";
        if (status === "email_sent") return i.currentStatus === "email_sent";
        if (status === "shared") return i.currentStatus === "shared";
        if (status === "leveraged") return i.currentStatus === "leveraged";
        return true;
      });
    }

    return NextResponse.json({ interviews: enriched });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error fetching interviews:", error);
    return NextResponse.json(
      { error: "Failed to fetch interviews." },
      { status: 500 }
    );
  }
}

// --- Interview enrichment: compute status and next action ---

function enrichInterview(
  interview: InterviewWithActions
): InterviewWithActions & ReturnType<typeof getInterviewProgress> {
  return {
    ...interview,
    ...getInterviewProgress(interview),
  };
}
