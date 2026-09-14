import { db } from "@/lib/db";
import {
  AppsScriptClientsSummaryResponse,
  AppsScriptOperationsStatus,
  createAppsScriptClient,
  getAppsScriptClientConfig,
} from "@/lib/operations/apps-script-client";

export type OperationsStatus = "ready" | "attention" | "blocked" | "unknown";
export type OperationsRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_issues"
  | "failed"
  | "blocked"
  | "unknown";

export interface OperationsHealthCard {
  key: string;
  label: string;
  status: OperationsStatus;
  value: string;
  detail: string;
}

export interface OperationsRunSummary {
  id: string;
  type: string;
  requestedBy: string;
  startedAt: string | null;
  completedAt: string | null;
  status: OperationsRunStatus;
  counts: {
    sent: number;
    followUps: number;
    skipped: number;
    failed: number;
  };
  source: string;
}

export interface OperationsClientSummary {
  id: string;
  clientName: string;
  masterRow: string;
  managedBy: string;
  dueDate: string | null;
  unpublishedCount: number;
  lastUpdated: string | null;
  status: OperationsStatus;
  statusLabel: string;
  sheetTitle: string | null;
  sheetUrl: string | null;
}

export interface OperationsErrorSummary {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  category: string;
  label: string;
  count: number;
  detail: string;
}

export interface OperationsBridgeSetup {
  urlConfigured: boolean;
  secretConfigured: boolean;
  ready: boolean;
  bridgeFile: string;
}

export interface OperationsSnapshot {
  generatedAt: string;
  environment: string;
  appsScript: {
    connected: boolean;
    version: string;
    statusLabel: string;
    projectUrl: string | null;
    setup: OperationsBridgeSetup;
  };
  healthCards: OperationsHealthCard[];
  recentRuns: OperationsRunSummary[];
  clients: OperationsClientSummary[];
  errors: OperationsErrorSummary[];
  partialDataMessage: string | null;
}

const APPS_SCRIPT_PROJECT_URL =
  "https://script.google.com/u/0/home/projects/1FDuqq-d8B0DCMgpRjD2hv2SWAJr3ndZe9lO2QQYFOZwqibdpm6v_2K8d/edit";

type EnvLike = Record<string, string | undefined>;

export function getOperationsEnvironment(env: EnvLike = process.env) {
  if (env.NEXT_PUBLIC_DEMO_MODE === "true" || env.DEMO_MODE === "true") {
    return "Local demo";
  }
  if (env.VERCEL_ENV === "production" || env.NODE_ENV === "production") {
    return "Production";
  }
  if (env.VERCEL_ENV === "preview") return "Preview";
  return "Local";
}

export function hasAppsScriptReadEndpoint(env: EnvLike = process.env) {
  return Boolean(env.APPS_SCRIPT_AUTOMATION_URL?.trim() && env.APPS_SCRIPT_AUTOMATION_SECRET?.trim());
}

export function getAppsScriptBridgeSetup(env: EnvLike = process.env): OperationsBridgeSetup {
  const urlConfigured = Boolean(env.APPS_SCRIPT_AUTOMATION_URL?.trim());
  const secretConfigured = Boolean(env.APPS_SCRIPT_AUTOMATION_SECRET?.trim());
  return {
    urlConfigured,
    secretConfigured,
    ready: urlConfigured && secretConfigured,
    bridgeFile: "docs/apps-script/operations-bridge.gs",
  };
}

export function mapOperationsRunStatus(status: string | null | undefined): OperationsRunStatus {
  const normalized = String(status || "").trim().toUpperCase();
  if (["QUEUED", "PENDING"].includes(normalized)) return "queued";
  if (["RUNNING", "IN_PROGRESS", "STARTED"].includes(normalized)) return "running";
  if (["SUCCESS", "COMPLETE", "COMPLETED"].includes(normalized)) return "completed";
  if (["PARTIAL", "COMPLETED_WITH_ISSUES", "WARNING"].includes(normalized)) {
    return "completed_with_issues";
  }
  if (["FAILED", "ERROR"].includes(normalized)) return "failed";
  if (["BLOCKED", "PAUSED"].includes(normalized)) return "blocked";
  return "unknown";
}

