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

export interface SearchProviderFailure {
  provider: string;
  code: string;
}

export interface SearchProviderOutcome {
  provider: string;
  fallbackUsed: boolean;
  providerErrors: SearchProviderFailure[];
}

export interface ProminenceResearchResult {
  companyEmployeeCount: number | null;
  companyRevenueUsd: number | null;
  largestSocialFollowerCount: number | null;
  prominenceNotes: string | null;
  prominenceSignalsJson: string | null;
  sourceResults: SearchResult[];
  assessment: ReturnType<typeof assessInterviewProminence>;
  provider: string;
  fallbackUsed: boolean;
  providerErrors: SearchProviderFailure[];
  isSimulated?: boolean;
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

// ---- Gemini error classes ----

export class GeminiQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiQuotaExceededError";
  }
}

export class GeminiResearchTimeoutError extends Error {
  constructor() {
    super("Standout research took too long and was stopped before spending more API time.");
    this.name = "GeminiResearchTimeoutError";
  }
}

export class GeminiTemporaryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiTemporaryUnavailableError";
  }
}

// ---- Google Custom Search typed error classes ----
// These allow precise classification without relying on fragile message-string matching.

/** Setup/config errors: invalid cx, disabled API, invalid/restricted key, billing, 400/401/403. Not retryable. */
export class GoogleCustomSearchSetupError extends Error {
  readonly httpStatus: number;
  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = "GoogleCustomSearchSetupError";
    this.httpStatus = httpStatus;
  }
}

/** Quota/rate-limit errors: 429 or dailyLimitExceeded. Not retryable in the same session. */
export class GoogleCustomSearchQuotaError extends Error {
  readonly httpStatus: number;
  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = "GoogleCustomSearchQuotaError";
    this.httpStatus = httpStatus;
  }
}

/** Temporary unavailability: 503, timeout, network failure. Retryable. */
export class GoogleCustomSearchTemporaryError extends Error {
  readonly httpStatus: number;
  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = "GoogleCustomSearchTemporaryError";
    this.httpStatus = httpStatus;
  }
}

// ---- Provider health status ----

export type ProviderHealthCategory =
  | "ready"
  | "setup_attention"
  | "quota"
  | "temporary_unavailable"
  | "unknown";

export interface ProviderHealthStatus {
  provider: "gemini" | "google_custom_search";
  configured: boolean;
  status: ProviderHealthCategory;
  /** Safe for admin display — must not include secrets or raw API responses. */
  diagnosticMessage: string;
}

// ---- Provider health check cache ----
const HEALTH_CHECK_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
interface HealthCheckCacheEntry {
  result: ProviderHealthStatus;
  cachedAt: number;
}
const healthCheckCache = new Map<string, HealthCheckCacheEntry>();

export class SearchProviderFallbackError extends Error {
  code = "SEARCH_PROVIDER_FALLBACK_FAILED";

  constructor(
    readonly providerErrors: SearchProviderFailure[],
    readonly hasBackupProvider: boolean,
    readonly retryable = areProviderFailuresRetryable(providerErrors)
  ) {
    super(buildSearchProviderFallbackMessage(providerErrors, hasBackupProvider));
    this.name = "SearchProviderFallbackError";
  }
}

const PROMINENCE_SIGNAL_PATTERN =
  /\b(forbes|fortune|inc\.?|entrepreneur|fast company|nyt|new york times|wsj|wall street journal|bloomberg|cnbc|tedx?|keynote|speaker|author|bestseller|best-selling|award|winner|honoree|founder|ceo|president|wikipedia|verified|followers|subscribers|employees|revenue|funding|raised|acquired|public company|fortune 500)\b/i;

export const DEFAULT_GEMINI_SEARCH_MODEL = "gemini-2.5-flash";

export interface GeminiSearchModelPlan {
  primaryModel: string;
  fallbackModel: string | null;
  interactionsFallbackEnabled: boolean;
}

export function getGeminiSearchModelPlan(
  env: Record<string, string | undefined> = process.env
): GeminiSearchModelPlan {
  const primaryModel =
    getFirstEnvValue(["GEMINI_SEARCH_MODEL"], env) || DEFAULT_GEMINI_SEARCH_MODEL;
  const fallbackModel =
    getFirstEnvValue(["GEMINI_SEARCH_FALLBACK_MODEL"], env) || null;

  return {
    primaryModel,
    fallbackModel:
      fallbackModel && fallbackModel !== primaryModel ? fallbackModel : null,
    interactionsFallbackEnabled: parseEnvBoolean(
      getFirstEnvValue(["GEMINI_SEARCH_ENABLE_INTERACTIONS_FALLBACK"], env),
      false
    ),
  };
}

export class GeminiGroundedSearchProvider implements SearchProvider {
  private readonly apiKey: string | undefined;
  private readonly modelPlan: GeminiSearchModelPlan;

