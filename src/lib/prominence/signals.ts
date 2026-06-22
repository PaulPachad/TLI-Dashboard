export type ProminenceTier = "elite" | "high_value" | "notable" | "standard";

export interface ProminenceBadge {
  label: string;
  tone: "amber" | "emerald" | "sky" | "violet" | "slate";
}

export interface ProminenceSignal {
  label: string;
  tone: ProminenceBadge["tone"];
  value?: string | null;
  detail?: string | null;
  frontEligible?: boolean;
}

export interface ProminenceFrontFlag {
  label: string;
  tone: "amber" | "violet";
  reason: string;
}

export interface ProminenceSignalGroups {
  exceptional: ProminenceSignal[];
  audience: ProminenceSignal[];
  company: ProminenceSignal[];
  context: ProminenceSignal[];
}

export interface ProminenceEvidenceSource {
  title: string;
  summary: string;
  url: string;
}

export type StandoutSignalKind =
  | "role"
  | "audience"
  | "company"
  | "revenue"
  | "award"
  | "speaking"
  | "wikipedia"
  | "unicorn"
  | "press"
  | "funding"
  | "acquisition"
  | "public_company"
  | "context";

export interface StoredStandoutSignal {
  kind: StandoutSignalKind;
  label: string;
  value?: string | null;
  detail: string;
  confidence: "high" | "medium" | "low";
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  placement: "front" | "back" | "evidence";
}

export interface StoredStandoutSignals {
  version: 1;
  standoutSummary: string | null;
  signals: StoredStandoutSignal[];
  sourceCount: number;
  researchedAt: string;
  provider: string;
}

