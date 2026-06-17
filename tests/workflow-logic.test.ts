import assert from "node:assert/strict";
import test from "node:test";
import { getInterviewProgress } from "../src/lib/actions/progress";
import {
  generateLinkedInVariations,
  normalizeLinkedInPostUrl,
} from "../src/lib/linkedin/generator";
import {
  assessInterviewProminence,
  parseCountMetric,
  parseMoneyMetric,
} from "../src/lib/prominence/signals";
import {
  buildProminenceQueries,
  geminiResponseToSearchResults,
  extractProminenceSignals,
  researchInterviewProminence,
  type SearchProvider,
} from "../src/lib/prominence/research";

const contact = {
  intervieweeEmail: "guest@example.com",
  publicistEmail: null,
};

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
});

test("prominence assessment treats million follower audiences as standout", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Ari Lane",
    largestSocialFollowerCount: 1_200_000,
  });

  assert.equal(assessment.tier, "high_value");
  assert.ok(assessment.badges.some((badge) => badge.label === "1M+ Audience"));
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
});

test("prominence assessment treats major award recognition as notable", () => {
  const assessment = assessInterviewProminence({
    intervieweeName: "Robin Vale",
    prominenceNotes:
      "Robin Vale was nominated for an Emmy and later won a Grammy.",
  });

  assert.equal(assessment.tier, "notable");
  assert.ok(assessment.badges.some((badge) => badge.label === "Major Award"));
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