  constructor(
    apiKey = getFirstEnvValue([
      "GEMINI_API_KEY",
      "GOOGLE_GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "NEXT_PUBLIC_GEMINI_API_KEY",
    ]),
    modelPlan = getGeminiSearchModelPlan()
  ) {
    this.apiKey = apiKey;
    this.modelPlan = modelPlan;
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new GoogleSearchConfigError();
    }

    const modelsToTry = [
      this.modelPlan.primaryModel,
      ...(this.modelPlan.fallbackModel ? [this.modelPlan.fallbackModel] : []),
    ];

    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        const signal = AbortSignal.timeout(getGeminiRequestTimeoutMs());
        try {
          const generateContentData = await requestGeminiGenerateContent(
            model,
            query,
            this.apiKey,
            signal
          );
          return geminiResponseToSearchResults(generateContentData);
        } catch (primaryError: unknown) {
          if (primaryError instanceof GeminiQuotaExceededError) throw primaryError;
          if (isAbortError(primaryError)) throw new GeminiResearchTimeoutError();
          if (!this.modelPlan.interactionsFallbackEnabled) throw primaryError;
          console.warn(
            `Gemini generateContent search failed for model ${model}; trying Interactions fallback. Error:`,
            primaryError instanceof Error ? primaryError.message : String(primaryError)
          );
        }

        const interactionSignal = AbortSignal.timeout(getGeminiRequestTimeoutMs());
        let response;
        try {
          response = await requestGeminiInteraction(
            model,
            query,
            this.apiKey,
            interactionSignal
          );
        } catch (fetchErr: unknown) {
          if (isAbortError(fetchErr)) throw new GeminiResearchTimeoutError();
          // Check if it's a local SSL/TLS interception issue
          const fetchError =
            typeof fetchErr === "object" && fetchErr
              ? (fetchErr as {
                  cause?: { code?: unknown };
                  message?: unknown;
                })
              : {};
          const causeCode =
            typeof fetchError.cause?.code === "string"
              ? fetchError.cause.code
              : "";
          const fetchMessage =
            typeof fetchError.message === "string" ? fetchError.message : "";
          const isSslErr =
            causeCode === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" ||
            causeCode === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
            fetchMessage.includes("unable to get local issuer certificate");

          if (
            isSslErr &&
            process.env.NODE_ENV === "development" &&
            process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0"
          ) {
            console.warn(
              "\x1b[33m%s\x1b[0m",
              "⚠️ Node.js rejected the Gemini API certificate. Automatically bypassing TLS verification locally in development and retrying..."
            );
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
            response = await requestGeminiInteraction(
              model,
              query,
              this.apiKey,
              interactionSignal
            );
          } else {
            throw fetchErr;
          }
        }

        const data = await response.json();
        if (!response.ok) {
          const message = data?.error?.message || "Gemini grounded search failed.";
          if (
            response.status === 429 ||
            message.includes("quota") ||
            message.includes("limit")
          ) {
            throw new GeminiQuotaExceededError(`Model ${model} rate/quota limit: ${message}`);
          }
          if (response.status === 503) {
            throw new GeminiTemporaryUnavailableError(
              `Model ${model} temporarily unavailable: ${message}`
            );
          }
          throw new Error(`Model ${model} interactions failed: ${message}`);
        }

        return interactionResponseToSearchResults(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        lastError = err instanceof Error ? err : new Error(message);
        console.warn(`Gemini grounded search failed for model ${model}, trying next... Error:`, message);
      }
    }

    throw lastError || new Error("Gemini grounded search failed on all attempted models.");
  }
}

function requestGeminiInteraction(
  model: string,
  query: string,
  apiKey: string,
  signal: AbortSignal
) {
  return fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      input: buildGroundedResearchPrompt(query),
      tools: [{ type: "google_search" }],
    }),
    signal,
  });
}

function parseEnvBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  return !/^(false|0|no|off)$/i.test(value.trim());
}

function getGeminiRequestTimeoutMs(
  rawValue = process.env.GEMINI_RESEARCH_TIMEOUT_MS
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return 25_000;
  return Math.min(Math.max(Math.trunc(parsed), 5_000), 60_000);
}

function buildGroundedResearchPrompt(query: string): string {
  return (
    "Research this person or company for standout/prospect prominence signals. " +
    "Return compact facts, not a memo or intro. Prefer JSON with: " +
    "standoutSummary and signals containing kind, label, value, detail, confidence, sourceTitle, sourceUrl, placement. " +
    "Look for employee count, annual revenue, social followers/subscribers, press, awards, author/speaker signals, " +
    `senior leadership, funding, acquisitions, or public-company status: ${query}`
  );
}