export interface ProminenceAssessment {
  score: number;
  tier: ProminenceTier;
  tierLabel: string;
  confidence: "high" | "medium" | "low";
  badges: ProminenceBadge[];
  reasons: string[];
  frontFlag: ProminenceFrontFlag | null;
  signalGroups: ProminenceSignalGroups;
  hasAnySignals: boolean;
  evidenceSummary: string | null;
  evidenceSources: ProminenceEvidenceSource[];
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
  prominenceSignalsJson?: string | null;
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
const PUBLIC_PERSON_PATTERN =
  /\b(forbes|fast company|nyt|new york times|wsj|wall street journal|bloomberg|cnbc|tedx?|bestseller|best-selling|shark tank|verified public figure|public figure|inc\. 500|inc 500)\b/i;
const C_LEVEL_TITLE_PATTERN =
  /\b(ceo|cfo|coo|cto|cio|cmo|chro|cro|chief|c-suite)\b/i;
const FORTUNE_500_PATTERN = /\bfortune\s*500\b/i;
const MAJOR_CONFERENCE_SPEAKER_PATTERN =
  /\b(speaker|spoke|speaking|keynote|panelist|presented|featured)\b.*\b(sxsw|south by southwest|davos|world economic forum|cannes lions|aspen ideas|milken|collision|web summit)\b|\b(sxsw|south by southwest|davos|world economic forum|cannes lions|aspen ideas|milken|collision|web summit)\b.*\b(speaker|spoke|speaking|keynote|panelist|presented|featured)\b/i;
const UNICORN_FOUNDER_PATTERN =
  /\b(founder|co-founder|cofounder|founded)\b.*\b(unicorn|billion-dollar company|billion dollar company|valued at \$?1\b.*billion|valuation of \$?1\b.*billion)\b|\b(unicorn|billion-dollar company|billion dollar company|valued at \$?1\b.*billion|valuation of \$?1\b.*billion)\b.*\b(founder|co-founder|cofounder|founded)\b/i;
const WIKIPEDIA_PATTERN = /\bwikipedia\b/i;
const MAJOR_AWARD_PATTERN =
  /\b(oscar|academy award|academy awards|emmy|emmys|grammy|grammys|tony award|tony awards|tony|golden globe|bafta|pulitzer|macarthur|nobel)\b/i;
const AWARD_RECOGNITION_PATTERN =
  /\b(won|winner|winning|recipient|received|nominee|nominated|nomination|finalist)\b/i;
const GENERIC_PROMINENCE_TEXT_PATTERN =
  /\b(here are|below are|the following are|following are|based on the research|no information found|prominence signals include|concise prominence signals|key prominence signals|vip\/prospect prominence signals|evidence summary|prominence signals and facts|unfortunately|this person appears to be|i found)\b|#{1,6}\s*role\s*\/?\s*&?\s*notability|\brole\s*\/\s*notability\b/i;
const STRUCTURED_FRONT_KINDS = new Set<StandoutSignalKind>([
  "award",
  "speaking",
  "wikipedia",
  "unicorn",
]);

export function parseStoredStandoutSignals(
  value?: string | null,
  fallbackNotes?: string | null
): StoredStandoutSignals | null {
  let jsonString = value?.trim() || "";

  if (!jsonString && fallbackNotes) {
    const jsonMatch = fallbackNotes.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
  }

  if (!jsonString) return null;

  try {
    const raw = JSON.parse(jsonString) as Partial<StoredStandoutSignals>;
    if (raw.version !== 1 || !Array.isArray(raw.signals)) return null;

    const signals = raw.signals
      .map(normalizeStoredStandoutSignal)
      .filter((signal): signal is StoredStandoutSignal => signal !== null);

    if (signals.length === 0) return null;

    const standoutSummary = summarizeStoredSignals(signals);

    return {
      version: 1,
      standoutSummary,
      signals: uniqueStoredSignals(signals).slice(0, 8),
      sourceCount: Math.max(0, Number(raw.sourceCount) || 0),
      researchedAt:
        typeof raw.researchedAt === "string"
          ? raw.researchedAt
          : new Date(0).toISOString(),
      provider: typeof raw.provider === "string" ? raw.provider : "unknown",
    };
  } catch {
    return null;
  }
}

export function buildProminenceSignalsJson(input: {
  intervieweeName?: string | null;
  intervieweeCompany?: string | null;
  intervieweeTitle?: string | null;
  companyEmployeeCount?: number | null;
  companyRevenueUsd?: number | null;
  largestSocialFollowerCount?: number | null;
  results?: Array<{ title: string; url: string; snippet: string }>;
  provider?: string;
  researchedAt?: Date;
}): string | null {
  const signals: StoredStandoutSignal[] = [];
  const sourceResults = input.results || [];
  const sourceCount = sourceResults.length;
  const sourceText = sourceResults
    .map((result) => `${result.title} ${result.snippet}`)
    .join(" ");
  const bestSource = sourceResults.find((result) => result.url) || null;

  // Try to parse structured JSON from the snippets first (Gemini response)
  let parsedFromJson = false;
  for (const result of sourceResults) {
    const jsonMatch = result.snippet.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && Array.isArray(parsed.signals)) {
          for (const rawSignal of parsed.signals) {
            const normalized = normalizeStoredStandoutSignal(rawSignal);
            if (normalized) {
              if (!normalized.sourceUrl && isSafeHttpUrl(result.url)) {
                normalized.sourceUrl = result.url;
              }
              if (!normalized.sourceTitle && result.title) {
                normalized.sourceTitle = result.title;
              }
              signals.push(normalized);
            }
          }
          parsedFromJson = true;
          break;
        }
      } catch (e) {
        // Fall back
      }
    }
  }

  if (!parsedFromJson) {
    if (input.intervieweeTitle && SENIOR_TITLE_PATTERN.test(input.intervieweeTitle)) {
      signals.push({
        kind: "role",
        label: "Senior Leadership",
        value: input.intervieweeTitle,
        detail: compactRoleDetail(input),
        confidence: bestSource ? "medium" : "low",
        sourceTitle: bestSource?.title || null,
        sourceUrl: bestSource?.url || null,
        placement: "back",
      });
    } else if (input.intervieweeTitle && LEADER_TITLE_PATTERN.test(input.intervieweeTitle)) {
      signals.push({
        kind: "role",
        label: "Leadership Role",
        value: input.intervieweeTitle,
        detail: compactRoleDetail(input),
        confidence: bestSource ? "medium" : "low",
        sourceTitle: bestSource?.title || null,
        sourceUrl: bestSource?.url || null,
        placement: "back",
      });
    } else if (SENIOR_TITLE_PATTERN.test(sourceText) || LEADER_TITLE_PATTERN.test(sourceText)) {
      const roleSource = sourceResults.find((result) =>
        SENIOR_TITLE_PATTERN.test(`${result.title} ${result.snippet}`) ||
        LEADER_TITLE_PATTERN.test(`${result.title} ${result.snippet}`)
      );
      const detail = roleSource
        ? cleanSignalText(extractUsefulSnippet(roleSource.snippet, SENIOR_TITLE_PATTERN), 160)
        : null;
      if (detail) {
        signals.push({
          kind: "role",
          label: SENIOR_TITLE_PATTERN.test(detail)
            ? "Senior Leadership"
            : "Leadership Role",
          detail,
          confidence: "medium",
          sourceTitle: roleSource?.title || null,
          sourceUrl: roleSource?.url || null,
          placement: "back",
        });
      }
    }

    if (input.companyEmployeeCount != null) {
      signals.push({
        kind: "company",
        label: "Company Size",
        value: formatCount(input.companyEmployeeCount),
        detail: `${formatCount(input.companyEmployeeCount)} employees`,
        confidence: bestSource ? "medium" : "low",
        sourceTitle: bestSource?.title || null,
        sourceUrl: bestSource?.url || null,
        placement: "back",
      });
    }

    if (input.companyRevenueUsd != null) {
      signals.push({
        kind: "revenue",
        label: "Revenue",
        value: formatMoney(input.companyRevenueUsd),
        detail: `${formatMoney(input.companyRevenueUsd)} annual revenue`,
        confidence: bestSource ? "medium" : "low",
        sourceTitle: bestSource?.title || null,
        sourceUrl: bestSource?.url || null,
        placement: "back",
      });
    }

    if (input.largestSocialFollowerCount != null) {
      signals.push({
        kind: "audience",
        label: "Audience",
        value: formatCount(input.largestSocialFollowerCount),
        detail: `${formatCount(input.largestSocialFollowerCount)} followers or subscribers`,
        confidence: bestSource ? "medium" : "low",
        sourceTitle: bestSource?.title || null,
        sourceUrl: bestSource?.url || null,
        placement:
          bestSource && input.largestSocialFollowerCount >= 1_000_000
            ? "front"
            : "back",
      });
    }

    addPatternSignal(signals, sourceResults, "wikipedia", "Wikipedia", WIKIPEDIA_PATTERN);
    addPatternSignal(
      signals,
      sourceResults,
      "speaking",
      "Major Conference",
      MAJOR_CONFERENCE_SPEAKER_PATTERN
    );
    addPatternSignal(
      signals,
      sourceResults,
      "unicorn",
      "Unicorn Founder",
      UNICORN_FOUNDER_PATTERN
    );
    if (MAJOR_AWARD_PATTERN.test(sourceText) && AWARD_RECOGNITION_PATTERN.test(sourceText)) {
      addPatternSignal(signals, sourceResults, "award", "Major Award", MAJOR_AWARD_PATTERN);
    }
    if (PUBLIC_PERSON_PATTERN.test(sourceText)) {
      addPatternSignal(signals, sourceResults, "press", "Public Profile", PUBLIC_PERSON_PATTERN);
    }
  }

  const cleanSignals = uniqueStoredSignals(
    signals
      .map(normalizeStoredStandoutSignal)
      .filter((signal): signal is StoredStandoutSignal => signal !== null)
  ).slice(0, 8);

  if (cleanSignals.length === 0) return null;

  const standoutSummary = buildStandoutSummary(cleanSignals, input);
  const payload: StoredStandoutSignals = {
    version: 1,
    standoutSummary,
    signals: cleanSignals,
    sourceCount,
    researchedAt: (input.researchedAt || new Date()).toISOString(),
    provider: input.provider || "unknown",
  };

  return JSON.stringify(payload);
}