export function getOperationsStatusLabel(status: OperationsStatus) {
  if (status === "ready") return "Ready";
  if (status === "attention") return "Needs attention";
  if (status === "blocked") return "Blocked";
  return "Unknown";
}

export async function getOperationsSnapshot(): Promise<OperationsSnapshot> {
  const [clients, recentAutomationRuns, appsScriptResult] = await Promise.all([
    getOperationsClients(),
    getExistingAutomationRunShell(),
    getAppsScriptOperationsStatusSafe(),
  ]);

  const appsScriptConfigured = hasAppsScriptReadEndpoint();
  const appsScriptSetup = getAppsScriptBridgeSetup();
  const appsScriptStatus = appsScriptResult.status;
  const appsScriptConnected = Boolean(appsScriptStatus?.ok);
  const recentRuns = appsScriptStatus
    ? [mapAppsScriptReportToRun(appsScriptStatus), ...recentAutomationRuns].filter(isOperationsRunSummary)
    : [];
  const errors = getOperationsErrors(appsScriptConfigured, appsScriptStatus, appsScriptResult.error);

  return {
    generatedAt: new Date().toISOString(),
    environment: getOperationsEnvironment(),
    appsScript: {
      connected: appsScriptConnected,
      version: appsScriptStatus?.version || "Unknown",
      statusLabel: getAppsScriptStatusLabel(appsScriptConfigured, appsScriptStatus, appsScriptResult.error),
      projectUrl: APPS_SCRIPT_PROJECT_URL,
      setup: appsScriptSetup,
    },
    healthCards: buildOperationsHealthCards(appsScriptConfigured, appsScriptStatus, errors.length),
    recentRuns,
    clients,
    errors,
    partialDataMessage: getPartialDataMessage(appsScriptConfigured, appsScriptStatus, appsScriptResult.error),
  };
}

export async function getOperationsClients(): Promise<OperationsClientSummary[]> {
  const appsScriptClients = await getAppsScriptClientsSafe();
  if (appsScriptClients) return appsScriptClients;
  return getLocalOperationsClients();
}