async function requestGeminiGenerateContent(
  model: string,
  query: string,
  apiKey: string,
  signal: AbortSignal
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildGroundedResearchPrompt(query),
              },
            ],
          },
        ],
        tools: [{ google_search: {} }],
      }),
      signal,
    }
  );
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "Gemini grounded search failed.";
    if (
      response.status === 429 ||
      message.includes("quota") ||
      message.includes("limit")
    ) {
      throw new GeminiQuotaExceededError(
        `Model ${model} rate/quota limit: ${message}`
      );
    }
    if (response.status === 503) {
      throw new GeminiTemporaryUnavailableError(
        `Model ${model} temporarily unavailable: ${message}`
      );
    }
    throw new Error(`Model ${model} generateContent failed: ${message}`);
  }
  return data;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "TimeoutError"
  ) || (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
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

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(getGoogleCustomSearchTimeoutMs()),
      });
    } catch (fetchErr: unknown) {
      if (isAbortError(fetchErr)) {
        throw new GoogleCustomSearchTemporaryError(
          "Google Custom Search request timed out.",
          0
        );
      }
      // Network-level failure (DNS, connection refused, etc.) — temporary
      throw new GoogleCustomSearchTemporaryError(
        "Google Custom Search network failure.",
        0
      );
    }

    let data: Record<string, unknown>;
    try {
      data = await response.json();
    } catch {
      // Could not parse response — treat as temporary if server-side error, setup otherwise
      if (response.status >= 500) {
        throw new GoogleCustomSearchTemporaryError(
          `Google Custom Search returned an unparseable response (HTTP ${response.status}).`,
          response.status
        );
      }
      throw new GoogleCustomSearchSetupError(
        `Google Custom Search returned an unparseable response (HTTP ${response.status}).`,
        response.status
      );
    }

    if (!response.ok) {
      const rawMessage =
        (data?.error as Record<string, unknown>)?.message ||
        "Google Custom Search request failed.";
      const message = typeof rawMessage === "string" ? rawMessage : "Google Custom Search request failed.";
      const errorReason =
        typeof (data?.error as Record<string, unknown>)?.errors === "object"
          ? String(
              ((data.error as Record<string, unknown>).errors as Array<Record<string, unknown>>)?.[0]?.reason || ""
            )
          : "";

      // 429 — explicit quota or rate limit.
      // Also catch quota reasons that Google returns with other status codes (e.g. 200 body errors).
      if (
        response.status === 429 ||
        /dailylimitexceeded|ratelimitexceeded|userratelimitexceeded|quotaexceeded|resource.?exhausted/i.test(
          message + errorReason
        )
      ) {
        throw new GoogleCustomSearchQuotaError(
          `Google Custom Search quota or rate limit reached.`,
          response.status
        );
      }

      // 503/504 — server-side temporary
      if (response.status === 503 || response.status === 504) {
        throw new GoogleCustomSearchTemporaryError(
          `Google Custom Search is temporarily unavailable.`,
          response.status
        );
      }

      // 400 — almost always a setup problem: invalid cx, bad parameters, malformed request
      // Google returns 400 for invalid engine ID (cx), missing parameters, bad API surface
      if (response.status === 400) {
        throw new GoogleCustomSearchSetupError(
          `Google Custom Search setup needs attention: invalid request or engine ID configuration (HTTP 400).`,
          response.status
        );
      }

      // 401 — always auth/key problem (setup)
      if (response.status === 401) {
        throw new GoogleCustomSearchSetupError(
          `Google Custom Search setup needs attention: API key or authentication problem (HTTP 401).`,
          response.status
        );
      }

      // 403 — check for quota-related reasons FIRST.
      // Google returns 403 with reason=dailyLimitExceeded/rateLimitExceeded/userRateLimitExceeded
      // for quota exhaustion, not just for auth problems.
      if (response.status === 403) {
        if (
          /dailylimitexceeded|ratelimitexceeded|userratelimitexceeded|quotaexceeded/i.test(
            errorReason + message
          )
        ) {
          throw new GoogleCustomSearchQuotaError(
            `Google Custom Search quota or rate limit reached.`,
            response.status
          );
        }
        throw new GoogleCustomSearchSetupError(
          `Google Custom Search setup needs attention: API key, permissions, or billing problem (HTTP 403).`,
          response.status
        );
      }

      // Any other non-200 with a suspicious message — classify precisely
      if (
        /api.?key.?not.?valid|invalid.?api.?key|api.?key.?invalid/i.test(message)
      ) {
        throw new GoogleCustomSearchSetupError(
          `Google Custom Search setup needs attention: API key is not valid.`,
          response.status
        );
      }
      if (
        /disabled|not.?enabled|api.?access.?not.?configured|project.?not.?enabled/i.test(
          message + errorReason
        )
      ) {
        throw new GoogleCustomSearchSetupError(
          `Google Custom Search setup needs attention: API is disabled or not enabled for this project.`,
          response.status
        );
      }
      if (
        /billing|payment.?required/i.test(message)
      ) {
        throw new GoogleCustomSearchSetupError(
          `Google Custom Search setup needs attention: billing issue detected.`,
          response.status
        );
      }

      // Unknown non-200 — not retryable by default (conservative)
      throw new GoogleCustomSearchSetupError(
        `Google Custom Search returned an unexpected error (HTTP ${response.status}).`,
        response.status
      );
    }

    const items = data.items;
    if (!Array.isArray(items) || items.length === 0) {
      // Empty result is valid — not an error
      return [];
    }

    return items.map((item: Record<string, string>) => ({
      title: item.title || "Search result",
      url: item.link || "",
      snippet: item.snippet || "",
    }));
  }

  /**
   * Run a minimal test query to check if the provider is correctly configured.
   * Returns a safe ProviderHealthStatus — no secrets included.
   */
  async checkHealth(): Promise<ProviderHealthStatus> {
    const cacheKey = `google_custom_search:health`;
    const cached = healthCheckCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < HEALTH_CHECK_CACHE_TTL_MS) {
      return cached.result;
    }

    if (!this.apiKey || !this.searchEngineId) {
      const result: ProviderHealthStatus = {
        provider: "google_custom_search",
        configured: false,
        status: "setup_attention",
        diagnosticMessage:
          "Google Custom Search is not configured. Set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID.",
      };
      healthCheckCache.set(cacheKey, { result, cachedAt: Date.now() });
      return result;
    }

    try {
      // Minimal test query — short timeout, single result
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", this.apiKey);
      url.searchParams.set("cx", this.searchEngineId);
      url.searchParams.set("q", "test");
      url.searchParams.set("num", "1");

      const response = await fetch(url, {
        signal: AbortSignal.timeout(8_000),
      });
      const data = await response.json();

      if (response.ok) {
        const result: ProviderHealthStatus = {
          provider: "google_custom_search",
          configured: true,
          status: "ready",
          diagnosticMessage: "Google Custom Search is configured and responding.",
        };
        healthCheckCache.set(cacheKey, { result, cachedAt: Date.now() });
        return result;
      }

      const rawMessage =
        (data?.error as Record<string, unknown>)?.message || "";
      const message = typeof rawMessage === "string" ? rawMessage : "";

      // Classify the failure for the health report
      if (response.status === 429) {
        const result: ProviderHealthStatus = {
          provider: "google_custom_search",
          configured: true,
          status: "quota",
          diagnosticMessage: "Google Custom Search quota or rate limit reached.",
        };
        healthCheckCache.set(cacheKey, { result, cachedAt: Date.now() });
        return result;
      }
      if (response.status === 503 || response.status === 504) {
        const result: ProviderHealthStatus = {
          provider: "google_custom_search",
          configured: true,
          status: "temporary_unavailable",
          diagnosticMessage: "Google Custom Search is temporarily unavailable.",
        };
        healthCheckCache.set(cacheKey, { result, cachedAt: Date.now() });
        return result;
      }
      if (
        response.status === 400 ||
        response.status === 401 ||
        /api.?key|invalid|disabled|billing|permission|not.?enabled/i.test(message)
      ) {
        const result: ProviderHealthStatus = {
          provider: "google_custom_search",
          configured: false,
          status: "setup_attention",
          diagnosticMessage:
            `Google Custom Search setup needs attention (HTTP ${response.status}). Check the API key, engine ID, and that the Custom Search API is enabled with correct billing.`,
        };
        healthCheckCache.set(cacheKey, { result, cachedAt: Date.now() });
        return result;
      }

      // 403 in health check: quota reasons first, then setup
      if (response.status === 403) {
        const rawReason =
          (data?.error as Record<string, unknown>)?.errors;
        const reason403 = Array.isArray(rawReason)
          ? String((rawReason as Array<Record<string, unknown>>)[0]?.reason || "")
          : "";
        if (
          /dailylimitexceeded|ratelimitexceeded|userratelimitexceeded|quotaexceeded/i.test(
            reason403 + message
          )
        ) {
          const result: ProviderHealthStatus = {
            provider: "google_custom_search",
            configured: true,
            status: "quota",
            diagnosticMessage: "Google Custom Search quota or rate limit reached.",
          };
          healthCheckCache.set(cacheKey, { result, cachedAt: Date.now() });
          return result;
        }
        const result: ProviderHealthStatus = {
          provider: "google_custom_search",
          configured: false,
          status: "setup_attention",
          diagnosticMessage:
            `Google Custom Search setup needs attention (HTTP 403). Check the API key, engine ID, and that the Custom Search API is enabled with correct billing.`,
        };
        healthCheckCache.set(cacheKey, { result, cachedAt: Date.now() });
        return result;
      }

      const result: ProviderHealthStatus = {
        provider: "google_custom_search",
        configured: true,
        status: "unknown",
        diagnosticMessage: `Google Custom Search returned an unexpected status (HTTP ${response.status}).`,
      };
      healthCheckCache.set(cacheKey, { result, cachedAt: Date.now() });
      return result;
    } catch (err: unknown) {
      if (isAbortError(err)) {
        const result: ProviderHealthStatus = {
          provider: "google_custom_search",
          configured: true,
          status: "temporary_unavailable",
          diagnosticMessage: "Google Custom Search health check timed out.",
        };
        healthCheckCache.set(cacheKey, { result, cachedAt: Date.now() });
        return result;
      }
      const result: ProviderHealthStatus = {
        provider: "google_custom_search",
        configured: true,
        status: "unknown",
        diagnosticMessage: "Google Custom Search health check failed with a network error.",
      };
      healthCheckCache.set(cacheKey, { result, cachedAt: Date.now() });
      return result;
    }
  }
}

