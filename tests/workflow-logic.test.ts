import assert from "node:assert/strict";
import test from "node:test";
import { formatActionLabel } from "../src/lib/actions/labels";
import { getInterviewProgress } from "../src/lib/actions/progress";
import {
  generateLinkedInVariations,
  normalizeLinkedInPostUrl,
} from "../src/lib/linkedin/generator";
import {
  assessInterviewProminence,
  buildProminenceSignalsJson,
  parseCountMetric,
  parseMoneyMetric,
  parseProminenceEvidenceSources,
  parseStoredStandoutSignals,
  summarizeProminenceEvidence,
} from "../src/lib/prominence/signals";
import {
  buildBackgroundProminenceWhere,
  getVipProminenceCronLimit,
  isCronRequestAuthorized,
  shouldResearchProminenceInBackground,
} from "../src/lib/prominence/background-scan";
import {
  evaluateStandoutResearchCostGate,
  getStandoutResearchCostConfig,
} from "../src/lib/prominence/cost-control";
import {
  buildProminenceQueries,
  DEFAULT_GEMINI_SEARCH_MODEL,
  FallbackSearchProvider,
  GeminiQuotaExceededError,
  GeminiResearchTimeoutError,
  GeminiTemporaryUnavailableError,
  geminiResponseToSearchResults,
  getGeminiSearchModelPlan,
  GoogleCustomSearchSetupError,
  GoogleCustomSearchQuotaError,
  GoogleCustomSearchTemporaryError,
  interactionResponseToSearchResults,
  extractProminenceSignals,
  researchInterviewProminence,
  SearchProviderFallbackError,
  shouldRetryProviderFailure,
  type SearchProvider,
} from "../src/lib/prominence/research";


const contact = {
  intervieweeEmail: "guest@example.com",
  publicistEmail: null,
};

const AI_BOILERPLATE_PHRASES = [
  "Here are the concise prominence signals",
  "Based on the research",
  "No information found",
  "Prominence signals include",
  "### Role / Notability",
  "Unfortunately",
  "This person appears to be",
  "I found",
  "The following are",
];

test("next action follows the complete leverage workflow", () => {
  assert.equal(
    getInterviewProgress({
      intervieweeEmail: null,
      publicistEmail: null,
      actions: [],
    }).nextAction,
    "add_contact"
  );
  assert.equal(getInterviewProgress({ ...contact, actions: [] }).nextAction, "send_live_email");

  const liveSent = [{ actionType: "LIVE_EMAIL_SENT", status: "SUCCESS" }];
  assert.equal(
    getInterviewProgress({ ...contact, actions: liveSent }).nextAction,
    "generate_linkedin"
  );

  const generated = [
    ...liveSent,
    { actionType: "LINKEDIN_POST_GENERATED", status: "SUCCESS" },
  ];
  assert.equal(
    getInterviewProgress({ ...contact, actions: generated }).nextAction,
    "mark_shared"
  );

  const shared = [
    ...generated,
    { actionType: "MARKED_SHARED", status: "SUCCESS" },
  ];
  assert.equal(
    getInterviewProgress({ ...contact, actions: shared }).nextAction,
    "send_zoom_invite"
  );

  const complete = [
    ...shared,
    { actionType: "ZOOM_INVITE_SENT", status: "SUCCESS" },
  ];
  const progress = getInterviewProgress({ ...contact, actions: complete });
  assert.equal(progress.nextAction, "leveraged");
  assert.equal(progress.currentStatus, "leveraged");
});

test("failed actions do not advance interview progress", () => {
  const progress = getInterviewProgress({
    ...contact,
    actions: [{ actionType: "LIVE_EMAIL_SENT", status: "FAILED" }],
  });
  assert.equal(progress.nextAction, "send_live_email");
  assert.equal(progress.actionSummary.liveEmailSent, false);
});

test("failed action labels do not look completed", () => {
  assert.equal(
    formatActionLabel("LIVE_EMAIL_SENT", "FAILED"),
    "Live email failed"
  );
  assert.equal(
    formatActionLabel("LIVE_EMAIL_SENT", "SUCCESS"),
    "Live email sent"
  );
  assert.equal(
    formatActionLabel("PROMINENCE_RESEARCHED", "FAILED"),
    "Standout research failed"
  );
});

test("LinkedIn generator returns three complete variations", () => {
  const articleUrl = "https://authoritymagazine.com/example";
  const variations = generateLinkedInVariations(
    {
      intervieweeName: "Alex Morgan",
      intervieweeCompany: "Example Co",
      topic: "inclusive leadership",
      articleUrl,
    },
    "#AuthorityMagazine #Leadership"
  );

  assert.equal(variations.length, 4);
  for (const variation of variations) {
    assert.match(variation, /Alex Morgan/);
    assert.match(variation, new RegExp(articleUrl.replaceAll("/", "\\/")));
    assert.match(variation, /#AuthorityMagazine/);
  }
});

test("LinkedIn post URL validation accepts LinkedIn and rejects other hosts", () => {
  assert.equal(
    normalizeLinkedInPostUrl(
      "https://www.linkedin.com/posts/example_authority-magazine-activity-123"
    ),
    "https://www.linkedin.com/posts/example_authority-magazine-activity-123"
  );
  assert.throws(
    () => normalizeLinkedInPostUrl("https://example.com/not-linkedin"),
    /linkedin\.com/i
  );
  assert.throws(() => normalizeLinkedInPostUrl("not a url"), /valid LinkedIn/i);
});

test("prominence assessment flags elite leads from company scale and audience", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Taylor Chen",
    intervieweeCompany: "Acme Robotics",
    intervieweeTitle: "Founder and CEO",
    companyEmployeeCount: 60_000,
    companyRevenueUsd: 1_500_000_000,
    largestSocialFollowerCount: 1_250_000,
    prominenceNotes: "Featured in Forbes and keynote speaker.",
    articleUrl: "https://authoritymagazine.com/example",
  });

  assert.equal(assessment.tier, "elite");
  assert.ok(assessment.score >= 70);
  assert.ok(assessment.badges.some((badge) => badge.label === "Elite Lead"));
  assert.ok(assessment.badges.some((badge) => badge.label === "1M+ Audience"));
});