export function assessInterviewProminence(
  input: ProminenceInput
): ProminenceAssessment {
  const storedSignals = parseStoredStandoutSignals(
    input.prominenceSignalsJson,
    input.prominenceNotes
  );
  const hasStructuredPayload = Boolean(input.prominenceSignalsJson?.trim());
  const hasStructuredSignals = Boolean(storedSignals);
  const badges: ProminenceBadge[] = [];
  const reasons: string[] = [];
  const signalGroups: ProminenceSignalGroups = {
    exceptional: [],
    audience: [],
    company: [],
    context: [],
  };
  let score = 0;
  let hardEvidenceCount = 0;
  let forceNotable = false;
  let forceHighValue = false;

  const employees = input.companyEmployeeCount ?? null;
  if (employees !== null && !hasStructuredSignals) {
    signalGroups.company.push({
      label: "Company Size",
      value: formatCount(employees),
      detail: "employees",
      tone: employees >= 10_000 ? "emerald" : "slate",
    });
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
  if (revenue !== null && !hasStructuredSignals) {
    signalGroups.company.push({
      label: "Revenue",
      value: formatMoney(revenue),
      detail: "annual revenue",
      tone: revenue >= 500_000_000 ? "emerald" : "slate",
    });
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
  if (followers !== null && !hasStructuredSignals) {
    signalGroups.audience.push({
      label: "Audience",
      value: formatCount(followers),
      detail: "largest social following",
      tone: followers >= 500_000 ? "sky" : "slate",
    });
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
    signalGroups.company.push({
      label: "Enterprise Brand",
      detail: "Company name matches a widely recognized enterprise brand.",
      tone: "emerald",
    });
  }

  const title = input.intervieweeTitle ?? "";
  if (!hasStructuredSignals && SENIOR_TITLE_PATTERN.test(title)) {
    score += 8;
    reasons.push(`Title indicates senior leadership: ${title}.`);
  } else if (!hasStructuredSignals && LEADER_TITLE_PATTERN.test(title)) {
    score += 4;
    reasons.push(`Title indicates leadership: ${title}.`);
  }

  const structuredNotes = storedSignals
    ? storedSignals.signals
        .map((signal) =>
          [signal.label, signal.value, signal.detail].filter(Boolean).join(" ")
        )
        .join(" ")
    : "";
  if (storedSignals) {
    const structuredScore = applyStoredStandoutSignals(
      storedSignals,
      signalGroups,
      badges,
      reasons
    );
    score += structuredScore.score;
    hardEvidenceCount += structuredScore.hardEvidenceCount;
    forceNotable ||= structuredScore.forceNotable;
    forceHighValue ||= structuredScore.forceHighValue;
  }

  const notes = [
    hasStructuredPayload ? "" : input.prominenceNotes,
    hasStructuredPayload ? "" : input.topic,
    hasStructuredPayload ? "" : input.intervieweeCompany,
  ]
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
    signalGroups.company.push({
      label: "Role/Company Scale",
      value: "Fortune 500",
      detail: `C-level leader: ${title}.`,
      tone: "emerald",
    });
  }
  if (MAJOR_CONFERENCE_SPEAKER_PATTERN.test(notes)) {
    score += 20;
    hardEvidenceCount++;
    forceNotable = true;
    badges.push({ label: "Major Conference Speaker", tone: "amber" });
    const detail = summarizeProminenceNotes(hasStructuredSignals ? structuredNotes : input.prominenceNotes);
    reasons.push(detail);
    signalGroups.exceptional.push({
      label: "Major Conference",
      detail: summarizeSignalDetail(detail),
      tone: "amber",
      frontEligible: true,
    });
  }
  if (UNICORN_FOUNDER_PATTERN.test([title, notes].filter(Boolean).join(" "))) {
    score += 32;
    hardEvidenceCount++;
    forceHighValue = true;
    badges.push({ label: "Unicorn Founder", tone: "emerald" });
    const detail = summarizeProminenceNotes(hasStructuredSignals ? structuredNotes : input.prominenceNotes);
    reasons.push(detail);
    signalGroups.exceptional.push({
      label: "Unicorn Founder",
      detail: summarizeSignalDetail(detail),
      tone: "violet",
      frontEligible: true,
    });
  }
  if (WIKIPEDIA_PATTERN.test(notes)) {
    score += 20;
    hardEvidenceCount++;
    forceNotable = true;
    badges.push({ label: "Wikipedia", tone: "amber" });
    const detail = summarizeProminenceNotes(hasStructuredSignals ? structuredNotes : input.prominenceNotes);
    reasons.push(detail);
    signalGroups.exceptional.push({
      label: "Wikipedia",
      detail: summarizeSignalDetail(detail),
      tone: "amber",
      frontEligible: true,
    });
  }
  if (
    MAJOR_AWARD_PATTERN.test(notes) &&
    AWARD_RECOGNITION_PATTERN.test(notes)
  ) {
    score += 20;
    hardEvidenceCount++;
    forceNotable = true;
    badges.push({ label: "Major Award", tone: "amber" });
    const detail = summarizeProminenceNotes(hasStructuredSignals ? structuredNotes : input.prominenceNotes);
    reasons.push(detail);
    signalGroups.exceptional.push({
      label: "Major Award",
      detail: summarizeSignalDetail(detail),
      tone: "amber",
      frontEligible: true,
    });
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
      const detail = summarizeProminenceNotes(input.prominenceNotes);
      reasons.push(detail);
      if (PUBLIC_PERSON_PATTERN.test(notes)) {
        signalGroups.exceptional.push({
          label: "Exceptional",
          detail: summarizeSignalDetail(detail),
          tone: "amber",
          frontEligible: true,
        });
      }
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
  const frontFlag = getFrontFlag(signalGroups);
  const visibleReasons = uniqueStrings(reasons).slice(0, 4);
  const legacyNeedsRefresh =
    (hasStructuredPayload && !storedSignals) ||
    (!storedSignals &&
      Boolean(input.prominenceNotes?.trim()) &&
      !hasPrimarySignals(signalGroups));
  const structuredEvidenceSources =
    storedSignals?.signals
      .map(signalToEvidenceSource)
      .filter((source): source is ProminenceEvidenceSource => source !== null) ||
    [];
  const evidenceSources =
    legacyNeedsRefresh
      ? []
      : hasStructuredPayload
      ? structuredEvidenceSources
      : structuredEvidenceSources.length > 0
      ? structuredEvidenceSources
      : parseProminenceEvidenceSources(input.prominenceNotes);
  let evidenceSummary =
    storedSignals?.standoutSummary ||
    summarizeProminenceEvidence(input.prominenceNotes) ||
    summarizeSignalDetail(visibleReasons[0] || null);

  if (legacyNeedsRefresh) {
    evidenceSummary =
      "Structured standout signals have not been generated yet. Refresh research to update this card.";
  }

  if (hasPrimarySignals(signalGroups) && evidenceSummary) {
    signalGroups.context.push({
      label: "Evidence Summary",
      detail: evidenceSummary,
      tone: "slate",
    });
  }

  if (legacyNeedsRefresh) {
    signalGroups.context.push({
      label: "Refresh Needed",
      detail:
        "Structured standout signals have not been generated yet. Refresh research to update this card.",
      tone: "slate",
    });
  }

  const hasAnySignals = Object.values(signalGroups).some(
    (signals) => signals.length > 0
  );

  return {
    score: cappedScore,
    tier,
    tierLabel,
    confidence: getConfidence(hardEvidenceCount, input),
    badges: visibleBadges,
    reasons: visibleReasons,
    frontFlag,
    signalGroups,
    hasAnySignals,
    evidenceSummary,
    evidenceSources,
  };
}

export function parseProminenceEvidenceSources(
  value?: string | null
): ProminenceEvidenceSource[] {
  if (!value) return [];

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseProminenceEvidenceLine)
    .filter(
      (source): source is ProminenceEvidenceSource => source !== null
    );
}

function applyStoredStandoutSignals(
  stored: StoredStandoutSignals,
  signalGroups: ProminenceSignalGroups,
  badges: ProminenceBadge[],
  reasons: string[]
): {
  score: number;
  hardEvidenceCount: number;
  forceNotable: boolean;
  forceHighValue: boolean;
} {
  let score = 0;
  let hardEvidenceCount = 0;
  let forceNotable = false;
  let forceHighValue = false;

  for (const signal of stored.signals) {
    const displaySignal = storedSignalToDisplaySignal(signal);
    if (!displaySignal) continue;

    if (signal.confidence !== "low") hardEvidenceCount++;
    reasons.push(displaySignal.detail || displaySignal.value || displaySignal.label);

    if (signal.kind === "audience") {
      signalGroups.audience.push(displaySignal);
      const followers = parseCountMetric(signal.value || signal.detail);
      if (followers != null && followers >= 1_000_000) {
        score += 32;
        forceHighValue = true;
        badges.push({ label: "1M+ Audience", tone: "sky" });
      } else if (followers != null && followers >= 500_000) {
        score += 22;
        badges.push({ label: "500K+ Audience", tone: "sky" });
      } else if (followers != null && followers >= 100_000) {
        score += 10;
      }
      continue;
    }

    if (signal.kind === "company" || signal.kind === "public_company") {
      signalGroups.company.push(displaySignal);
      const employees = parseCountMetric(signal.value || signal.detail);
      if (employees != null && employees >= 10_000) {
        score += employees >= 50_000 ? 32 : 22;
        badges.push({
          label: employees >= 50_000 ? "50K+ Employees" : "10K+ Employees",
          tone: "emerald",
        });
      } else {
        score += 6;
      }
      continue;
    }

    if (signal.kind === "revenue") {
      signalGroups.company.push(displaySignal);
      const revenue = parseMoneyMetric(signal.value || signal.detail);
      if (revenue != null && revenue >= 500_000_000) {
        score += revenue >= 1_000_000_000 ? 30 : 22;
        badges.push({
          label: revenue >= 1_000_000_000 ? "$1B+ Revenue" : "$500M+ Revenue",
          tone: "emerald",
        });
      } else {
        score += 6;
      }
      continue;
    }

    if (signal.kind === "role") {
      signalGroups.exceptional.push(displaySignal);
      score += SENIOR_TITLE_PATTERN.test(signal.detail) ? 8 : 4;
      continue;
    }

    if (STRUCTURED_FRONT_KINDS.has(signal.kind)) {
      signalGroups.exceptional.push(displaySignal);
      hardEvidenceCount++;
      score += signal.kind === "unicorn" ? 32 : 20;
      forceNotable = true;
      if (signal.kind === "unicorn") forceHighValue = true;
      badges.push({
        label: displaySignal.label,
        tone: signal.kind === "unicorn" ? "emerald" : "amber",
      });
      continue;
    }

    if (signal.kind === "press") {
      signalGroups.context.push(displaySignal);
      score += 6;
      continue;
    }

    signalGroups.context.push(displaySignal);
  }

  return { score, hardEvidenceCount, forceNotable, forceHighValue };
}

function storedSignalToDisplaySignal(
  signal: StoredStandoutSignal
): ProminenceSignal | null {
  const detail = cleanSignalText(signal.detail, 140);
  if (!detail) return null;

  return {
    label: signal.label,
    value: cleanSignalText(signal.value || null, 40),
    detail,
    tone: getStoredSignalTone(signal),
    frontEligible:
      signal.placement === "front" &&
      Boolean(signal.sourceUrl) &&
      (STRUCTURED_FRONT_KINDS.has(signal.kind) ||
        (signal.kind === "audience" &&
          (parseCountMetric(signal.value || signal.detail) || 0) >= 1_000_000)),
  };
}

function getStoredSignalTone(signal: StoredStandoutSignal): ProminenceBadge["tone"] {
  if (signal.kind === "award" || signal.kind === "speaking" || signal.kind === "wikipedia") {
    return "amber";
  }
  if (signal.kind === "unicorn") return "violet";
  if (signal.kind === "audience") return "sky";
  if (signal.kind === "company" || signal.kind === "revenue" || signal.kind === "public_company") {
    return "emerald";
  }
  return "slate";
}

function signalToEvidenceSource(
  signal: StoredStandoutSignal
): ProminenceEvidenceSource | null {
  if (!signal.sourceUrl) return null;
  const summary = cleanSignalText(signal.detail, 180);
  if (!summary) return null;
  return {
    title: signal.sourceTitle || signal.label || "Source",
    summary,
    url: signal.sourceUrl,
  };
}

export function summarizeProminenceEvidence(
  value?: string | null,
  maxLength = 140
): string | null {
  const source = parseProminenceEvidenceSources(value)[0];
  const text = source?.summary || cleanProminenceText(value || "");
  if (!text) return null;
  return truncateSummary(firstSentence(text), maxLength);
}

function parseProminenceEvidenceLine(
  line: string
): ProminenceEvidenceSource | null {
  const urlMatch = line.match(/\((https?:\/\/[^)]+)\)\s*$/i);
  if (!urlMatch) return null;

  const url = urlMatch[1].trim();
  const withoutUrl = line.slice(0, urlMatch.index).trim();
  const separatorIndex = withoutUrl.indexOf(":");
  const rawTitle =
    separatorIndex >= 0 ? withoutUrl.slice(0, separatorIndex) : "Source";
  const rawSummary =
    separatorIndex >= 0
      ? withoutUrl.slice(separatorIndex + 1)
      : withoutUrl;
  const title = cleanProminenceText(rawTitle) || "Source";
  const summary = cleanProminenceText(rawSummary);

  if (!summary) return null;
  return { title, summary, url };
}

