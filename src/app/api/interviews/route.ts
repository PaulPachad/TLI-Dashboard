// ==============================================================================
// GET /api/interviews — List interviews for the current client
// ==============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { UserRole } from "@/types/db";
import type { Prisma } from "@prisma/client";
import { getInterviewProgress } from "@/lib/actions/progress";
import { assessInterviewProminence } from "@/lib/prominence/signals";

const baseInterviewSelect = {
  id: true,
  clientId: true,
  sheetSourceId: true,
  sourceRowNumber: true,
  sourceRowHash: true,
  intervieweeName: true,
  intervieweeCompany: true,
  intervieweeEmail: true,
  intervieweeTitle: true,
  publicistName: true,
  publicistEmail: true,
  topic: true,
  articleUrl: true,
  buzzfeedUrl: true,
  interviewDocUrl: true,
  image1Url: true,
  image2Url: true,
  extraImagesUrl: true,
  videoUrl: true,
  linkedinUrl: true,
  twitterUrl: true,
  liveEmailStatusImported: true,
  pressFollowupStatusImported: true,
  estimatedPublishDate: true,
  createdAt: true,
  updatedAt: true,
  actions: {
    orderBy: { createdAt: "desc" as const },
  },
  client: {
    select: { name: true, company: true },
  },
} satisfies Prisma.InterviewSelect;

const interviewSelect = {
  ...baseInterviewSelect,
  companyEmployeeCount: true,
  companyRevenueUsd: true,
  largestSocialFollowerCount: true,
  prominenceNotes: true,
  prominenceSignalsJson: true,
} satisfies Prisma.InterviewSelect;

type InterviewWithActions = Prisma.InterviewGetPayload<{
  select: typeof interviewSelect;
}>;

const DEFAULT_PAGE_SIZE = 120;
const MAX_PAGE_SIZE = 250;

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiAuth();

    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get("clientId");
    const search = searchParams.get("search");
    const topic = searchParams.get("topic");
    const status = searchParams.get("status"); // "new" | "email_sent" | "shared" | "needs_contact" | "all"
    const limit = clampPositiveInteger(
      searchParams.get("limit"),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );
    const offset = clampPositiveInteger(searchParams.get("offset"), 0);

    // Determine which client's interviews to fetch
    let targetClientId: string;

    if (user.role === UserRole.ADMIN && clientId) {
      targetClientId = clientId;
    } else if (user.clientId) {
      targetClientId = user.clientId;
    } else if (user.role === UserRole.ADMIN) {
      // Admin without specific client — return all
      const topicOptions = await listInterviewTopicOptions();
      const where = buildInterviewWhere({ search, topic });
      const totalCount = await db.interview.count({ where });
      const interviews = await findInterviews({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      });
      return NextResponse.json({
        interviews: interviews.map(enrichInterview),
        topicOptions,
        pagination: {
          totalCount,
          offset,
          limit,
          returned: interviews.length,
          hasMore: offset + interviews.length < totalCount,
        },
      });
    } else {
      return NextResponse.json(
        { error: "No client associated with this account." },
        { status: 400 }
      );
    }

    // Build where clause
    const topicOptions = await listInterviewTopicOptions(targetClientId);
    const where = buildInterviewWhere({ clientId: targetClientId, search, topic });

    // Status filter
    if (status === "needs_contact") {
      where.intervieweeEmail = null;
      where.publicistEmail = null;
    }

    const totalCount = await db.interview.count({ where });
    const interviews = await findInterviews({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
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

    return NextResponse.json({
      interviews: enriched,
      topicOptions,
      pagination: {
        totalCount,
        offset,
        limit,
        returned: enriched.length,
        hasMore: offset + interviews.length < totalCount,
      },
    });
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

function buildInterviewWhere({
  clientId,
  search,
  topic,
}: {
  clientId?: string;
  search?: string | null;
  topic?: string | null;
}): Prisma.InterviewWhereInput {
  const where: Prisma.InterviewWhereInput = {};
  if (clientId) where.clientId = clientId;

  const trimmedTopic = topic?.trim();
  if (trimmedTopic) {
    where.topic = { equals: trimmedTopic };
  }

  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    where.OR = [
      { intervieweeName: { contains: trimmedSearch } },
      { topic: { contains: trimmedSearch } },
      { intervieweeCompany: { contains: trimmedSearch } },
      { publicistName: { contains: trimmedSearch } },
    ];
  }

  return where;
}

async function listInterviewTopicOptions(clientId?: string): Promise<string[]> {
  const rows = await db.interview.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      topic: { not: null },
    },
    select: { topic: true },
    orderBy: { topic: "asc" },
  });

  const seen = new Set<string>();
  const topics: string[] = [];
  for (const row of rows) {
    const topic = row.topic?.trim();
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    topics.push(topic);
  }

  return topics;
}

// --- Interview enrichment: compute status and next action ---

async function findInterviews(
  args: Pick<Prisma.InterviewFindManyArgs, "where" | "orderBy" | "skip" | "take">
): Promise<InterviewWithActions[]> {
  try {
    return await db.interview.findMany({
      ...args,
      select: interviewSelect,
    });
  } catch (error) {
    if (!isMissingProminenceColumnError(error)) {
      throw error;
    }

    const interviews = await db.interview.findMany({
      ...args,
      select: baseInterviewSelect,
    });

    return interviews.map((interview) => ({
      ...interview,
      companyEmployeeCount: null,
      companyRevenueUsd: null,
      largestSocialFollowerCount: null,
      prominenceNotes: null,
      prominenceSignalsJson: null,
    }));
  }
}

function clampPositiveInteger(
  value: string | null,
  fallback: number,
  max?: number
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

function isMissingProminenceColumnError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : JSON.stringify(error);
  return (
    /companyEmployeeCount|companyRevenueUsd|largestSocialFollowerCount|prominenceNotes|prominenceSignalsJson/.test(
      message
    ) &&
    /does not exist|no such column|unknown column|invalid/i.test(message)
  );
}

function enrichInterview(
  interview: InterviewWithActions
): InterviewWithActions &
  ReturnType<typeof getInterviewProgress> & {
    prominence: ReturnType<typeof assessInterviewProminence>;
  } {
  return {
    ...interview,
    ...getInterviewProgress(interview),
    prominence: assessInterviewProminence(interview),
  };
}
