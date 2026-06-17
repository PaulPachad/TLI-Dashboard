export type ProminenceTier = "elite" | "high_value" | "notable" | "standard";

export interface ProminenceBadge {
  label: string;
  tone: "amber" | "emerald" | "sky" | "violet" | "slate";
}

export interface ProminenceAssessment {
  score: number;
  tier: ProminenceTier;
  tierLabel: string;
  confidence: "high" | "medium" | "low";
  badges: ProminenceBadge[];
  reasons: string[];
}

interface ProminenceInput {
  intervieweeName?: string | null;
  intervieweeCompany?: string | null;
  intervieweeTitle?: string | null;
  topic?: string | null;
  articleUrl?: string | null;
  buzzfeedUrl?: string | null;
  interviewDocUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  companyEmployeeCount?: number | null;
  companyRevenueUsd?: number | null;
  largestSocialFollowerCount?: number | null;
  prominenceNotes?: string | null;
}

const ENTERPRISE_COMPANIES = [
  "amazon",
  "apple",
  "bank of america",
  "cisco",
  "coca-cola",
  "deloitte",
  "disney",
  "ey",
  "facebook",
  "google",
  "ibm",
  "intel",
  "jpmorgan",
  "kpmg",
  "meta",
  "microsoft",
  "netflix",
  "oracle",
  "pwc",
  "salesforce",
  "spotify",
  "tesla",
  "walmart",
];

const SENIOR_TITLE_PATTERN =
  /\b(ceo|chief|founder|co-founder|owner|president|chair|chairman|chairwoman|managing partner|managing director|general manager|c-suite)\b/i;
const LEADER_TITLE_PATTERN =
  /\b(vp|vice president|svp|evp|partner|principal|head of|director|executive director|publisher|editor-in-chief)\b/i;
const STRONG_PROMINENCE_PATTERN =
  /\b(forbes|fortune|fast company|nyt|new york times|wsj|wall street journal|bloomberg|cnbc|tedx?|bestseller|best-selling|award|winner|honoree|keynote|wikipedia|verified|shark tank|unicorn|public company|fortune 500|inc\. 500|inc 500)\b/i;
const C_LEVEL_TITLE_PATTERN =
  /\b(ceo|cfo|coo|cto|cio|cmo|chro|cro|chief|c-suite)\b/i;
const FORTUNE_500_PATTERN = /\bfortune\s*500\b/i;
const WIKIPEDIA_PATTERN = /\bwikipedia\b/i;
const MAJOR_AWARD_PATTERN =
  /\b(oscar|academy award|academy awards|emmy|emmys|grammy|grammys|tony award|tony awards|tony|golden globe|bafta|pulitzer|macarthur|nobel)\b/i;
const AWARD_RECOGNITION_PATTERN =
  /\b(won|winner|winning|recipient|received|nominee|nominated|nomination|finalist)\b/i;