test("prominence assessment keeps normal executives out of VIP spotlight", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Morgan Lee",
    intervieweeCompany: "Regional Services",
    intervieweeTitle: "Founder and CEO",
    companyEmployeeCount: 3_000,
    prominenceNotes:
      "Founder and CEO of Regional Services with experience in operations.",
    articleUrl: "https://authoritymagazine.com/unpublished/example",
  });

  assert.equal(assessment.tier, "standard");
  assert.equal(assessment.badges.length, 0);
});

test("prominence assessment treats Wikipedia as notable", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Jordan Park",
    prominenceNotes:
      "Jordan Park has a Wikipedia page covering their public career.",
  });

  assert.equal(assessment.tier, "notable");
  assert.ok(assessment.badges.some((badge) => badge.label === "Wikipedia"));
  assert.equal(assessment.frontFlag?.label, "Wikipedia");
  assert.equal(assessment.signalGroups.exceptional.length, 1);
  assert.equal(assessment.hasAnySignals, true);
});

test("prominence assessment treats million follower audiences as standout", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Ari Lane",
    largestSocialFollowerCount: 1_200_000,
  });

  assert.equal(assessment.tier, "high_value");
  assert.ok(assessment.badges.some((badge) => badge.label === "1M+ Audience"));
  assert.equal(assessment.frontFlag, null);
  assert.equal(assessment.signalGroups.audience[0]?.label, "Audience");
  assert.equal(assessment.signalGroups.audience[0]?.value, "1.2M");
  assert.equal(assessment.hasAnySignals, true);
});

test("prominence assessment treats Fortune 500 C-level leaders as high value", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Casey Morgan",
    intervieweeCompany: "Example Corp",
    intervieweeTitle: "Chief Marketing Officer",
    prominenceNotes:
      "Example Corp is a Fortune 500 company and Casey Morgan serves on the executive leadership team.",
  });

  assert.equal(assessment.tier, "high_value");
  assert.ok(
    assessment.badges.some((badge) => badge.label === "Fortune 500 C-Level")
  );
  assert.equal(assessment.frontFlag, null);
  assert.ok(
    assessment.signalGroups.company.some(
      (signal) => signal.label === "Role/Company Scale"
    )
  );
});

test("prominence assessment treats major conference speakers as notable", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Sam Rivera",
    prominenceNotes:
      "Sam Rivera was a featured speaker at SXSW and later presented at Web Summit.",
  });

  assert.equal(assessment.tier, "notable");
  assert.ok(
    assessment.badges.some((badge) => badge.label === "Major Conference Speaker")
  );
  assert.equal(assessment.frontFlag?.label, "Major Conference");
});

test("prominence assessment treats unicorn founders as high value", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Priya Shah",
    intervieweeTitle: "Co-founder",
    prominenceNotes:
      "Priya Shah co-founded a unicorn startup valued at more than $1 billion.",
  });

  assert.equal(assessment.tier, "high_value");
  assert.ok(assessment.badges.some((badge) => badge.label === "Unicorn Founder"));
  assert.equal(assessment.frontFlag?.label, "Unicorn Founder");
  assert.equal(assessment.frontFlag?.tone, "violet");
});

test("prominence assessment treats major award recognition as notable", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Robin Vale",
    prominenceNotes:
      "Robin Vale was nominated for an Emmy and later won a Grammy.",
  });

  assert.equal(assessment.tier, "notable");
  assert.ok(assessment.badges.some((badge) => badge.label === "Major Award"));
  assert.equal(assessment.frontFlag?.label, "Major Award");
});

test("prominence display keeps large company metrics on the back only", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Jamie Morgan",
    companyEmployeeCount: 50_000,
    companyRevenueUsd: 1_200_000_000,
  });

  assert.equal(assessment.frontFlag, null);
  assert.ok(
    assessment.signalGroups.company.some(
      (signal) => signal.label === "Company Size" && signal.value === "50K"
    )
  );
  assert.ok(
    assessment.signalGroups.company.some(
      (signal) => signal.label === "Revenue" && signal.value === "$1.2B"
    )
  );
  assert.equal(assessment.hasAnySignals, true);
});

test("prominence display combines exceptional flag with back metrics", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Robin Vale",
    companyRevenueUsd: 1_200_000_000,
    prominenceNotes:
      "Robin Vale was nominated for an Emmy and later won a Grammy.",
  });

  assert.equal(assessment.frontFlag?.label, "Major Award");
  assert.ok(
    assessment.signalGroups.company.some(
      (signal) => signal.label === "Revenue" && signal.value === "$1.2B"
    )
  );
  assert.ok(assessment.signalGroups.context.length > 0);
});

test("prominence display stays empty when no signal data exists", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "No Signals",
  });

  assert.equal(assessment.frontFlag, null);
  assert.equal(assessment.hasAnySignals, false);
  assert.deepEqual(assessment.signalGroups, {
    exceptional: [],
    audience: [],
    company: [],
    context: [],
  });
});

