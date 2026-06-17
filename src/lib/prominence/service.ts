import type { Interview } from "@prisma/client";
import { db } from "@/lib/db";
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

export async function saveProminenceResearch(
  interview: ResearchableInterview,
  createdByUserId?: string | null
) {
  const result = await researchInterviewProminence(interview);
  const updated = await db.interview.update({
    where: { id: interview.id },
    data: {
      companyEmployeeCount: result.companyEmployeeCount,
      companyRevenueUsd: result.companyRevenueUsd,
      largestSocialFollowerCount: result.largestSocialFollowerCount,
      prominenceNotes: result.prominenceNotes,
    },
  });

  await db.action.create({
    data: {
      clientId: interview.clientId,
      interviewId: interview.id,
      actionType: "PROMINENCE_RESEARCHED",
      status: "SUCCESS",
      note:
        result.assessment.tier === "standard"
          ? "Researched VIP signals. No strong prominence signals found yet."
          : `Researched VIP signals and flagged ${result.assessment.tierLabel}.`,
      metadataJson: JSON.stringify({
        score: result.assessment.score,
        tier: result.assessment.tier,
        confidence: result.assessment.confidence,
        sourceCount: result.sourceResults.length,
      }),
      createdByUserId,
    },
  });

  return { result, updated };
}