export function assessInterviewProminence(
  input: ProminenceInput
): ProminenceAssessment {
  const badges: ProminenceBadge[] = [];
  const reasons: string[] = [];
  let score = 0;
  let hardEvidenceCount = 0;
  let forceNotable = false;
  let forceHighValue = false;

  const employees = input.companyEmployeeCount ?? null;
  if (employees !== null) {
    hardEvidenceCount++;
    if (employees >= 50_000) {
      score += 32;
      badges.push({ label: "50K+ Employees", tone: "emerald" });
      reasons.push(`Company has ${formatCount(employees)} employees.`);
    } else if (employees >= 10_000) {
      score += 22;
      badges.push({ label: "10K+ Employees", tone: "emerald" });
      reasons.push(`Company has ${formatCount(employees)} employees.`);
    } else if (employees >= 5_000) {
      score += 8;
      reasons.push(`Company has ${formatCount(employees)} employees.`);
    }
  }

  const revenue = input.companyRevenueUsd ?? null;
  if (revenue !== null) {
    hardEvidenceCount++;
    if (revenue >= 1_000_000_000) {
      score += 30;
      badges.push({ label: "$1B+ Revenue", tone: "emerald" });
      reasons.push(`Company revenue is about ${formatMoney(revenue)}.`);
    } else if (revenue >= 500_000_000) {
      score += 22;
      badges.push({ label: "$500M+ Revenue", tone: "emerald" });
      reasons.push(`Company revenue is about ${formatMoney(revenue)}.`);
    } else if (revenue >= 100_000_000) {
      score += 10;
      reasons.push(`Company revenue is about ${formatMoney(revenue)}.`);
    }
  }

  const followers = input.largestSocialFollowerCount ?? null;
  if (followers !== null) {
    hardEvidenceCount++;
    if (followers >= 1_000_000) {
      score += 32;
      badges.push({ label: "1M+ Audience", tone: "sky" });
      reasons.push(`Largest social audience is ${formatCount(followers)} followers.`);
      forceHighValue = true;
    } else if (followers >= 500_000) {
      score += 22;
      badges.push({ label: "500K+ Audience", tone: "sky" });
      reasons.push(`Largest social audience is ${formatCount(followers)} followers.`);
    } else if (followers >= 100_000) {
      score += 10;
      reasons.push(`Largest social audience is ${formatCount(followers)} followers.`);
    }
  }

  const company = input.intervieweeCompany?.toLowerCase() ?? "";
  if (ENTERPRISE_COMPANIES.some((known) => company.includes(known))) {
    score += 20;
    badges.push({ label: "Enterprise Company", tone: "emerald" });
    reasons.push("Company name matches a widely recognized enterprise brand.");
  }

  const title = input.intervieweeTitle ?? "";
  if (SENIOR_TITLE_PATTERN.test(title)) {
    score += 8;
    reasons.push(`Title indicates senior leadership: ${title}.`);
  } else if (LEADER_TITLE_PATTERN.test(title)) {
    score += 4;
    reasons.push(`Title indicates leadership: ${title}.`);
  }

  const notes = [input.prominenceNotes, input.topic, input.intervieweeCompany]
    .filter(Boolean)
    .join(" ");
  if (C_LEVEL_TITLE_PATTERN.test(title) && FORTUNE_500_PATTERN.test(notes)) {
    score += 32;
    hardEvidenceCount++;
    forceHighValue = true;
    badges.push({ label: "Fortune 500 C-Level", tone: "emerald" });
    reasons.push(
      `C-level leader at a Fortune 500 company: ${title}.`
    );
  }
  if (WIKIPEDIA_PATTERN.test(notes)) {
    score += 20;
    hardEvidenceCount++;
    forceNotable = true;
    badges.push({ label: "Wikipedia", tone: "amber" });
    reasons.push(summarizeProminenceNotes(input.prominenceNotes));
  }
  if (
    MAJOR_AWARD_PATTERN.test(notes) &&
    AWARD_RECOGNITION_PATTERN.test(notes)
  ) {
    score += 20;
    hardEvidenceCount++;
    forceNotable = true;
    badges.push({ label: "Major Award", tone: "amber" });
    reasons.push(summarizeProminenceNotes(input.prominenceNotes));
  }
  if (STRONG_PROMINENCE_PATTERN.test(notes)) {
    score += 14;
    hardEvidenceCount++;
    if (
      !badges.some((badge) =>
        ["Wikipedia", "Major Award", "Prominent Person"].includes(badge.label)
      )
    ) {
      badges.push({ label: "Prominent Person", tone: "amber" });
      reasons.push(summarizeProminenceNotes(input.prominenceNotes));
    }
  }

  if (input.linkedinUrl || input.twitterUrl) {
    score += 4;
  }
  if (input.articleUrl && !input.articleUrl.includes("/unpublished/")) {
    score += 4;
  }
  if (input.buzzfeedUrl || input.interviewDocUrl) {
    score += 2;
  }

  const cappedScore = Math.min(100, score);
  const tier = getTier(cappedScore, badges, { forceNotable, forceHighValue });
  const tierLabel = getTierLabel(tier);
  const visibleBadges = getVisibleBadges(tier, badges);

  return {
    score: cappedScore,
    tier,
    tierLabel,
    confidence: getConfidence(hardEvidenceCount, input),
    badges: visibleBadges,
    reasons: reasons.slice(0, 4),
  };
}