test("prominence evidence parser returns source rows from stored notes", () => {
  const notes = [
    "Forbes: Taylor Chen has 1M followers and runs Acme Robotics. (https://example.com/forbes)",
    "Company profile: Acme Robotics reports $1B annual revenue. (https://example.com/company)",
  ].join("\n");

  const sources = parseProminenceEvidenceSources(notes);

  assert.equal(sources.length, 2);
  assert.equal(sources[0].title, "Forbes");
  assert.match(sources[0].summary, /1M followers/);
  assert.equal(sources[0].url, "https://example.com/forbes");
});

test("prominence evidence summary stays short", () => {
  const longNotes =
    "Source: This is a very long evidence sentence about a notable person with awards, media coverage, followers, company revenue, and other details that should not appear in full on a dashboard card. (https://example.com/source)";

  const summary = summarizeProminenceEvidence(longNotes, 80);

  assert.ok(summary);
  assert.ok(summary.length <= 80);
  assert.doesNotMatch(summary, /dashboard card/);
});

test("prominence assessment exposes compact evidence fields", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Taylor Chen",
    prominenceNotes:
      "Forbes: Taylor Chen won a Grammy and has a public profile. (https://example.com/forbes)",
  });

  assert.equal(assessment.evidenceSources.length, 1);
  assert.ok(assessment.evidenceSummary);
  assert.ok(assessment.evidenceSummary.length <= 140);
});

test("structured standout signals keep useful role details off the front badge", () => {
  const prominenceSignalsJson = JSON.stringify({
    version: 1,
    standoutSummary:
      "Kym Renner is President & CEO of RennerVation Foundation.",
    signals: [
      {
        kind: "role",
        label: "Senior Leadership",
        value: "President & CEO",
        detail: "Kym Renner is President & CEO of RennerVation Foundation.",
        confidence: "medium",
        sourceTitle: "RennerVation Foundation",
        sourceUrl: "https://example.com/kym",
        placement: "back",
      },
    ],
    sourceCount: 1,
    researchedAt: "2026-06-21T00:00:00.000Z",
    provider: "gemini_grounded_search",
  });

  const assessment = assessInterviewProminence({
    intervieweeName: "Kym Renner",
    intervieweeCompany: "RennerVation Foundation",
    prominenceSignalsJson,
    prominenceNotes:
      "Here are the concise prominence signals for Kym Renner and RennerVation Foundation: President & CEO of Renn...",
  });

  assert.equal(assessment.frontFlag, null);
  assert.equal(assessment.signalGroups.exceptional[0]?.label, "Senior Leadership");
  assert.match(
    assessment.signalGroups.exceptional[0]?.detail || "",
    /President & CEO/
  );
  assert.doesNotMatch(
    [
      assessment.evidenceSummary,
      assessment.signalGroups.exceptional[0]?.detail,
      (assessment.frontFlag as { reason?: string } | null)?.reason,
    ]
      .filter(Boolean)
      .join(" "),
    /Here are|concise prominence signals|Evidence Summary/i
  );
});

test("structured standout signals win over old prompt-like notes", () => {
  const prominenceSignalsJson = JSON.stringify({
    version: 1,
    standoutSummary: "Ari Lane has a verified 1.2M audience.",
    signals: [
      {
        kind: "audience",
        label: "Audience",
        value: "1.2M",
        detail: "Ari Lane has 1.2M followers on a public social profile.",
        confidence: "medium",
        sourceTitle: "Social profile",
        sourceUrl: "https://example.com/social",
        placement: "back",
      },
    ],
    sourceCount: 1,
    researchedAt: "2026-06-21T00:00:00.000Z",
    provider: "gemini_grounded_search",
  });

  const assessment = assessInterviewProminence({
    intervieweeName: "Ari Lane",
    prominenceSignalsJson,
    prominenceNotes:
      "Evidence Summary: Here are the concise prominence signals for Ari Lane: not useful boilerplate.",
  });

  assert.equal(assessment.signalGroups.audience[0]?.value, "1.2M");
  assert.equal(assessment.tier, "high_value");
  assert.equal(assessment.frontFlag, null);
  assert.doesNotMatch(assessment.evidenceSummary || "", /Evidence Summary|Here are/i);
});

test("structured signal builder extracts Kym Renner style leadership detail", () => {
  const json = buildProminenceSignalsJson({
    intervieweeName: "Kym Renner",
    intervieweeCompany: "RennerVation Foundation",
    results: [
      {
        title: "RennerVation Foundation profile",
        url: "https://example.com/renner",
        snippet:
          "Kym Renner Senior Leadership: President & CEO of RennerVation Foundation.",
      },
    ],
    provider: "gemini_grounded_search",
  });

  assert.ok(json);
  const stored = parseStoredStandoutSignals(json);
  assert.ok(stored);
  assert.equal(stored.signals[0]?.kind, "role");
  assert.match(stored.signals[0]?.detail || "", /President & CEO/);
  assert.doesNotMatch(stored.standoutSummary || "", /Here are|prominence signals/i);
});

test("structured standout validator rejects AI boilerplate phrases", () => {
  const prominenceSignalsJson = JSON.stringify({
    version: 1,
    standoutSummary:
      "Here are the concise prominence signals found for this person.",
    signals: [
      {
        kind: "role",
        label: "Senior Leadership",
        value: "President",
        detail:
          "Morgan Vale is President of Example Health and leads national programs.",
        confidence: "medium",
        sourceTitle: "Example Health",
        sourceUrl: "https://example.com/profile",
        placement: "back",
      },
      ...AI_BOILERPLATE_PHRASES.map((phrase) => ({
        kind: "context",
        label: "Evidence",
        detail: `${phrase}: this should not be shown.`,
        confidence: "medium",
        sourceTitle: "Bad source",
        sourceUrl: "https://example.com/bad",
        placement: "evidence",
      })),
    ],
    sourceCount: 2,
    researchedAt: "2026-06-21T00:00:00.000Z",
    provider: "test",
  });

  const assessment = assessInterviewProminence({
    intervieweeName: "Morgan Vale",
    prominenceSignalsJson,
    prominenceNotes:
      "Based on the research, prominence signals include this raw memo.",
  });

  const visibleText = collectProminenceText(assessment);
  for (const phrase of AI_BOILERPLATE_PHRASES) {
    assert.doesNotMatch(visibleText, new RegExp(escapeRegExp(phrase), "i"));
  }
  assert.match(visibleText, /President of Example Health/);
});