interface SearchProviderEntry {
  label: string;
  provider: SearchProvider;
}

export class FallbackSearchProvider implements SearchProvider {
  private lastOutcome: SearchProviderOutcome | null = null;
  // ---- Instance-level circuit-breaker ----
  // Kept per-instance so tests in the same process don't share breaker state,
  // and so each request (which creates a new FallbackSearchProvider) starts fresh.
  private readonly circuitBreakerState = new Map<string, { pausedUntil: number }>();

  private static readonly CIRCUIT_COOLDOWN_TEMP_MS = 30_000;   // 30s for 503/timeout
  private static readonly CIRCUIT_COOLDOWN_QUOTA_MS = 300_000; // 5 min for quota

  constructor(private readonly entries: SearchProviderEntry[]) {}

  private isCircuitOpen(providerLabel: string): boolean {
    const state = this.circuitBreakerState.get(providerLabel);
    if (!state) return false;
    if (Date.now() >= state.pausedUntil) {
      this.circuitBreakerState.delete(providerLabel);
      return false;
    }
    return true;
  }

  private tripCircuit(providerLabel: string, cooldownMs: number): void {
    this.circuitBreakerState.set(providerLabel, { pausedUntil: Date.now() + cooldownMs });
  }

  private applyCircuitBreakerTrip(providerLabel: string, code: string): void {
    if (code === "temporary_unavailable" || code === "timeout") {
      this.tripCircuit(providerLabel, FallbackSearchProvider.CIRCUIT_COOLDOWN_TEMP_MS);
    } else if (code === "quota_or_rate_limit") {
      this.tripCircuit(providerLabel, FallbackSearchProvider.CIRCUIT_COOLDOWN_QUOTA_MS);
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    this.lastOutcome = null;
    if (this.entries.length === 0) {
      throw new GoogleSearchConfigError();
    }

    const providerErrors: SearchProviderFailure[] = [];
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];

      // Circuit-breaker: skip this provider if it's currently paused
      if (this.isCircuitOpen(entry.label)) {
        console.warn(
          `Standout research provider ${entry.label} is circuit-breaker paused; skipping.`
        );
        providerErrors.push({ provider: entry.label, code: "circuit_open" });
        continue;
      }

      const maxAttempts = getSearchProviderAttemptLimit();
      let finalFailure: SearchProviderFailure | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const results = await entry.provider.search(query);
          this.lastOutcome = {
            provider: entry.label,
            fallbackUsed: index > 0,
            providerErrors,
          };
          return results;
        } catch (error) {
          const failure = buildProviderFailure(entry.label, error);
          finalFailure = failure;

          // Trip circuit-breaker based on error type before deciding to retry
          this.applyCircuitBreakerTrip(entry.label, failure.code);

          // Only retry if the failure is explicitly retryable AND we have attempts remaining
          if (attempt < maxAttempts && shouldRetryProviderFailure(failure.code)) {
            console.warn(
              `Standout research provider ${entry.label} failed with ${failure.code}; retrying.`
            );
            await delay(getSearchProviderRetryDelayMs(attempt));
            continue;
          }
          break;
        }
      }

      if (finalFailure) {
        providerErrors.push(finalFailure);
        if (index < this.entries.length - 1) {
          console.warn(
            `Standout research provider ${entry.label} failed with ${finalFailure.code}; trying backup provider.`
          );
        }
      }
    }

    throw new SearchProviderFallbackError(
      providerErrors,
      this.entries.some((entry) => entry.label === "google_custom_search")
    );
  }

  getLastOutcome(): SearchProviderOutcome | null {
    return this.lastOutcome;
  }
}

