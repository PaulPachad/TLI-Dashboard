// ==============================================================================
// Standout/VIP Prominence Research Module
// ==============================================================================
// SECURITY WARNING:
// Disabling TLS verification (setting NODE_TLS_REJECT_UNAUTHORIZED = '0') is 
// highly insecure, disables HTTPS validation globally for the entire Node process,
// and is STRONGLY DISCOURAGED in production.
//
// For local environments behind corporate proxies/firewalls that intercept SSL,
// prefer safer methods such as:
//   1. Installing the corporate root certificate properly in Node.
//   2. Using the NODE_EXTRA_CA_CERTS environment variable pointing to the certificate.
//   3. Using Node's built-in system CA support (where available).
//
// If you absolutely must bypass TLS validation locally, set:
//   ALLOW_INSECURE_LOCAL_TLS_FOR_GEMINI=true
// ==============================================================================

if (
  process.env.NODE_ENV === "development" &&
  !process.env.VERCEL &&
  process.env.ALLOW_INSECURE_LOCAL_TLS_FOR_GEMINI === "true"
) {
  console.warn(
    "\x1b[33m%s\x1b[0m",
    "⚠️ WARNING: ALLOW_INSECURE_LOCAL_TLS_FOR_GEMINI is enabled. " +
      "Globally disabling TLS/HTTPS certificate verification for the entire Node process. " +
      "THIS IS NOT PRODUCTION SAFE."
  );
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import {
  assessInterviewProminence,
  buildProminenceSignalsJson,
  parseCountMetric,
  parseMoneyMetric,
} from "./signals";

interface ResearchInterview {
  intervieweeName: string;
  intervieweeCompany?: string | null;
  intervieweeTitle?: string | null;
  topic?: string | null;
  articleUrl?: string | null;
  buzzfeedUrl?: string | null;
  interviewDocUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  search(query: string): Promise<SearchResult[]>;
}

export interface ProminenceResearchResult {
  companyEmployeeCount: number | null;
  companyRevenueUsd: number | null;
  largestSocialFollowerCount: number | null;
  prominenceNotes: string | null;
  prominenceSignalsJson: string | null;
  sourceResults: SearchResult[];
  assessment: ReturnType<typeof assessInterviewProminence>;
}

export const GOOGLE_SEARCH_NOT_CONFIGURED_CODE = "GOOGLE_SEARCH_NOT_CONFIGURED";
const SEARCH_NOT_CONFIGURED_MESSAGE =
  "Standout research search is not configured. Add GEMINI_API_KEY to this deployment, or add GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID.";

export class GoogleSearchConfigError extends Error {
  code = GOOGLE_SEARCH_NOT_CONFIGURED_CODE;

  constructor() {
    super(SEARCH_NOT_CONFIGURED_MESSAGE);
  }
}

const PROMINENCE_SIGNAL_PATTERN =
  /\b(forbes|fortune|inc\.?|entrepreneur|fast company|nyt|new york times|wsj|wall street journal|bloomberg|cnbc|tedx?|keynote|speaker|author|bestseller|best-selling|award|winner|honoree|founder|ceo|president|wikipedia|verified|followers|subscribers|employees|revenue|funding|raised|acquired|public company|fortune 500)\b/i;

export class GeminiGroundedSearchProvider implements SearchProvider {
  constructor(
    private readonly apiKey = getFirstEnvValue([
      "GEMINI_API_KEY",
      "GOOGLE_GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "NEXT_PUBLIC_GEMINI_API_KEY",
    ]),
    private readonly model =
      getFirstEnvValue(["GEMINI_SEARCH_MODEL"]) || "gemini-3.5-flash"
  ) {}

  async search(query: string): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new GoogleSearchConfigError();
    }

    // Attempt the primary model first, and dynamically fall back to gemini-2.5-flash
    // (or gemini-3.5-flash if 2.5 was primary) if the request fails due to rate limits/quotas.
    const primaryModel = this.model;
    const fallbackModel = primaryModel === "gemini-3.5-flash" ? "gemini-2.5-flash" : "gemini-3.5-flash";
    const modelsToTry = [primaryModel, fallbackModel];

    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text:
                        "Research this person or company for VIP/prospect prominence signals. " +
                        "Return compact facts, not a memo or intro. Prefer JSON with: " +
                        "standoutSummary and signals containing kind, label, value, detail, confidence, sourceTitle, sourceUrl, placement. " +
                        "Look for employee count, annual revenue, social followers/subscribers, press, awards, author/speaker signals, " +
                        `senior leadership, funding, acquisitions, or public-company status: ${query}`,
                    },
                  ],
                },
              ],
              tools: [{ google_search: {} }],
            }),
          }
        );

        const data = await response.json();
        if (!response.ok) {
          const message = data?.error?.message || "Gemini grounded search failed.";
          throw new Error(`Model ${model} failed: ${message}`);
        }

        return geminiResponseToSearchResults(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        lastError = err instanceof Error ? err : new Error(message);
        console.warn(`Gemini grounded search failed for model ${model}, trying next... Error:`, message);
      }
    }

    throw lastError || new Error("Gemini grounded search failed on all attempted models.");
  }
}