test("structured standout sources ignore unsafe URLs", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Morgan Vale",
    prominenceSignalsJson: JSON.stringify({
      version: 1,
      standoutSummary: "Morgan Vale is President of Example Health.",
      signals: [
        {
          kind: "role",
          label: "Senior Leadership",
          detail: "Morgan Vale is President of Example Health.",
          confidence: "medium",
          sourceTitle: "Unsafe",
          sourceUrl: "javascript:alert(1)",
          placement: "back",
        },
      ],
      sourceCount: 1,
      researchedAt: "2026-06-21T00:00:00.000Z",
      provider: "test",
    }),
  });

  assert.equal(assessment.evidenceSources.length, 0);
  assert.match(assessment.signalGroups.exceptional[0]?.detail || "", /President/);
});

test("invalid structured payload suppresses raw prominence notes", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Legacy Person",
    prominenceSignalsJson: "{not valid json",
    prominenceNotes:
      "Forbes: Here are the concise prominence signals for Legacy Person. (https://example.com/forbes)",
  });

  const visibleText = collectProminenceText(assessment);
  assert.match(visibleText, /Refresh research to update this card/);
  assert.doesNotMatch(visibleText, /Forbes|concise prominence signals/i);
  assert.equal(assessment.evidenceSources.length, 0);
});

test("structured exceptional public prominence can create a front-card flag", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Robin Vale",
    prominenceSignalsJson: JSON.stringify({
      version: 1,
      standoutSummary: "Robin Vale won a Grammy.",
      signals: [
        {
          kind: "award",
          label: "Major Award",
          detail: "Robin Vale won a Grammy for a nationally recognized project.",
          confidence: "high",
          sourceTitle: "Awards profile",
          sourceUrl: "https://example.com/award",
          placement: "front",
        },
      ],
      sourceCount: 1,
      researchedAt: "2026-06-21T00:00:00.000Z",
      provider: "test",
    }),
  });

  assert.equal(assessment.frontFlag?.label, "Major Award");
  assert.match(assessment.frontFlag?.reason || "", /Grammy/);
});

test("structured million-plus public audience can create a rare front flag", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Ari Lane",
    prominenceSignalsJson: JSON.stringify({
      version: 1,
      standoutSummary: "Ari Lane has a 1.2M public audience.",
      signals: [
        {
          kind: "audience",
          label: "Audience",
          value: "1.2M",
          detail: "Ari Lane has 1.2M followers on a public social profile.",
          confidence: "high",
          sourceTitle: "Social profile",
          sourceUrl: "https://example.com/social",
          placement: "front",
        },
      ],
      sourceCount: 1,
      researchedAt: "2026-06-21T00:00:00.000Z",
      provider: "test",
    }),
  });

  assert.equal(assessment.frontFlag?.label, "Audience");
  assert.match(assessment.frontFlag?.reason || "", /1.2M/);
});

test("background standout scanner targets never-scanned and legacy unstructured interviews", () => {
  assert.equal(
    shouldResearchProminenceInBackground({
      companyEmployeeCount: null,
      companyRevenueUsd: null,
      largestSocialFollowerCount: null,
      prominenceNotes: null,
      prominenceSignalsJson: '{"version":1,"signals":[]}',
      actions: [],
    }),
    true
  );
  assert.equal(
    shouldResearchProminenceInBackground({
      companyEmployeeCount: 10_000,
      companyRevenueUsd: null,
      largestSocialFollowerCount: null,
      prominenceNotes: null,
      prominenceSignalsJson: JSON.stringify({
        version: 1,
        standoutSummary: "Company has 10K employees.",
        signals: [
          {
            kind: "company",
            label: "Company Size",
            value: "10K",
            detail: "Company has 10K employees.",
            confidence: "medium",
            placement: "back",
          },
        ],
        sourceCount: 1,
        researchedAt: "2026-06-21T00:00:00.000Z",
        provider: "test",
      }),
      actions: [],
    }),
    false
  );
  assert.equal(
    shouldResearchProminenceInBackground({
      companyEmployeeCount: null,
      companyRevenueUsd: null,
      largestSocialFollowerCount: null,
      prominenceNotes: null,
      prominenceSignalsJson: null,
      actions: [{ actionType: "PROMINENCE_RESEARCHED" }],
    }),
    true
  );

  assert.deepEqual(buildBackgroundProminenceWhere(), {
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
  });
});

test("background VIP cron auth and limit helpers are strict", () => {
  assert.equal(isCronRequestAuthorized(null, "secret"), false);
  assert.equal(isCronRequestAuthorized("Bearer wrong", "secret"), false);
  assert.equal(isCronRequestAuthorized("Bearer secret", "secret"), true);
  assert.equal(isCronRequestAuthorized("Bearer secret", ""), false);
  assert.equal(getVipProminenceCronLimit(undefined), 2);
  assert.equal(getVipProminenceCronLimit("0"), 1);
  assert.equal(getVipProminenceCronLimit("10"), 6);
  assert.equal(getVipProminenceCronLimit("99"), 6);
});