async function getLocalOperationsClients(): Promise<OperationsClientSummary[]> {
  const clients = await db.client.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      topicsSheetUrl: true,
      updatedAt: true,
      sheetSources: {
        select: {
          sheetTitle: true,
          sheetUrl: true,
          lastSyncedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          interviews: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return clients.map((client) => {
    const source = client.sheetSources[0] || null;
    const lastUpdated = source?.lastSyncedAt || client.updatedAt;
    return {
      id: client.id,
      clientName: client.name,
      masterRow: "Not linked",
      managedBy: client.email,
      dueDate: null,
      unpublishedCount: client._count.interviews,
      lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
      status: source ? "ready" : "attention",
      statusLabel: source ? "Sheet imported" : "No sheet source",
      sheetTitle: source?.sheetTitle || null,
      sheetUrl: source?.sheetUrl || client.topicsSheetUrl || null,
    };
  });
}

async function getExistingAutomationRunShell(): Promise<OperationsRunSummary[]> {
  const runs = await db.automationRun.findMany({
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      draftsCreated: true,
      skippedCount: true,
      errorCount: true,
      mailbox: {
        select: {
          label: true,
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return runs.map((run) => ({
    id: run.id,
    type: run.mailbox?.label || "Automation bridge run",
    requestedBy: "Automation bridge",
    startedAt: run.startedAt.toISOString(),
    completedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    status: mapOperationsRunStatus(run.status),
    counts: {
      sent: run.draftsCreated,
      followUps: 0,
      skipped: run.skippedCount,
      failed: run.errorCount,
    },
    source: "SaaS automation bridge",
  }));
}

function getOperationsErrorShell(appsScriptConnected: boolean): OperationsErrorSummary[] {
  if (appsScriptConnected) return [];
  return [
    {
      id: "apps-script-not-connected",
      severity: "warning",
      category: "apps_script_status",
      label: "Apps Script status unavailable",
      count: 1,
      detail:
        "The signed Apps Script read-only bridge has not been connected, so live quota, report, Shopify, and row-level issues are not visible here yet.",
    },
  ];
}

async function getAppsScriptClientsSafe(): Promise<OperationsClientSummary[] | null> {
  const config = getAppsScriptClientConfig();
  if (!config) return null;

  try {
    const client = createAppsScriptClient(config);
    const response = await client.call<AppsScriptClientsSummaryResponse>("list_clients_summary");
    if (!Array.isArray(response.clients)) return null;
    return response.clients.map((item, index) => ({
      id: item.id || `apps-script-client-${index}`,
      clientName: item.clientName || "Unnamed master row",
      masterRow: item.masterRow || "Not available",
      managedBy: item.managedBy || "",
      dueDate: item.dueDate || null,
      unpublishedCount: Number.isFinite(item.unpublishedCount) ? Number(item.unpublishedCount) : 0,
      lastUpdated: item.lastUpdated || null,
      status: normalizeOperationsStatus(item.status),
      statusLabel: item.statusLabel || getOperationsStatusLabel(normalizeOperationsStatus(item.status)),
      sheetTitle: item.sheetTitle || null,
      sheetUrl: item.sheetUrl || null,
    }));
  } catch {
    return null;
  }
}

async function getAppsScriptOperationsStatusSafe(): Promise<{
  status: AppsScriptOperationsStatus | null;
  error: string | null;
}> {
  const config = getAppsScriptClientConfig();
  if (!config) return { status: null, error: null };

  try {
    const client = createAppsScriptClient(config);
    const status = await client.call<AppsScriptOperationsStatus>("get_status");
    return { status, error: null };
  } catch (error) {
    return {
      status: null,
      error: error instanceof Error ? error.message : "Apps Script status is unavailable.",
    };
  }
}

function buildOperationsHealthCards(
  appsScriptConfigured: boolean,
  status: AppsScriptOperationsStatus | null,
  openIssueCount: number
): OperationsHealthCard[] {
  const report = status?.report;
  const quotaPausedUntil = status?.quota?.pausedUntil || null;
  const isQuotaPaused = Boolean(quotaPausedUntil);
  const activeWorkflow = status?.workflowMode || "Idle";
  const liveQueue = Boolean(status?.triggers?.liveEmailQueue);
  const followUpQueue = Boolean(status?.triggers?.followUpQueue);
  const dashboardQueue = Boolean(status?.triggers?.dashboardQueue);

  return [
    {
      key: "daily-dashboard",
      label: "Daily Dashboard Updater",
      status: status ? (dashboardQueue ? "unknown" : "ready") : "attention",
      value: status ? (dashboardQueue ? "Queue active" : "Idle") : appsScriptConfigured ? "Unavailable" : "Not connected",
      detail: status
        ? `Workflow mode: ${activeWorkflow}.`
        : "The existing Apps Script updater remains available from Google Sheets.",
    },
    {
      key: "authority-press",
      label: "Authority Press Marketing",
      status: status ? (isQuotaPaused ? "blocked" : liveQueue || followUpQueue ? "unknown" : "ready") : "attention",
      value: status
        ? isQuotaPaused
          ? "Quota paused"
          : liveQueue || followUpQueue
            ? "Queue active"
            : "Idle"
        : "Read-only shell",
      detail: status
        ? `Live queue: ${liveQueue ? "active" : "idle"}. Follow-ups: ${followUpQueue ? "active" : "idle"}.`
        : "Email, Shopify, follow-up, and report actions are intentionally disabled until the read-only bridge is verified.",
    },
    {
      key: "reports",
      label: "Reports",
      status: status ? (report?.sent ? "ready" : report?.active ? "unknown" : "attention") : "attention",
      value: status
        ? report?.sent
          ? "Sent"
          : report?.active
            ? "In progress"
            : "No active run"
        : "Unavailable",
      detail: status
        ? `${report?.liveEmails || 0} live emails, ${report?.followUps || 0} follow-ups, ${report?.failedLiveEmails || 0} skipped/failed.`
        : "The Apps Script report sheet can become the source for sent/skipped/failed counts in Phase 2.",
    },
    {
      key: "error-queue",
      label: "Error Queue",
      status: openIssueCount > 0 ? "attention" : "ready",
      value: String(openIssueCount),
      detail: openIssueCount
        ? "Open operations notices are listed below."
        : "No open operations errors are visible from the SaaS.",
    },
  ];
}

function getAppsScriptStatusLabel(
  configured: boolean,
  status: AppsScriptOperationsStatus | null,
  error: string | null
) {
  if (status?.ok) return "Apps Script read-only bridge connected";
  if (configured && error) return "Apps Script read-only bridge unavailable";
  if (configured) return "Apps Script read-only bridge configured";
  return "Apps Script endpoint not connected";
}

function getPartialDataMessage(
  configured: boolean,
  status: AppsScriptOperationsStatus | null,
  error: string | null
) {
  if (status?.ok) return null;
  if (configured && error) {
    return "Apps Script status is configured but unavailable, so this page is showing SaaS client data and disabled operations controls only.";
  }
  return "Apps Script status is unavailable, so this page is showing SaaS client data and disabled operations controls only.";
}

function getOperationsErrors(
  configured: boolean,
  status: AppsScriptOperationsStatus | null,
  error: string | null
): OperationsErrorSummary[] {
  if (status?.errors?.length) {
    return status.errors.map((item, index) => ({
      id: item.id || `apps-script-error-${index}`,
      severity: normalizeSeverity(item.severity),
      category: item.category || "apps_script",
      label: item.label || "Apps Script notice",
      count: normalizeCount(item.count),
      detail: item.detail || "Apps Script reported an operations notice.",
    }));
  }

  if (configured && error) {
    return [
      {
        id: "apps-script-read-endpoint-error",
        severity: "warning",
        category: "apps_script_status",
        label: "Apps Script bridge unavailable",
        count: 1,
        detail: "The SaaS could not read Apps Script status. Check the web app deployment URL, shared secret, and deployment access.",
      },
    ];
  }

  return getOperationsErrorShell(Boolean(status?.ok));
}

function mapAppsScriptReportToRun(
  status: AppsScriptOperationsStatus
): OperationsRunSummary | null {
  const report = status.report;
  if (!report?.runId) return null;
  const skippedOrFailed = report.failedLiveEmails || 0;
  return {
    id: report.runId,
    type: "Authority Press marketing",
    requestedBy: report.recipient || "Apps Script",
    startedAt: report.startedAt || null,
    completedAt: report.sent ? new Date().toISOString() : null,
    status: report.sent
      ? skippedOrFailed > 0
        ? "completed_with_issues"
        : "completed"
      : report.active
        ? "running"
        : "unknown",
    counts: {
      sent: report.liveEmails || 0,
      followUps: report.followUps || 0,
      skipped: skippedOrFailed,
      failed: 0,
    },
    source: "Apps Script report sheet",
  };
}

function isOperationsRunSummary(
  value: OperationsRunSummary | null
): value is OperationsRunSummary {
  return Boolean(value);
}

function normalizeSeverity(value: string | undefined): OperationsErrorSummary["severity"] {
  if (value === "info" || value === "warning" || value === "error" || value === "critical") {
    return value;
  }
  return "warning";
}

function normalizeOperationsStatus(value: string | undefined): OperationsStatus {
  if (value === "ready" || value === "attention" || value === "blocked" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function normalizeCount(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? Math.round(value) : 1;
}