export function parseCountMetric(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/,/g, "").trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const suffix = match[2];
  if (suffix === "b" || suffix === "billion") return Math.round(amount * 1_000_000_000);
  if (suffix === "m" || suffix === "million") return Math.round(amount * 1_000_000);
  if (suffix === "k" || suffix === "thousand") return Math.round(amount * 1_000);
  return Math.round(amount);
}

export function parseMoneyMetric(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[$,]/g, "").trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const suffix = match[2];
  if (suffix === "b" || suffix === "billion") return amount * 1_000_000_000;
  if (suffix === "m" || suffix === "million") return amount * 1_000_000;
  if (suffix === "k" || suffix === "thousand") return amount * 1_000;
  return amount;
}

function getTier(
  score: number,
  badges: ProminenceBadge[],
  options: { forceNotable?: boolean; forceHighValue?: boolean } = {}
): ProminenceTier {
  const hasHardBadge = badges.some((badge) =>
    [
      "50K+ Employees",
      "10K+ Employees",
      "$1B+ Revenue",
      "$500M+ Revenue",
      "1M+ Audience",
      "500K+ Audience",
      "Enterprise Company",
      "Fortune 500 C-Level",
    ].includes(badge.label)
  );
  const hasMultipleHardBadges =
    badges.filter((badge) =>
      [
        "50K+ Employees",
        "10K+ Employees",
        "$1B+ Revenue",
        "$500M+ Revenue",
        "1M+ Audience",
        "500K+ Audience",
        "Enterprise Company",
        "Fortune 500 C-Level",
        "Prominent Person",
      ].includes(badge.label)
    ).length >= 2;

  if (score >= 75 && hasMultipleHardBadges) return "elite";
  if (options.forceHighValue || (score >= 55 && hasHardBadge)) {
    return "high_value";
  }
  if (options.forceNotable || (score >= 40 && hasHardBadge)) {
    return "notable";
  }
  return "standard";
}

function getTierLabel(tier: ProminenceTier): string {
  const labels: Record<ProminenceTier, string> = {
    elite: "Elite Lead",
    high_value: "High-Value Lead",
    notable: "Notable Lead",
    standard: "Standard Lead",
  };
  return labels[tier];
}

function getVisibleBadges(
  tier: ProminenceTier,
  badges: ProminenceBadge[]
): ProminenceBadge[] {
  if (tier === "standard") return [];

  const tierBadge: ProminenceBadge = {
    label: getTierLabel(tier),
    tone: tier === "elite" ? "amber" : tier === "high_value" ? "violet" : "slate",
  };
  const unique = new Map<string, ProminenceBadge>();
  for (const badge of [tierBadge, ...badges]) {
    unique.set(badge.label, badge);
  }
  return Array.from(unique.values()).slice(0, 4);
}

function getConfidence(
  hardEvidenceCount: number,
  input: ProminenceInput
): ProminenceAssessment["confidence"] {
  if (hardEvidenceCount >= 2) return "high";
  if (hardEvidenceCount === 1 || input.intervieweeTitle) return "medium";
  return "low";
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${trimNumber(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trimNumber(value / 1_000)}K`;
  return value.toLocaleString("en-US");
}

function formatMoney(value: number): string {
  if (value >= 1_000_000_000) return `$${trimNumber(value / 1_000_000_000)}B`;
  if (value >= 1_000_000) return `$${trimNumber(value / 1_000_000)}M`;
  if (value >= 1_000) return `$${trimNumber(value / 1_000)}K`;
  return `$${value.toLocaleString("en-US")}`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function summarizeProminenceNotes(value?: string | null): string {
  if (!value) {
    return "Search found press, awards, authorship, speaking, or public-figure signals.";
  }

  const cleanText = cleanProminenceText(value);
  if (!cleanText) {
    return "Search found press, awards, authorship, speaking, or public-figure signals.";
  }

  return cleanText;
}

function cleanProminenceText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\((?:https?:\/\/|www\.)[^)]+\)/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\*\*/g, "")
    .replace(/#+\s*/g, "")
    .replace(/\b[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/\S*)?:\s*/g, "")
    .replace(/Here are the key prominence signals and facts for .*?:/i, "")
    .replace(/\bLeadership\s*&\s*Company\s*Prominence\b/gi, "")
    .replace(/\bRole:\s*/gi, "")
    .replace(/(?:^|\s)[*-]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-:;,\s]+/, "");
}