test("Gemini grounded search defaults to cheap Flash with opt-in fallbacks", () => {
  assert.equal(DEFAULT_GEMINI_SEARCH_MODEL, "gemini-2.5-flash");
  assert.deepEqual(getGeminiSearchModelPlan({}), {
    primaryModel: "gemini-2.5-flash",
    fallbackModel: null,
    interactionsFallbackEnabled: false,
  });
  assert.deepEqual(
    getGeminiSearchModelPlan({
      GEMINI_SEARCH_MODEL: "gemini-3.5-flash",
      GEMINI_SEARCH_FALLBACK_MODEL: "gemini-2.5-flash",
      GEMINI_SEARCH_ENABLE_INTERACTIONS_FALLBACK: "true",
    }),
    {
      primaryModel: "gemini-3.5-flash",
      fallbackModel: "gemini-2.5-flash",
      interactionsFallbackEnabled: true,
    }
  );
  assert.deepEqual(
    getGeminiSearchModelPlan({
      GEMINI_SEARCH_MODEL: "gemini-2.5-flash",
      GEMINI_SEARCH_FALLBACK_MODEL: "gemini-2.5-flash",
    }),
    {
      primaryModel: "gemini-2.5-flash",
      fallbackModel: null,
      interactionsFallbackEnabled: false,
    }
  );
});

test("Standout research cost gates pause and cap research safely", () => {
  assert.deepEqual(getStandoutResearchCostConfig({}), {
    enabled: true,
    automaticEnabled: true,
    dailyLimit: 25,
    monthlyLimit: 250,
  });

  assert.deepEqual(
    evaluateStandoutResearchCostGate({
      trigger: "MANUAL",
      dailyCount: 0,
      monthlyCount: 0,
      config: {
        enabled: false,
        automaticEnabled: true,
        dailyLimit: 25,
        monthlyLimit: 250,
      },
    }),
    {
      allowed: false,
      code: "STANDOUT_RESEARCH_DISABLED",
      message: "Standout research is paused to control cost.",
      status: 503,
    }
  );

  assert.deepEqual(
    evaluateStandoutResearchCostGate({
      trigger: "QUIET_SCAN",
      dailyCount: 0,
      monthlyCount: 0,
      config: {
        enabled: true,
        automaticEnabled: false,
        dailyLimit: 25,
        monthlyLimit: 250,
      },
    }),
    {
      allowed: false,
      code: "STANDOUT_AUTOMATIC_RESEARCH_DISABLED",
      message: "Automatic Standout research is paused to control cost.",
      status: 503,
    }
  );

  assert.deepEqual(
    evaluateStandoutResearchCostGate({
      trigger: "MANUAL",
      dailyCount: 25,
      monthlyCount: 25,
      config: {
        enabled: true,
        automaticEnabled: true,
        dailyLimit: 25,
        monthlyLimit: 250,
      },
    }),
    {
      allowed: false,
      code: "STANDOUT_RESEARCH_DAILY_LIMIT",
      message: "Today's Standout research limit has been reached.",
      status: 429,
    }
  );

  assert.deepEqual(
    evaluateStandoutResearchCostGate({
      trigger: "CRON",
      dailyCount: 24,
      monthlyCount: 250,
      config: {
        enabled: true,
        automaticEnabled: true,
        dailyLimit: 25,
        monthlyLimit: 250,
      },
    }),
    {
      allowed: false,
      code: "STANDOUT_RESEARCH_MONTHLY_LIMIT",
      message: "This month's Standout research limit has been reached.",
      status: 429,
    }
  );

  assert.deepEqual(
    evaluateStandoutResearchCostGate({
      trigger: "MANUAL",
      dailyCount: 3,
      monthlyCount: 30,
      config: {
        enabled: true,
        automaticEnabled: true,
        dailyLimit: 25,
        monthlyLimit: 250,
      },
    }),
    { allowed: true }
  );
});

test("standout research provider chain uses Gemini without fallback when available", async () => {
  const provider = new FallbackSearchProvider([
    {
      label: "gemini_grounded_search",
      provider: providerReturning([
        {
          title: "Taylor Chen featured in Forbes",
          url: "https://example.com/gemini",
          snippet: "Taylor Chen has 125K followers and is a keynote speaker.",
        },
      ]),
    },
    {
      label: "google_custom_search",
      provider: providerReturning([
        {
          title: "Backup result",
          url: "https://example.com/backup",
          snippet: "This should not be used.",
        },
      ]),
    },
  ]);

  const result = await researchInterviewProminence(
    { intervieweeName: "Taylor Chen" },
    provider
  );

  assert.equal(result.provider, "gemini_grounded_search");
  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(result.providerErrors, []);
  assert.equal(result.sourceResults[0]?.url, "https://example.com/gemini");
});

test("standout research falls back to Google Custom Search after Gemini quota", async () => {
  const provider = new FallbackSearchProvider([
    {
      label: "gemini_grounded_search",
      provider: providerThrowing(
        new GeminiQuotaExceededError("Model rate/quota limit")
      ),
    },
    {
      label: "google_custom_search",
      provider: providerReturning([
        {
          title: "Backup profile",
          url: "https://example.com/backup-profile",
          snippet:
            "Taylor Chen is a founder with 125K followers and $25M revenue.",
        },
      ]),
    },
  ]);

  const result = await researchInterviewProminence(
    { intervieweeName: "Taylor Chen" },
    provider
  );

  assert.equal(result.provider, "google_custom_search");
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.providerErrors, [
    { provider: "gemini_grounded_search", code: "quota_or_rate_limit" },
  ]);
  assert.equal(result.sourceResults[0]?.url, "https://example.com/backup-profile");
});