function summarizeSignalDetail(value: string | null): string | null {
  if (!value) return null;
  return truncateSummary(firstSentence(cleanProminenceText(value)), 140);
}

function firstSentence(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const match = clean.match(/^(.+?[.!?])(?:\s|$)/);
  return match?.[1] || clean;
}

function truncateSummary(value: string, maxLength: number): string | null {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function getFrontFlag(
  signalGroups: ProminenceSignalGroups
): ProminenceFrontFlag | null {
  const candidates = [
    ...signalGroups.exceptional,
    ...signalGroups.audience,
    ...signalGroups.company,
  ];
  const signal = candidates.find((candidate) => candidate.frontEligible);
  if (!signal) return null;

  return {
    label: signal.label,
    tone: signal.tone === "violet" ? "violet" : "amber",
    reason: signal.detail || signal.value || signal.label,
  };
}

function hasPrimarySignals(signalGroups: ProminenceSignalGroups): boolean {
  return (
    signalGroups.exceptional.length > 0 ||
    signalGroups.audience.length > 0 ||
    signalGroups.company.length > 0
  );
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
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
      "Unicorn Founder",
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
        "Unicorn Founder",
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

function normalizeStoredStandoutSignal(
  raw: Partial<StoredStandoutSignal> | null | undefined
): StoredStandoutSignal | null {
  if (!raw || typeof raw !== "object") return null;

  const kind = normalizeSignalKind(raw.kind);
  if (!kind) return null;

  const label = cleanSignalText(raw.label || fallbackSignalLabel(kind), 48);
  const detail = cleanSignalText(raw.detail || null, 160);
  if (!label || !detail) return null;

  const confidence =
    raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low"
      ? raw.confidence
      : "medium";
  const rawPlacement = String(raw.placement || "").toLowerCase().trim();
  const placement =
    rawPlacement === "front" || rawPlacement === "top"
      ? "front"
      : rawPlacement === "evidence"
      ? "evidence"
      : "back";

  return {
    kind,
    label,
    value: cleanSignalText(raw.value || null, 40),
    detail,
    confidence,
    sourceTitle: cleanSignalText(raw.sourceTitle || null, 80),
    sourceUrl: isSafeHttpUrl(raw.sourceUrl) ? raw.sourceUrl || null : null,
    placement:
      placement === "front" &&
      !STRUCTURED_FRONT_KINDS.has(kind) &&
      kind !== "audience"
        ? "back"
        : placement,
  };
}

function normalizeSignalKind(value: unknown): StandoutSignalKind | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim().replaceAll("-", "_");
  
  // Direct match
  const allowedKinds: StandoutSignalKind[] = [
    "role", "audience", "company", "revenue", "award", "speaking",
    "wikipedia", "unicorn", "press", "funding", "acquisition",
    "public_company", "context"
  ];
  if (allowedKinds.includes(normalized as StandoutSignalKind)) {
    return normalized as StandoutSignalKind;
  }

  // Robust mapping for common variations returned by Gemini
  if (["prominence", "author", "writer", "filmmaker", "director", "producer", "journalist", "executive", "founder", "co_founder", "leadership", "senior_leadership"].includes(normalized)) {
    return "role";
  }
  if (["social_media", "followers", "subscribers", "audience_size", "audience"].includes(normalized)) {
    return "audience";
  }
  if (["awards", "award_recognition", "recognition", "honors"].includes(normalized)) {
    return "award";
  }
  if (["speaker", "conference", "speaking_engagement"].includes(normalized)) {
    return "speaking";
  }
  if (["wiki"].includes(normalized)) {
    return "wikipedia";
  }
  if (["valuation", "billion_dollar", "unicorn_status"].includes(normalized)) {
    return "unicorn";
  }
  if (["funding_round", "investment"].includes(normalized)) {
    return "funding";
  }
  if (["acquisitions"].includes(normalized)) {
    return "acquisition";
  }
  if (["public", "ipo", "listed_company"].includes(normalized)) {
    return "public_company";
  }

  return "context"; // Fallback to context/evidence instead of returning null and discarding!
}

function fallbackSignalLabel(kind: StandoutSignalKind): string {
  const labels: Record<StandoutSignalKind, string> = {
    role: "Role",
    audience: "Audience",
    company: "Company",
    revenue: "Revenue",
    award: "Major Award",
    speaking: "Major Conference",
    wikipedia: "Wikipedia",
    unicorn: "Unicorn Founder",
    press: "Press",
    funding: "Funding",
    acquisition: "Acquisition",
    public_company: "Public Company",
    context: "Evidence",
  };
  return labels[kind];
}

function cleanSignalText(
  value: string | null | undefined,
  maxLength: number
): string | null {
  if (!value) return null;
  const clean = cleanProminenceText(String(value));
  if (!clean || GENERIC_PROMINENCE_TEXT_PATTERN.test(clean)) return null;
  return truncateSummary(clean, maxLength);
}

function uniqueStoredSignals(signals: StoredStandoutSignal[]): StoredStandoutSignal[] {
  const seen = new Set<string>();
  const unique: StoredStandoutSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.kind}|${signal.label}|${signal.value || ""}|${signal.detail}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(signal);
  }
  return unique;
}

