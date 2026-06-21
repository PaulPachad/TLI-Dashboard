import type { Prisma } from "@prisma/client";

export const DEFAULT_VIP_PROMINENCE_CRON_LIMIT = 6;
export const MAX_VIP_PROMINENCE_CRON_LIMIT = 12;

interface ProminenceResearchStatus {
  companyEmployeeCount?: number | null;
  companyRevenueUsd?: number | null;
  largestSocialFollowerCount?: number | null;
  prominenceNotes?: string | null;
  prominenceSignalsJson?: string | null;
  actions?: Array<{ actionType: string }>;
}

export function getVipProminenceCronLimit(
  rawValue = process.env.VIP_PROMINENCE_CRON_LIMIT
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return DEFAULT_VIP_PROMINENCE_CRON_LIMIT;
  return Math.min(
    Math.max(Math.trunc(parsed), 1),
    MAX_VIP_PROMINENCE_CRON_LIMIT
  );
}

export function isCronRequestAuthorized(
  authorizationHeader: string | null,
  secret = process.env.CRON_SECRET
): boolean {
  if (!secret) return false;
  return authorizationHeader === `Bearer ${secret}`;
}

export function shouldResearchProminenceInBackground(
  interview: ProminenceResearchStatus
): boolean {
  if (!interview.prominenceSignalsJson?.trim()) return true;

  const alreadyResearched = interview.actions?.some(
    (action) => action.actionType === "PROMINENCE_RESEARCHED"
  );

  return (
    !alreadyResearched &&
    interview.companyEmployeeCount == null &&
    interview.companyRevenueUsd == null &&
    interview.largestSocialFollowerCount == null &&
    !interview.prominenceNotes?.trim()
  );
}

export function buildBackgroundProminenceWhere(): Prisma.InterviewWhereInput {
  return {
    OR: [
      { prominenceSignalsJson: null },
      {
        companyEmployeeCount: null,
        companyRevenueUsd: null,
        largestSocialFollowerCount: null,
        prominenceNotes: null,
        actions: {
          none: { actionType: "PROMINENCE_RESEARCHED" },
        },
      },
    ],
  };
}