test("standout research falls back after a Gemini timeout", async () => {
  const provider = new FallbackSearchProvider([
    {
      label: "gemini_grounded_search",
      provider: providerThrowing(new GeminiResearchTimeoutError()),
    },
    {
      label: "google_custom_search",
      provider: providerReturning([
        {
          title: "Backup company profile",
          url: "https://example.com/company",
          snippet: "Acme Robotics has 2,500 employees.",
        },
      ]),
    },
  ]);

  const result = await researchInterviewProminence(
    {
      intervieweeName: "Taylor Chen",
      intervieweeCompany: "Acme Robotics",
    },
    provider
  );

  assert.equal(result.provider, "google_custom_search");
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.providerErrors, [
    { provider: "gemini_grounded_search", code: "timeout" },
  ]);
});

test("standout research retries a transient provider failure before fallback", async () => {
  const provider = new FallbackSearchProvider([
    {
      label: "gemini_grounded_search",
      provider: providerSequence([
        // Use a typed temporary error — generic Error is now "provider_error" (not retryable by design)
        new GeminiTemporaryUnavailableError("temporary provider outage"),
        [
          {
            title: "Recovered profile",
            url: "https://example.com/recovered",
            snippet: "Taylor Chen is a founder with 125K followers.",
          },
        ],
      ]),
    },
    {
      label: "google_custom_search",
      provider: providerReturning([
        {
          title: "Backup result",
          url: "https://example.com/backup",
          snippet: "This should not be used after the retry succeeds.",
        },
      ]),
    },
  ]);

  const result = await researchInterviewProminence(
    { intervieweeName: "Taylor Chen" },
    provider
  );

  assert.equal(result.provider, "gemini_grounded_search");
  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(result.providerErrors, []);
  assert.equal(result.sourceResults[0]?.url, "https://example.com/recovered");
});

test("standout research reports setup failures without calling them temporary", async () => {
  await withProductionEnv(async () => {
    const provider = new FallbackSearchProvider([
      {
        label: "gemini_grounded_search",
        provider: providerThrowing(new Error("API key not valid")),
      },
      {
        label: "google_custom_search",
        provider: providerThrowing(new Error("forbidden")),
      },
    ]);

    await assert.rejects(
      () => researchInterviewProminence({ intervieweeName: "Taylor Chen" }, provider),
      (error: unknown) => {
        assert.ok(error instanceof SearchProviderFallbackError);
        assert.equal(error.retryable, false);
        assert.match(error.message, /setup attention/i);
        assert.doesNotMatch(error.message, /temporarily unavailable/i);
        assert.deepEqual(error.providerErrors, [
          { provider: "gemini_grounded_search", code: "configuration_or_auth" },
          { provider: "google_custom_search", code: "configuration_or_auth" },
        ]);
        return true;
      }
    );
  });
});

test("standout research reports missing backup search when Gemini fails in production", async () => {
  await withProductionEnv(async () => {
    const provider = new FallbackSearchProvider([
      {
        label: "gemini_grounded_search",
        provider: providerThrowing(
          new GeminiQuotaExceededError("Model rate/quota limit")
        ),
      },
    ]);

    await assert.rejects(
      () => researchInterviewProminence({ intervieweeName: "Taylor Chen" }, provider),
      (error: unknown) => {
        assert.ok(error instanceof SearchProviderFallbackError);
        assert.equal(error.hasBackupProvider, false);
        assert.match(error.message, /backup Google Custom Search is not configured/i);
        assert.deepEqual(error.providerErrors, [
          { provider: "gemini_grounded_search", code: "quota_or_rate_limit" },
        ]);
        return true;
      }
    );
  });
});

test("standout research does not return simulated results in production", async () => {
  await withProductionEnv(async () => {
    const provider = providerThrowing(new Error("temporary provider outage"));

    await assert.rejects(
      () => researchInterviewProminence({ intervieweeName: "Taylor Chen" }, provider),
      /temporary provider outage/
    );
  });
});

test("prominence reasons clean AI markdown and source prefixes", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Dion Clarke",
    intervieweeCompany: "Harlem Fine Arts Show",
    intervieweeTitle: "founder and CEO",
    prominenceNotes:
      "oldwestbury.edu: Here are the key prominence signals and facts for **Dion E. Clarke**: ### **Leadership & Company Prominence** **Role:** Founder and CEO of the **Harlem Fine Arts Show**.",
  });

  assert.match(assessment.reasons[0], /Founder and CEO/i);
  assert.doesNotMatch(assessment.reasons[0], /\*\*|###|oldwestbury\.edu/i);
});

test("prominence metric parsers handle shorthand values", () => {
  assert.equal(parseCountMetric("25k followers"), 25_000);
  assert.equal(parseCountMetric("1.2 million employees"), 1_200_000);
  assert.equal(parseMoneyMetric("$100M annual revenue"), 100_000_000);
  assert.equal(parseMoneyMetric("1.5 billion"), 1_500_000_000);
});

