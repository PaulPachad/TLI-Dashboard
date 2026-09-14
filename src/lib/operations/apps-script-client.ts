import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export type AppsScriptOperationAction =
  | "health_check"
  | "get_status"
  | "list_clients_summary";

export interface AppsScriptRequestedBy {
  userId: string;
  email: string;
}

export interface AppsScriptOperationRequest {
  requestId: string;
  timestamp: string;
  action: AppsScriptOperationAction;
  payload: Record<string, unknown>;
  requestedBy: AppsScriptRequestedBy;
  signature: string;
}

export interface AppsScriptHealthStatus {
  ok?: boolean;
  scriptName?: string;
  version?: string;
  environment?: string;
  deployedAt?: string | null;
}

export interface AppsScriptOperationsStatus {
  ok?: boolean;
  scriptName?: string;
  version?: string;
  environment?: string;
  deployedAt?: string | null;
  workflowMode?: string | null;
  report?: {
    active?: boolean;
    sent?: boolean;
    runId?: string | null;
    recipient?: string | null;
    startedAt?: string | null;
    liveEmails?: number;
    followUps?: number;
    failedLiveEmails?: number;
    totalRows?: number;
  };
  quota?: {
    pausedUntil?: string | null;
    remainingDailyQuota?: number | null;
  };
  triggers?: {
    liveEmailQueue?: boolean;
    followUpQueue?: boolean;
    dashboardQueue?: boolean;
  };
  counts?: {
    pendingLiveEmailWork?: number;
    clients?: number;
  };
  errors?: Array<{
    id?: string;
    severity?: string;
    category?: string;
    label?: string;
    count?: number;
    detail?: string;
  }>;
}

export interface AppsScriptClientsSummaryResponse {
  ok?: boolean;
  clients?: Array<{
    id?: string;
    clientName?: string;
    masterRow?: string;
    managedBy?: string;
    dueDate?: string | null;
    unpublishedCount?: number;
    lastUpdated?: string | null;
    status?: string;
    statusLabel?: string;
    sheetTitle?: string | null;
    sheetUrl?: string | null;
  }>;
}

export interface AppsScriptClientConfig {
  url: string;
  secret: string;
  timeoutMs?: number;
}

export interface AppsScriptClient {
  call<T>(
    action: AppsScriptOperationAction,
    payload?: Record<string, unknown>,
    requestedBy?: AppsScriptRequestedBy
  ): Promise<T>;
}

const DEFAULT_TIMEOUT_MS = 10000;

export function getAppsScriptClientConfig(
  env: Record<string, string | undefined> = process.env
): AppsScriptClientConfig | null {
  const url = env.APPS_SCRIPT_AUTOMATION_URL?.trim();
  const secret = env.APPS_SCRIPT_AUTOMATION_SECRET?.trim();
  if (!url || !secret) return null;
  return {
    url,
    secret,
    timeoutMs: parsePositiveInt(env.APPS_SCRIPT_AUTOMATION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

export function createAppsScriptClient(config: AppsScriptClientConfig): AppsScriptClient {
  return {
    async call<T>(
      action: AppsScriptOperationAction,
      payload: Record<string, unknown> = {},
      requestedBy: AppsScriptRequestedBy = { userId: "saas-server", email: "server" }
    ) {
      const body = signAppsScriptRequest(
        {
          requestId: randomUUID(),
          timestamp: new Date().toISOString(),
          action,
          payload,
          requestedBy,
        },
        config.secret
      );

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.timeoutMs || DEFAULT_TIMEOUT_MS
      );

      try {
        const response = await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await response.text();
        const json = text ? JSON.parse(text) : {};
        if (!response.ok || json?.ok === false) {
          throw new Error(
            String(json?.message || json?.error || `Apps Script returned ${response.status}`)
          );
        }
        return json as T;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function signAppsScriptRequest(
  request: Omit<AppsScriptOperationRequest, "signature">,
  secret: string
): AppsScriptOperationRequest {
  return {
    ...request,
    signature: createAppsScriptSignature(request, secret),
  };
}

export function createAppsScriptSignature(
  value: Omit<AppsScriptOperationRequest, "signature">,
  secret: string
) {
  return createHmac("sha256", secret)
    .update(canonicalJson(value), "utf8")
    .digest("base64url");
}

export function verifyAppsScriptSignature(
  request: AppsScriptOperationRequest,
  secret: string
) {
  const { signature, ...unsigned } = request;
  const expected = Buffer.from(createAppsScriptSignature(unsigned, secret));
  const actual = Buffer.from(signature || "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}