export class GoogleCustomSearchProvider implements SearchProvider {
  constructor(
    private readonly apiKey = getFirstEnvValue([
      "GOOGLE_CUSTOM_SEARCH_API_KEY",
    ]),
    private readonly searchEngineId =
      getFirstEnvValue(["GOOGLE_CUSTOM_SEARCH_ENGINE_ID", "GOOGLE_CSE_ID"])
  ) {}

  async search(query: string): Promise<SearchResult[]> {
    if (!this.apiKey || !this.searchEngineId) {
      throw new GoogleSearchConfigError();
    }

    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("cx", this.searchEngineId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "5");

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      const message =
        data?.error?.message || "Google search request failed.";
      throw new Error(message);
    }

    return (data.items || []).map((item: Record<string, string>) => ({
      title: item.title || "Search result",
      url: item.link || "",
      snippet: item.snippet || "",
    }));
  }
}

export function createDefaultSearchProvider(): SearchProvider {
  if (
    getFirstEnvValue([
      "GEMINI_API_KEY",
      "GOOGLE_GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "NEXT_PUBLIC_GEMINI_API_KEY",
    ])
  ) {
    return new GeminiGroundedSearchProvider();
  }

  if (
    getFirstEnvValue(["GOOGLE_CUSTOM_SEARCH_API_KEY"]) &&
    getFirstEnvValue(["GOOGLE_CUSTOM_SEARCH_ENGINE_ID", "GOOGLE_CSE_ID"])
  ) {
    return new GoogleCustomSearchProvider();
  }

  return {
    async search() {
      throw new GoogleSearchConfigError();
    },
  };
}

export function getSearchConfigStatus(): {
  hasGeminiSearch: boolean;
  hasGoogleCustomSearch: boolean;
} {
  return {
    hasGeminiSearch: Boolean(
      getFirstEnvValue([
        "GEMINI_API_KEY",
        "GOOGLE_GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "NEXT_PUBLIC_GEMINI_API_KEY",
      ])
    ),
    hasGoogleCustomSearch: Boolean(
      getFirstEnvValue(["GOOGLE_CUSTOM_SEARCH_API_KEY"]) &&
        getFirstEnvValue(["GOOGLE_CUSTOM_SEARCH_ENGINE_ID", "GOOGLE_CSE_ID"])
    ),
  };
}

export function getSearchDiagnostics(): {
  hasGeminiSearch: boolean;
  hasGoogleCustomSearch: boolean;
  vercelEnv: string | null;
  gitBranch: string | null;
  gitCommit: string | null;
  deploymentUrl: string | null;
} {
  const status = getSearchConfigStatus();
  return {
    ...status,
    vercelEnv: getFirstEnvValue(["VERCEL_ENV"]) || null,
    gitBranch: getFirstEnvValue(["VERCEL_GIT_COMMIT_REF"]) || null,
    gitCommit:
      getFirstEnvValue(["VERCEL_GIT_COMMIT_SHA"])?.slice(0, 7) || null,
    deploymentUrl: getFirstEnvValue(["VERCEL_URL"]) || null,
  };
}

function getFirstEnvValue(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export async function researchInterviewProminence(
  interview: ResearchInterview,
  provider: SearchProvider = createDefaultSearchProvider()
): Promise<ProminenceResearchResult> {
  const queries = buildProminenceQueries(interview);
  const settled = await Promise.allSettled(
    queries.map((query) => provider.search(query))
  );

  const firstFailure = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (firstFailure && settled.every((result) => result.status === "rejected")) {
    throw firstFailure.reason;
  }

  const sourceResults = dedupeResults(
    settled.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    )
  ).slice(0, 12);

  const extracted = extractProminenceSignals(sourceResults);
  const prominenceNotes = buildProminenceNotes(sourceResults);
  const prominenceSignalsJson = buildProminenceSignalsJson({
    ...interview,
    ...extracted,
    results: sourceResults,
    provider: getProviderLabel(provider),
  });
  const assessment = assessInterviewProminence({
    ...interview,
    ...extracted,
    prominenceNotes,
    prominenceSignalsJson,
  });

  return {
    ...extracted,
    prominenceNotes,
    prominenceSignalsJson,
    sourceResults,
    assessment,
  };
}