function summarizeStoredSignals(signals: StoredStandoutSignal[]): string | null {
  const frontWorthy = signals.find((signal) => STRUCTURED_FRONT_KINDS.has(signal.kind));
  const role = signals.find((signal) => signal.kind === "role");
  const audience = signals.find((signal) => signal.kind === "audience");
  const company = signals.find(
    (signal) => signal.kind === "company" || signal.kind === "revenue"
  );
  const primary = frontWorthy || role || audience || company || signals[0];
  if (!primary) return null;

  const parts = [primary.detail];
  if (primary !== company && company) parts.push(company.detail);
  if (primary !== audience && audience) parts.push(audience.detail);

  return truncateSummary(parts.filter(Boolean).join(" "), 180);
}

function isSafeHttpUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function compactRoleDetail(input: {
  intervieweeName?: string | null;
  intervieweeCompany?: string | null;
  intervieweeTitle?: string | null;
}): string {
  const person = input.intervieweeName || "Interviewee";
  const title = input.intervieweeTitle || "leader";
  const company = input.intervieweeCompany;
  return company ? `${person} is ${title} at ${company}.` : `${person} is ${title}.`;
}

function addPatternSignal(
  signals: StoredStandoutSignal[],
  results: Array<{ title: string; url: string; snippet: string }>,
  kind: StandoutSignalKind,
  label: string,
  pattern: RegExp
) {
  const result = results.find((candidate) =>
    pattern.test(`${candidate.title} ${candidate.snippet}`)
  );
  if (!result) return;

  const detail = cleanSignalText(extractUsefulSnippet(result.snippet, pattern), 160);
  if (!detail) return;

  signals.push({
    kind,
    label,
    detail,
    confidence: "medium",
    sourceTitle: result.title,
    sourceUrl: result.url,
    placement: STRUCTURED_FRONT_KINDS.has(kind) ? "front" : "back",
  });
}

