import type { Interview } from "@prisma/client";
import { db } from "@/lib/db";
import { isMissingProminenceSignalsColumnError } from "@/lib/prominence/background-scan";
import { researchInterviewProminence } from "@/lib/prominence/research";

type ResearchableInterview = Pick<
  Interview,
  | "id"
  | "clientId"
  | "intervieweeName"
  | "intervieweeCompany"
  | "intervieweeTitle"
  | "topic"
  | "articleUrl"
  | "buzzfeedUrl"
  | "interviewDocUrl"
  | "linkedinUrl"
  | "twitterUrl"
>;

type ProminenceResearchTrigger = "MANUAL" | "QUIET_SCAN" | "CRON";

export async function saveProminenceResearch(
  interview: ResearchableInterview,
  createdByUserId?: string | null,
  options: { trigger?: ProminenceResearchTrigger } = {}
) {
  const trigger = options.trigger || "MANUAL";
  const result = await researchInterviewProminence(interview);
  const updated = await updateInterviewProminence(interview.id, {
    companyEmployeeCount: result.companyEmployeeCount,
    companyRevenueUsd: result.companyRevenueUsd,
    largestSocialFollowerCount: result.largestSocialFollowerCount,
    prominenceNotes: result.prominenceNotes,
    prominenceSignalsJson: result.prominenceSignalsJson,
  });

  await db.action.create({
    data: {
      clientId: interview.clientId,
      interviewId: interview.id,
      actionType: "PROMINENCE_RESEARCHED",
      status: "SUCCESS",
      note:
        result.assessment.tier === "standard"
          ? "Researched standout signals. No strong standout found yet."
          : `Researched standout signals and flagged ${result.assessment.tierLabel}.`,
      metadataJson: JSON.stringify({
        score: result.assessment.score,
        tier: result.assessment.tier,
        confidence: result.assessment.confidence,
        sourceCount: result.sourceResults.length,
        trigger,
      }),
      createdByUserId,
    },
  });

  return { result, updated };
}

async function updateInterviewProminence(
  id: string,
  data: {
    companyEmployeeCount: number | null;
    companyRevenueUsd: number | null;
    largestSocialFollowerCount: number | null;
    prominenceNotes: string | null;
    prominenceSignalsJson: string | null;
  }
) {
  const select = {
    id: true,
    companyEmployeeCount: true,
    companyRevenueUsd: true,
    largestSocialFollowerCount: true,
    prominenceNotes: true,
  } as const;

  try {
    return await db.interview.update({
      where: { id },
      data,
      select,
    });
  } catch (error) {
    if (!isMissingProminenceSignalsColumnError(error)) throw error;
    const legacyData = {
      companyEmployeeCount: data.companyEmployeeCount,
      companyRevenueUsd: data.companyRevenueUsd,
      largestSocialFollowerCount: data.largestSocialFollowerCount,
      prominenceNotes: data.prominenceNotes,
    };
    return db.interview.update({
      where: { id },
      data: legacyData,
      select,
    });
  }
}