export function createDefaultSearchProvider(): SearchProvider {
  const entries: SearchProviderEntry[] = [];

  if (
    getFirstEnvValue([
      "GEMINI_API_KEY",
      "GOOGLE_GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "NEXT_PUBLIC_GEMINI_API_KEY",
    ])
  ) {
    entries.push({
      label: "gemini_grounded_search",
      provider: new GeminiGroundedSearchProvider(),
    });
  }

  if (
    getFirstEnvValue(["GOOGLE_CUSTOM_SEARCH_API_KEY"]) &&
    getFirstEnvValue(["GOOGLE_CUSTOM_SEARCH_ENGINE_ID", "GOOGLE_CSE_ID"])
  ) {
    entries.push({
      label: "google_custom_search",
      provider: new GoogleCustomSearchProvider(),
    });
  }

  return new FallbackSearchProvider(entries);
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

/**
 * Returns safe Gemini provider health status without running any live requests.
 * Gemini liveness requires a real API call — this returns the configured/not-configured state
 * based on env var presence, and reflects circuit-breaker state.
 */
export function getGeminiHealthStatus(): ProviderHealthStatus {
  const hasKey = Boolean(
    getFirstEnvValue([
      "GEMINI_API_KEY",
      "GOOGLE_GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "NEXT_PUBLIC_GEMINI_API_KEY",
    ])
  );
  if (!hasKey) {
    return {
      provider: "gemini",
      configured: false,
      status: "setup_attention",
      diagnosticMessage:
        "Gemini is not configured. Set GEMINI_API_KEY in the deployment environment.",
    };
  }
  return {
    provider: "gemini",
    configured: true,
    status: "ready",
    diagnosticMessage: "Gemini API key is configured.",
  };
}

function getFirstEnvValue(
  names: string[],
  env: Record<string, string | undefined> = process.env
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export async function researchInterviewProminence(
  interview: ResearchInterview,
  provider: SearchProvider = createDefaultSearchProvider()
): Promise<ProminenceResearchResult> {
  try {
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
    const providerOutcome = getSearchProviderOutcome(provider);
    const providerLabel = providerOutcome?.provider || getProviderLabel(provider);

    const extracted = extractProminenceSignals(sourceResults);
    const prominenceNotes = buildProminenceNotes(sourceResults);
    const prominenceSignalsJson = buildProminenceSignalsJson({
      ...interview,
      ...extracted,
      results: sourceResults,
      provider: providerLabel,
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
      provider: providerLabel,
      fallbackUsed: providerOutcome?.fallbackUsed || false,
      providerErrors: providerOutcome?.providerErrors || [],
      isSimulated: false,
    };
  } catch (error: unknown) {
    // If in development mode (or local demo preview) and we hit a configuration, auth, network, or rate limit,
    // gracefully fall back to generating a simulated research result instead of crashing.
    const isLocalDev = process.env.NODE_ENV === "development" || !process.env.VERCEL;

    if (isLocalDev) {
      console.warn(
        "\x1b[33m%s\x1b[0m",
        `⚠️ Prominence research failed due to: ${getUnknownErrorMessage(error)}. Falling back to Simulated/Demo Mode research...`
      );
      return generateSimulatedResearchResult(interview);
    }

    throw error;
  }
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

function getUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function buildProviderFailure(
  provider: string,
  error: unknown
): SearchProviderFailure {
  const message = getUnknownErrorMessage(error);
  return {
    provider,
    code: getProviderErrorCode(error, message),
  };
}

function getProviderErrorCode(error: unknown, message: string): string {
  if (error instanceof GoogleSearchConfigError) return "not_configured";
  // Typed Gemini errors
  if (error instanceof GeminiQuotaExceededError) return "quota_or_rate_limit";
  if (error instanceof GeminiResearchTimeoutError) return "timeout";
  if (error instanceof GeminiTemporaryUnavailableError) return "temporary_unavailable";
  // Typed Google Custom Search errors — precise, no message guessing
  if (error instanceof GoogleCustomSearchSetupError) return "setup_attention";
  if (error instanceof GoogleCustomSearchQuotaError) return "quota_or_rate_limit";
  if (error instanceof GoogleCustomSearchTemporaryError) return "temporary_unavailable";
  // Fallback: classify by message content for untyped errors
  if (/503|temporarily unavailable|service unavailable|overloaded|backend error/i.test(message)) {
    return "temporary_unavailable";
  }
  if (/quota|rate.?limit|resource.?exhausted/i.test(message)) {
    return "quota_or_rate_limit";
  }
  if (/api key not valid|invalid api key|permission|billing|not enabled|forbidden|unauthorized/i.test(message)) {
    return "configuration_or_auth";
  }
  if (/timeout|timed out|abort/i.test(message)) return "timeout";
  // Unknown response — conservatively NOT retryable.
  // "provider_error" on an unknown response should not be retried blindly;
  // it is likely a structural problem rather than a transient outage.
  return "provider_error";
}

export function shouldRetryProviderFailure(code: string): boolean {
  // Only retry confirmed transient failures. "provider_error" is unknown and NOT retried.
  return code === "timeout" || code === "temporary_unavailable";
}


export function areProviderFailuresRetryable(

  providerErrors: SearchProviderFailure[]
): boolean {
  return (
    providerErrors.length > 0 &&
    providerErrors.every(
      (failure) =>
        // circuit_open means the underlying cause was temp/quota — retryable
        shouldRetryProviderFailure(failure.code) || failure.code === "circuit_open"
    )
  );
}

function getSearchProviderAttemptLimit(
  rawValue = process.env.PROMINENCE_SEARCH_PROVIDER_ATTEMPTS
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(Math.max(Math.trunc(parsed), 1), 3);
}

function getSearchProviderRetryDelayMs(
  attempt: number,
  rawValue = process.env.PROMINENCE_SEARCH_PROVIDER_RETRY_DELAY_MS
): number {
  const parsed = Number(rawValue);
  const baseDelay = Number.isFinite(parsed)
    ? Math.max(Math.trunc(parsed), 0)
    : process.env.NODE_ENV === "production"
    ? 750
    : 0;
  return baseDelay * attempt;
}

function getGoogleCustomSearchTimeoutMs(
  rawValue = process.env.GOOGLE_CUSTOM_SEARCH_TIMEOUT_MS
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return 12_000;
  return Math.min(Math.max(Math.trunc(parsed), 3_000), 30_000);
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSearchProviderFallbackMessage(
  providerErrors: SearchProviderFailure[],
  hasBackupProvider: boolean
): string {
  const nonCircuitErrors = providerErrors.filter(
    (failure) => failure.code !== "circuit_open"
  );

  // Setup/config problems — precise, not "temporarily unavailable"
  const googleSetupFailed = nonCircuitErrors.some(
    (failure) =>
      failure.provider === "google_custom_search" &&
      failure.code === "setup_attention"
  );
  if (googleSetupFailed) {
    return (
      "Google Custom Search setup needs attention. " +
      "Check the API key, engine ID, and that the Custom Search API is enabled with correct billing. " +
      "Existing saved signals were kept."
    );
  }

  const anySetupFailed = nonCircuitErrors.some((failure) =>
    ["not_configured", "configuration_or_auth", "setup_attention"].includes(
      failure.code
    )
  );
  if (anySetupFailed) {
    return (
      "Standout research could not finish because one or more search providers need setup attention. " +
      "Check Gemini and Google Custom Search credentials in the deployment environment. " +
      "Existing saved signals were kept."
    );
  }

  // Quota problems
  const quotaFailed = nonCircuitErrors.some(
    (failure) => failure.code === "quota_or_rate_limit"
  );
  const geminiFailed = nonCircuitErrors.some(
    (failure) => failure.provider === "gemini_grounded_search"
  );
  if (geminiFailed && !hasBackupProvider) {
    return (
      "Standout research could not finish because Gemini is temporarily limited or unavailable, " +
      "and backup Google Custom Search is not configured. Add GOOGLE_CUSTOM_SEARCH_API_KEY " +
      "and GOOGLE_CUSTOM_SEARCH_ENGINE_ID, then try again."
    );
  }

  if (quotaFailed) {
    return (
      "Standout research could not finish because the configured search providers hit quota or rate limits. " +
      "Existing saved signals were kept; check provider quota and billing if this keeps happening."
    );
  }

  // Only say "temporarily unavailable" when ALL errors are genuinely transient
  const allTrulyTemporary = nonCircuitErrors.length > 0 &&
    nonCircuitErrors.every(
      (failure) =>
        failure.code === "timeout" || failure.code === "temporary_unavailable"
    );
  if (allTrulyTemporary) {
    return (
      "Search providers are temporarily unavailable. " +
      "Existing saved signals were kept; try again later."
    );
  }

  // Mixed or unknown failures — don't call it temporary
  return (
    "Standout research could not finish. " +
    "Existing saved signals were kept. Check provider configuration and try again."
  );
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

export function interactionResponseToSearchResults(data: {
  output_text?: string;
  outputText?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
        title?: string;
        start_index?: number;
        end_index?: number;
        startIndex?: number;
        endIndex?: number;
      }>;
    }>;
  }>;
}): SearchResult[] {
  const outputText = data.output_text || data.outputText || "";
  const results: SearchResult[] = [];

  for (const step of data.steps || []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content || []) {
      if (block.type !== "text" || !block.text?.trim()) continue;
      for (const annotation of block.annotations || []) {
        if (annotation.type !== "url_citation" || !annotation.url) continue;
        results.push({
          title: annotation.title || getHostname(annotation.url),
          url: annotation.url,
          snippet: block.text,
        });
      }
    }
  }

  if (results.length > 0) return dedupeResults(results);
  if (!outputText.trim()) return [];

  return [
    {
      title: "Gemini grounded research",
      url: "https://ai.google.dev/gemini-api/docs/google-search",
      snippet: outputText,
    },
  ];
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Grounded source";
  }
}

function maxMetric(current: number | null, next: number | null): number | null {
  if (next === null) return current;
  if (current === null) return next;
  return Math.max(current, next);
}

function getProviderLabel(provider: SearchProvider): string {
  const outcome = getSearchProviderOutcome(provider);
  if (outcome) return outcome.provider;
  if (provider instanceof GeminiGroundedSearchProvider) return "gemini_grounded_search";
  if (provider instanceof GoogleCustomSearchProvider) return "google_custom_search";
  return "custom_search_provider";
}

function getSearchProviderOutcome(
  provider: SearchProvider
): SearchProviderOutcome | null {
  if (
    provider instanceof FallbackSearchProvider
  ) {
    return provider.getLastOutcome();
  }
  return null;
}

function quote(value: string): string {
  return `"${value.replaceAll('"', "")}"`;
}

function generateSimulatedResearchResult(
  interview: ResearchInterview
): ProminenceResearchResult {
  const name = interview.intervieweeName;
  const company = interview.intervieweeCompany || "their company";
  const title = interview.intervieweeTitle || "Executive";

  // Deterministically generate some metrics based on the name hash so it's consistent
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);

  // Determine tiers based on title
  const titleLower = title.toLowerCase();
  const isFounderOrCeo = titleLower.includes("ceo") || titleLower.includes("founder") || titleLower.includes("president");
  const isVPOrDirector = titleLower.includes("vp") || titleLower.includes("vice president") || titleLower.includes("director");
  const isAuthorOrSpeaker = titleLower.includes("author") || titleLower.includes("speaker") || titleLower.includes("writer");

  let companyEmployeeCount: number | null = null;
  let companyRevenueUsd: number | null = null;
  let largestSocialFollowerCount: number | null = null;

  if (isFounderOrCeo) {
    companyEmployeeCount = 50 + (hash % 450); // 50 to 500
    companyRevenueUsd = (10 + (hash % 90)) * 1_000_000; // $10M to $100M
    largestSocialFollowerCount = 15_000 + (hash % 85_000); // 15K to 100K
  } else if (isVPOrDirector) {
    companyEmployeeCount = 200 + (hash % 1800); // 200 to 2000
    companyRevenueUsd = (50 + (hash % 200)) * 1_000_000; // $50M to $250M
    largestSocialFollowerCount = 5_000 + (hash % 25_000); // 5K to 30K
  } else if (isAuthorOrSpeaker) {
    largestSocialFollowerCount = 50_000 + (hash % 250_000); // 50K to 300K
  } else {
    companyEmployeeCount = 10 + (hash % 40); // 10 to 50
    companyRevenueUsd = (1 + (hash % 4)) * 1_000_000; // $1M to $5M
    largestSocialFollowerCount = 1_000 + (hash % 4_000); // 1K to 5K
  }

  // Create simulated search results that signals.ts can parse
  const sourceResults: SearchResult[] = [];

  if (isFounderOrCeo) {
    sourceResults.push({
      title: `${name} - Forbes Business Council Profile`,
      url: `https://www.forbes.com/profile/${encodeURIComponent(name.toLowerCase().replaceAll(" ", "-"))}`,
      snippet: `${name} is the ${title} of ${company}. Forbes has listed ${company} as one of the fast-growing companies with annual revenue of $${((companyRevenueUsd ?? 0) / 1_000_000).toFixed(0)}M and over ${companyEmployeeCount} employees.`,
    });
  } else if (isAuthorOrSpeaker) {
    sourceResults.push({
      title: `${name} - TEDx Speaker & Author Profile`,
      url: `https://www.ted.com/speakers/${encodeURIComponent(name.toLowerCase().replaceAll(" ", "-"))}`,
      snippet: `${name} is a bestselling author and keynote speaker who has delivered speeches worldwide. Their books have been highly rated, and they maintain a social audience of over ${((largestSocialFollowerCount ?? 0) / 1000).toFixed(0)}K followers.`,
    });
  } else {
    sourceResults.push({
      title: `${name} - LinkedIn Profile`,
      url: `https://www.linkedin.com/in/${encodeURIComponent(name.toLowerCase().replaceAll(" ", "-"))}`,
      snippet: `View the professional profile of ${name}, ${title} at ${company}. Experience includes senior leadership roles, managing a team of ${companyEmployeeCount || 10} staff, and growing business operations.`,
    });
  }

  sourceResults.push({
    title: `${company} Announces New Initiatives led by ${name}`,
    url: `https://www.prnewswire.com/news-releases/${encodeURIComponent(company.toLowerCase().replaceAll(" ", "-"))}-executive`,
    snippet: `${company}, a leading firm under the leadership of ${name}, has expanded its market reach. ${name} discussed the company's recent achievements and employee growth to ${companyEmployeeCount || 50} staff.`,
  });

  sourceResults.push({
    title: `${name} (@${name.toLowerCase().replaceAll(" ", "")}) / Twitter/X`,
    url: `https://twitter.com/${name.toLowerCase().replaceAll(" ", "")}`,
    snippet: `The latest tweets from ${name}. Bestselling author, leader and speaker. Verified account with ${(largestSocialFollowerCount / 1000).toFixed(0)}K followers on Twitter/X and LinkedIn.`,
  });

  const prominenceNotes = buildProminenceNotes(sourceResults);
  const prominenceSignalsJson = buildProminenceSignalsJson({
    ...interview,
    companyEmployeeCount,
    companyRevenueUsd,
    largestSocialFollowerCount,
    results: sourceResults,
    provider: "simulated_search_provider",
  });

  const assessment = assessInterviewProminence({
    ...interview,
    companyEmployeeCount,
    companyRevenueUsd,
    largestSocialFollowerCount,
    prominenceNotes,
    prominenceSignalsJson,
  });

  return {
    companyEmployeeCount,
    companyRevenueUsd,
    largestSocialFollowerCount,
    prominenceNotes,
    prominenceSignalsJson,
    sourceResults,
    assessment,
    provider: "simulated_search_provider",
    fallbackUsed: false,
    providerErrors: [],
    isSimulated: true,
  };
}