export function buildProminenceQueries(interview: ResearchInterview): string[] {
  const name = quote(interview.intervieweeName);
  const company = interview.intervieweeCompany
    ? quote(interview.intervieweeCompany)
    : "";
  const identity = [name, company].filter(Boolean).join(" ");

  return [
    [
      identity,
      interview.intervieweeTitle || "",
      "VIP prominence signals",
      "CEO founder executive author speaker awards Forbes Fortune Inc",
      "followers subscribers LinkedIn Instagram YouTube",
      "employees revenue funding acquisition public company",
    ]
      .filter(Boolean)
      .join(" "),
  ];
}

export function extractProminenceSignals(results: SearchResult[]): {
  companyEmployeeCount: number | null;
  companyRevenueUsd: number | null;
  largestSocialFollowerCount: number | null;
} {
  let companyEmployeeCount: number | null = null;
  let companyRevenueUsd: number | null = null;
  let largestSocialFollowerCount: number | null = null;

  for (const result of results) {
    const text = `${result.title} ${result.snippet}`;

    for (const match of text.matchAll(
      /(\$?\d[\d,]*(?:\.\d+)?\s*(?:k|m|b|thousand|million|billion)?)\s*(?:annual\s*)?(?:revenue|sales)/gi
    )) {
      companyRevenueUsd = maxMetric(
        companyRevenueUsd,
        parseMoneyMetric(match[1])
      );
    }

    for (const match of text.matchAll(
      /(\d[\d,]*(?:\.\d+)?\s*(?:k|m|b|thousand|million|billion)?)\s*(?:\+?\s*)?(?:employees|people|staff|team members)/gi
    )) {
      companyEmployeeCount = maxMetric(
        companyEmployeeCount,
        parseCountMetric(match[1])
      );
    }

    for (const match of text.matchAll(
      /(\d[\d,]*(?:\.\d+)?\s*(?:k|m|b|thousand|million|billion)?)\s*(?:\+?\s*)?(?:followers|subscribers|fans|listeners)/gi
    )) {
      largestSocialFollowerCount = maxMetric(
        largestSocialFollowerCount,
        parseCountMetric(match[1])
      );
    }
  }

  return {
    companyEmployeeCount,
    companyRevenueUsd,
    largestSocialFollowerCount,
  };
}

function buildProminenceNotes(results: SearchResult[]): string | null {
  const relevant = results
    .filter((result) =>
      PROMINENCE_SIGNAL_PATTERN.test(`${result.title} ${result.snippet}`)
    )
    .slice(0, 5);

  if (relevant.length === 0) return null;

  return relevant
    .map((result) => {
      const snippet = result.snippet.replace(/\s+/g, " ").trim();
      return `${result.title}: ${snippet} (${result.url})`;
    })
    .join("\n");
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const result of results) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    deduped.push(result);
  }
  return deduped;
}

export function geminiResponseToSearchResults(data: {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    };
  }>;
}): SearchResult[] {
  const candidate = data.candidates?.[0];
  const text =
    candidate?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n") || "";
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];

  const results = chunks
    .map((chunk): SearchResult | null => {
      const uri = chunk.web?.uri;
      if (!uri) return null;
      return {
        title: chunk.web?.title || "Gemini grounded source",
        url: uri,
        snippet: text,
      };
    })
    .filter((result): result is SearchResult => Boolean(result));

  if (results.length > 0) return results;
  if (!text.trim()) return [];

  return [
    {
      title: "Gemini grounded research",
      url: "https://ai.google.dev/gemini-api/docs/google-search",
      snippet: text,
    },
  ];
}

function maxMetric(current: number | null, next: number | null): number | null {
  if (next === null) return current;
  if (current === null) return next;
  return Math.max(current, next);
}

function getProviderLabel(provider: SearchProvider): string {
  if (provider instanceof GeminiGroundedSearchProvider) return "gemini_grounded_search";
  if (provider instanceof GoogleCustomSearchProvider) return "google_custom_search";
  return "custom_search_provider";
}

function quote(value: string): string {
  return `"${value.replaceAll('"', "")}"`;
}