function extractUsefulSnippet(snippet: string, pattern: RegExp): string {
  const clean = cleanProminenceText(snippet);
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.find((sentence) => pattern.test(sentence)) || clean;
}

function buildStandoutSummary(
  signals: StoredStandoutSignal[],
  input: {
    intervieweeName?: string | null;
    intervieweeCompany?: string | null;
  }
): string | null {
  const primary = signals.find((signal) => signal.kind === "role") || signals[0];
  if (!primary) return null;

  const name = input.intervieweeName || "This interviewee";
  const company = input.intervieweeCompany ? ` at ${input.intervieweeCompany}` : "";
  if (primary.kind === "role") {
    return truncateSummary(`${name} is notable here for ${primary.detail}`, 180);
  }
  if (primary.value) {
    return truncateSummary(`${name}${company}: ${primary.label} (${primary.value}).`, 180);
  }
  return truncateSummary(`${name}${company}: ${primary.detail}`, 180);
}

function summarizeProminenceNotes(value?: string | null): string {
  if (!value) {
    return "Search found press, awards, authorship, speaking, or public-figure signals.";
  }

  const cleanText = cleanProminenceText(value);
  if (!cleanText || GENERIC_PROMINENCE_TEXT_PATTERN.test(cleanText)) {
    return "Search found press, awards, authorship, speaking, or public-figure signals.";
  }

  return cleanText;
}

function cleanProminenceText(value: string): string {
  return value
    .replace(/Gemini grounded research:\s*```json[\s\S]*?```/gi, "")
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/\{[\s\S]*\}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\((?:https?:\/\/|www\.)[^)]+\)/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\*\*/g, "")
    .replace(/#+\s*/g, "")
    .replace(/\b[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/\S*)?:\s*/g, "")
    .replace(/Here are the key prominence signals and facts for .*?:/i, "")
    .replace(/Here are the concise prominence signals for .*?:/i, "")
    .replace(/Here are concise prominence signals for .*?:/i, "")
    .replace(/\bLeadership\s*&\s*Company\s*Prominence\b/gi, "")
    .replace(/\bRole:\s*/gi, "")
    .replace(/(?:^|\s)[*-]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-:;,\s]+/, "");
}