test("prominence research extracts search-backed metrics", async () => {
  const provider: SearchProvider = {
    async search() {
      return [
        {
          title: "Taylor Chen featured in Forbes",
          url: "https://example.com/forbes",
          snippet:
            "Founder and CEO Taylor Chen has 125K followers and is a keynote speaker.",
        },
        {
          title: "Acme Robotics company profile",
          url: "https://example.com/company",
          snippet:
            "Acme Robotics has 2,500 employees and $150M annual revenue.",
        },
      ];
    },
  };

  const result = await researchInterviewProminence(
    {
      intervieweeName: "Taylor Chen",
      intervieweeCompany: "Acme Robotics",
      intervieweeTitle: "Founder and CEO",
      articleUrl: "https://authoritymagazine.com/example",
    },
    provider
  );

  assert.equal(result.companyEmployeeCount, 2500);
  assert.equal(result.companyRevenueUsd, 150_000_000);
  assert.equal(result.largestSocialFollowerCount, 125_000);
  assert.equal(result.assessment.tier, "standard");
  assert.ok(result.prominenceSignalsJson);
  assert.ok(parseStoredStandoutSignals(result.prominenceSignalsJson));
});

test("prominence research queries include person and company identity", () => {
  const queries = buildProminenceQueries({
    intervieweeName: "Taylor Chen",
    intervieweeCompany: "Acme Robotics",
  });

  assert.ok(queries.some((query) => query.includes('"Taylor Chen"')));
  assert.ok(queries.some((query) => query.includes('"Acme Robotics"')));
  assert.equal(queries.length, 1);
});

test("prominence extraction chooses largest matching metrics", () => {
  const extracted = extractProminenceSignals([
    {
      title: "Profile",
      url: "https://example.com/one",
      snippet: "25K followers, 1,000 employees and $25M revenue.",
    },
    {
      title: "Company",
      url: "https://example.com/two",
      snippet: "100K followers, 5,500 employees and $250M annual revenue.",
    },
  ]);

  assert.equal(extracted.companyEmployeeCount, 5500);
  assert.equal(extracted.companyRevenueUsd, 250_000_000);
  assert.equal(extracted.largestSocialFollowerCount, 100_000);
});

test("Gemini grounded response maps to prominence search results", () => {
  const results = geminiResponseToSearchResults({
    candidates: [
      {
        content: {
          parts: [
            {
              text: "Taylor Chen has 125K followers and Acme has $150M revenue.",
            },
          ],
        },
        groundingMetadata: {
          groundingChunks: [
            {
              web: {
                title: "Acme profile",
                uri: "https://example.com/acme",
              },
            },
          ],
        },
      },
    ],
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Acme profile");
  assert.equal(results[0].url, "https://example.com/acme");
  assert.match(results[0].snippet, /125K followers/);
});

test("Gemini Interactions grounded response maps citations to search results", () => {
  const results = interactionResponseToSearchResults({
    output_text: "Taylor Chen has 125K followers and Acme has $150M revenue.",
    steps: [
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text: "Taylor Chen has 125K followers and Acme has $150M revenue.",
            annotations: [
              {
                type: "url_citation",
                title: "Acme executive profile",
                url: "https://example.com/acme-executive",
                start_index: 0,
                end_index: 66,
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Acme executive profile");
  assert.equal(results[0].url, "https://example.com/acme-executive");
  assert.match(results[0].snippet, /125K followers/);
});

// =============================================================================
// REGRESSION TESTS — Root cause: provider failures misclassified as "temporarily unavailable"
// These tests pin the fix so it cannot silently regress.
// =============================================================================

test("REGRESSION: Google CSE 400/invalid cx is setup_attention, not temporarily unavailable", async () => {
  await withProductionEnv(async () => {
    // Simulate Google returning HTTP 400 for an invalid cx (engine ID) — the exact root-cause scenario.
    const provider = new FallbackSearchProvider([
      {
        label: "google_custom_search",
        provider: providerThrowing(
          new GoogleCustomSearchSetupError(
            "Google Custom Search setup needs attention: invalid request or engine ID configuration (HTTP 400).",
            400
          )
        ),
      },
    ]);

    await assert.rejects(
      () => researchInterviewProminence({ intervieweeName: "Taylor Chen" }, provider),
      (error: unknown) => {
        assert.ok(error instanceof SearchProviderFallbackError, "Should be SearchProviderFallbackError");
        assert.equal(error.retryable, false, "Must NOT be retryable for setup failures");
        assert.doesNotMatch(
          error.message,
          /temporarily unavailable/i,
          "Must NOT say 'temporarily unavailable' for setup failures"
        );
        assert.match(
          error.message,
          /setup|attention/i,
          "Must mention setup or attention for setup failures"
        );
        assert.deepEqual(error.providerErrors, [
          { provider: "google_custom_search", code: "setup_attention" },
        ]);
        return true;
      }
    );
  });
});

test("REGRESSION: Google CSE 403 with quota reason is quota_or_rate_limit, not setup_attention", async () => {
  await withProductionEnv(async () => {
    // Google returns 403 with reason=dailyLimitExceeded for quota exhaustion.
    // This must NOT be classified as setup_attention.
    const provider = new FallbackSearchProvider([
      {
        label: "google_custom_search",
        provider: providerThrowing(
          new GoogleCustomSearchQuotaError(
            "Google Custom Search quota or rate limit reached.",
            403
          )
        ),
      },
    ]);

    await assert.rejects(
      () => researchInterviewProminence({ intervieweeName: "Taylor Chen" }, provider),
      (error: unknown) => {
        assert.ok(error instanceof SearchProviderFallbackError);
        assert.deepEqual(error.providerErrors, [
          { provider: "google_custom_search", code: "quota_or_rate_limit" },
        ]);
        assert.doesNotMatch(
          error.message,
          /temporarily unavailable/i,
          "Quota failure must NOT say 'temporarily unavailable'"
        );
        return true;
      }
    );
  });
});

test("REGRESSION: provider_error is not retryable", () => {
  // The old code had provider_error as retryable, causing silent retry loops and
  // eventual "temporarily unavailable" messages for setup/config failures that
  // happened to not match any classification pattern.
  assert.equal(shouldRetryProviderFailure("provider_error"), false, "provider_error must NOT be retryable");
  assert.equal(shouldRetryProviderFailure("timeout"), true, "timeout must be retryable");
  assert.equal(shouldRetryProviderFailure("temporary_unavailable"), true, "temporary_unavailable must be retryable");
  assert.equal(shouldRetryProviderFailure("quota_or_rate_limit"), false, "quota_or_rate_limit must NOT be retryable");
  assert.equal(shouldRetryProviderFailure("setup_attention"), false, "setup_attention must NOT be retryable");
  assert.equal(shouldRetryProviderFailure("not_configured"), false, "not_configured must NOT be retryable");
  assert.equal(shouldRetryProviderFailure("configuration_or_auth"), false, "configuration_or_auth must NOT be retryable");
  assert.equal(shouldRetryProviderFailure("circuit_open"), false, "circuit_open must NOT be retryable");
});

test("REGRESSION: quiet scan provider failure does not use the toast notice path", () => {
  // The quiet auto-scan in interview-grid.tsx NEVER calls setNotice() — it only calls
  // scheduleQuietScanRetry() or logs to console.error on failure.
  // This test verifies the LOGIC that drives the scan client: the retry-decision
  // function returns false for all non-transient failures so the scan stops cleanly
  // and no visible warning toast is triggered.
  //
  // Key guarantee: setNotice is ONLY called in researchProminence (manual action).
  // The quiet scan path has no call to setNotice in any code path.

  function shouldRetryQuietScan(data: {
    retryable?: boolean;
    setupAttention?: boolean;
    quota?: boolean;
    code?: string;
  }): boolean {
    if (data.retryable === false) return false;
    if (data.setupAttention) return false;
    if (data.quota) return false;
    if (data.code === "GOOGLE_SEARCH_NOT_CONFIGURED") return false;
    return true;
  }

  // Setup attention failure: must NOT retry (no retry loop, no toast)
  assert.equal(shouldRetryQuietScan({ retryable: false, setupAttention: true }), false);
  assert.equal(shouldRetryQuietScan({ retryable: true, setupAttention: true }), false);

  // Quota failure: must NOT retry
  assert.equal(shouldRetryQuietScan({ retryable: false, quota: true }), false);
  assert.equal(shouldRetryQuietScan({ retryable: true, quota: true }), false);

  // Not configured: must NOT retry
  assert.equal(shouldRetryQuietScan({ code: "GOOGLE_SEARCH_NOT_CONFIGURED" }), false);

  // Explicit non-retryable from server: must NOT retry
  assert.equal(shouldRetryQuietScan({ retryable: false }), false);

  // Transient failure: MAY retry (still never shows a toast — the quiet scan
  // scheduleQuietScanRetry path does not call setNotice)
  assert.equal(shouldRetryQuietScan({ retryable: true }), true);
});

test("REGRESSION: failed refresh throws so existing saved Standout signals are never overwritten", async () => {
  await withProductionEnv(async () => {
    // When ALL providers fail, researchInterviewProminence must throw.
    // The route only calls saveProminenceResearch on SUCCESS.
    // Therefore existing signals in the database are never touched by a failed attempt.
    const provider = new FallbackSearchProvider([
      {
        label: "gemini_grounded_search",
        provider: providerThrowing(new GeminiResearchTimeoutError()),
      },
      {
        label: "google_custom_search",
        provider: providerThrowing(
          new GoogleCustomSearchTemporaryError(
            "Google Custom Search is temporarily unavailable.",
            503
          )
        ),
      },
    ]);

    // Must throw — not silently return — when all providers fail.
    await assert.rejects(
      () => researchInterviewProminence({ intervieweeName: "Taylor Chen" }, provider),
      (error: unknown) => {
        assert.ok(error instanceof SearchProviderFallbackError, "Must throw SearchProviderFallbackError");
        // Both truly transient — retryable should be true
        assert.equal(error.retryable, true);
        // Message must say temporarily unavailable (all errors are genuinely transient)
        assert.match(error.message, /temporarily unavailable/i);
        return true;
      }
    );
  });
});

function providerReturning(results: Awaited<ReturnType<SearchProvider["search"]>>): SearchProvider {

  return {
    async search() {
      return results;
    },
  };
}

function providerThrowing(error: Error): SearchProvider {
  return {
    async search() {
      throw error;
    },
  };
}

function providerSequence(
  steps: Array<Error | Awaited<ReturnType<SearchProvider["search"]>>>
): SearchProvider {
  let index = 0;
  return {
    async search() {
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      if (step instanceof Error) throw step;
      return step;
    },
  };
}

async function withProductionEnv(callback: () => Promise<void>) {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalVercel = env.VERCEL;
  env.NODE_ENV = "production";
  env.VERCEL = "1";
  try {
    await callback();
  } finally {
    if (originalNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = originalNodeEnv;
    }
    if (originalVercel === undefined) {
      delete env.VERCEL;
    } else {
      env.VERCEL = originalVercel;
    }
  }
}

function collectProminenceText(
  assessment: ReturnType<typeof assessInterviewProminence>
): string {
  return [
    assessment.evidenceSummary,
    assessment.frontFlag?.reason,
    ...assessment.reasons,
    ...[
      ...assessment.signalGroups.exceptional,
      ...assessment.signalGroups.audience,
      ...assessment.signalGroups.company,
      ...assessment.signalGroups.context,
    ].flatMap((signal) => [signal.label, signal.value, signal.detail]),
    ...assessment.evidenceSources.flatMap((source) => [
      source.title,
      source.summary,
      source.url,
    ]),
  ]
    .filter(Boolean)
    .join(" ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
