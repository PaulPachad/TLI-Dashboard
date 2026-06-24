"use client";

// ==============================================================================
// Interview Grid — Displays all interview cards with search and filters
// ==============================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { InterviewCard } from "./interview-card";
import { ActionModal } from "./action-modal";
import { InterviewDetailPanel } from "@/components/panels/interview-detail-panel";
import type {
  InterviewActionType,
  InterviewView,
} from "@/types/interview";

interface InterviewGridProps {
  clientId?: string;
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "new", label: "New" },
  { value: "needs_contact", label: "Needs Contact" },
  { value: "email_sent", label: "Email Sent" },
  { value: "shared", label: "Shared" },
  { value: "leveraged", label: "Leveraged" },
  { value: "dismissed", label: "Dismissed" },
];

const QUIET_SCAN_LIMIT = 1;
const PAGE_SIZE = 120;
const DISMISSED_STORAGE_KEY = "tli-dismissed-interviews";

type NoticeTone = "success" | "warning" | "loading";

interface DashboardNotice {
  message: string;
  tone: NoticeTone;
}

interface ResearchFeedback {
  interviewId: string;
  message: string;
  tone: "success" | "warning";
}

interface SearchDiagnostics {
  hasGeminiSearch?: boolean;
  hasGoogleCustomSearch?: boolean;
  vercelEnv?: string | null;
  gitBranch?: string | null;
  gitCommit?: string | null;
}

interface ProminenceResponse {
  code?: string;
  error?: string;
  note?: string;
  diagnostics?: SearchDiagnostics;
  simulated?: boolean;
  fallbackUsed?: boolean;
  hasSavedResearch?: boolean;
}

interface InterviewPagination {
  totalCount: number;
  offset: number;
  limit: number;
  returned: number;
  hasMore: boolean;
}

type DetailFocusTarget = "sources";

export function InterviewGrid({ clientId }: InterviewGridProps) {
  const [interviews, setInterviews] = useState<InterviewView[]>([]);
  const [pagination, setPagination] = useState<InterviewPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeAction, setActiveAction] =
    useState<InterviewActionType | null>(null);
  const [activeInterviewId, setActiveInterviewId] = useState<string | null>(null);
  const [researchingId, setResearchingId] = useState<string | null>(null);
  const [researchFeedback, setResearchFeedback] =
    useState<ResearchFeedback | null>(null);
  const [notice, setNotice] = useState<DashboardNotice | null>(null);
  const [activeDetail, setActiveDetail] = useState<{
    interviewId: string;
    focus?: DetailFocusTarget;
  } | null>(null);
  const quietScanStarted = useRef(false);

  // --- Dismissed cards state (localStorage) ---
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed)) {
          setDismissedIds(new Set(parsed));
        }
      }
    } catch {
      // Ignore malformed localStorage data
    }
  }, []);

  const persistDismissed = useCallback((ids: Set<string>) => {
    setDismissedIds(ids);
    try {
      localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...ids]));
    } catch {
      // localStorage full or unavailable — state still works in memory
    }
  }, []);

  const dismissCard = useCallback((id: string) => {
    persistDismissed(new Set([...dismissedIds, id]));
  }, [dismissedIds, persistDismissed]);

  const restoreCard = useCallback((id: string) => {
    const next = new Set(dismissedIds);
    next.delete(id);
    persistDismissed(next);
  }, [dismissedIds, persistDismissed]);

  const restoreAll = useCallback(() => {
    persistDismissed(new Set());
  }, [persistDismissed]);

  const fetchInterviews = useCallback(async ({
    append = false,
    offset = 0,
  }: {
    append?: boolean;
    offset?: number;
  } = {}) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (clientId) params.set("clientId", clientId);
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));

      const res = await fetch(`/api/interviews?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load interviews.");
      }

      const data = await res.json();
      const nextInterviews = data.interviews || [];
      setInterviews((current) =>
        append ? [...current, ...nextInterviews] : nextInterviews
      );
      setPagination(data.pagination || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interviews.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [clientId, search, statusFilter]);

  useEffect(() => {
    // Fetching is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInterviews();
  }, [fetchInterviews]);

  useEffect(() => {
    const queuedInterviewIds = interviews
      .filter(shouldQuietScanProminence)
      .slice(0, QUIET_SCAN_LIMIT)
      .map((interview) => interview.id);

    if (
      quietScanStarted.current ||
      loading ||
      error ||
      queuedInterviewIds.length === 0
    ) {
      return;
    }

    quietScanStarted.current = true;
    let cancelled = false;

    void (async () => {
      const res = await fetch("/api/interviews/prominence/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          limit: queuedInterviewIds.length,
          interviewIds: queuedInterviewIds,
        }),
      });

      if (cancelled) return;

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ProminenceResponse;
        console.error(`[Quiet VIP Scan Failure] HTTP ${res.status}: ${data.error || "Unknown error"}`);
        
        if (res.status === 503 || isStandoutCostControlCode(data.code)) {
          setNotice({
            tone: "warning",
            message: `Quiet Standout scan was skipped: ${data.error || "Search is not configured."}`,
          });
        }
        return;
      }

      const data = (await res.json()) as { updated?: number; failed?: number; scanned?: number };
      console.log(
        `[Quiet VIP Scan] Complete. Scanned: ${data.scanned || 0}, Updated: ${data.updated || 0}, Failed: ${data.failed || 0}`
      );

      if (data.updated && data.updated > 0) {
        await fetchInterviews();
      }
    })().catch((scanError) => {
      console.error("[Quiet VIP Scan Exception] Unexpected error:", scanError);
    });

    return () => {
      cancelled = true;
    };
  }, [clientId, error, fetchInterviews, interviews, loading]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Auto-dismiss success notices
  useEffect(() => {
    if (!notice || notice.tone === "loading" || notice.tone === "warning") return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!researchFeedback) return;
    const timer = setTimeout(() => setResearchFeedback(null), 12000);
    return () => clearTimeout(timer);
  }, [researchFeedback]);

  const researchProminence = async (interviewId: string) => {
    try {
      setResearchingId(interviewId);
      const name = interviews.find((i) => i.id === interviewId)?.intervieweeName || "this guest";
      setNotice({
        tone: "loading",
        message: `Researching standout signals for ${name}...`,
      });
      setResearchFeedback(null);
      setError(null);

      const res = await fetch(`/api/interviews/${interviewId}/prominence`, {
        method: "POST",
      });
      const data = (await res.json()) as ProminenceResponse;
      if (!res.ok) {
        if (data.code === "GOOGLE_SEARCH_NOT_CONFIGURED") {
          setNotice({
            tone: "warning",
            message: formatSearchConfigNotice(data),
          });
          setResearchFeedback({
            interviewId,
            tone: "warning",
            message: "Search setup needs attention. See the notification for details.",
          });
          return;
        }

        if (isStandoutCostControlCode(data.code)) {
          setNotice({
            tone: "warning",
            message: data.error || "Standout research is paused to control cost.",
          });
          setResearchFeedback({
            interviewId,
            tone: "warning",
            message: "Research paused for cost control. Existing signals are still saved.",
          });
          return;
        }

        if (data.code === "SEARCH_PROVIDER_FALLBACK_FAILED") {
          setNotice({
            tone: "warning",
            message:
              data.error ||
              "Standout research could not finish with the configured search providers.",
          });
          setResearchFeedback({
            interviewId,
            tone: "warning",
            message: data.hasSavedResearch
              ? "Refresh could not finish yet. Existing signals are still saved."
              : "Backup search is not configured or is temporarily unavailable.",
          });
          return;
        }

        throw new Error(data.error || "Standout research failed.");
      }

      setNotice({
        tone: data.simulated ? "warning" : "success",
        message: data.note || "Standout research complete.",
      });
      setResearchFeedback({
        interviewId,
        tone: data.simulated ? "warning" : "success",
        message: data.note || "Standout research complete.",
      });
      await fetchInterviews();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Standout research failed.";
      setNotice({
        tone: "warning",
        message,
      });
      setResearchFeedback({
        interviewId,
        tone: "warning",
        message,
      });
    } finally {
      setResearchingId(null);
    }
  };

  // Helper to determine if an interview is unpublished
  const isUnpublished = (interview: InterviewView) => {
    return interview.articleUrl.includes("/unpublished/") || 
           interview.liveEmailStatusImported?.toUpperCase() !== "LIVE";
  };

  // Stats
  const dismissedCount = interviews.filter((i) => dismissedIds.has(i.id)).length;
  const nonDismissed = interviews.filter((i) => !dismissedIds.has(i.id));
  const stats = {
    total: pagination?.totalCount ?? interviews.length,
    upcoming: nonDismissed.filter(isUnpublished).length,
    needsAction: nonDismissed.filter((interview) => !isUnpublished(interview) && interview.currentStatus !== "leveraged").length,
    leveraged: nonDismissed.filter((interview) => interview.currentStatus === "leveraged").length,
    needsContact: nonDismissed.filter((interview) => interview.currentStatus === "needs_contact").length,
    signalsFound: nonDismissed.filter(
      (interview) => interview.prominence?.hasAnySignals
    ).length,
  };

  // Sort interviews so that actionable ones are at the top, then upcoming, then leveraged.
  // Also apply dismissed filtering here.
  const isDismissedView = statusFilter === "dismissed";
  const filteredByDismissed = isDismissedView
    ? [...interviews].filter((i) => dismissedIds.has(i.id))
    : [...interviews].filter((i) => !dismissedIds.has(i.id));
  const sortedInterviews = filteredByDismissed.sort((a, b) => {
    const getScore = (interview: InterviewView) => {
      if (interview.currentStatus === "leveraged") return 3; // Lowest priority
      if (isUnpublished(interview)) return 2; // Medium priority
      return 1; // Highest priority (Needs Action / Live)
    };
    const workflowSort = getScore(a) - getScore(b);
    if (workflowSort !== 0) return workflowSort;

    return getProminenceSortScore(b) - getProminenceSortScore(a);
  });
  const activeDetailInterview = activeDetail
    ? interviews.find((interview) => interview.id === activeDetail.interviewId)
    : null;

  return (
    <div className="space-y-6">
      {notice && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in max-w-sm pointer-events-auto">
          <div
            role="status"
            className={`flex items-start justify-between gap-4 rounded-xl border p-4 shadow-xl text-sm ${
              notice.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : notice.tone === "loading"
                ? "border-indigo-200 bg-indigo-50 text-indigo-900 animate-pulse-subtle"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <div className="flex-1">
              {notice.tone === "loading" && (
                <span className="inline-block mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-700 border-t-transparent vertical-align-middle align-middle" />
              )}
              <span>{notice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className={`font-semibold shrink-0 ${
                notice.tone === "warning"
                  ? "text-amber-800 hover:text-amber-950"
                  : notice.tone === "loading"
                  ? "text-indigo-800 hover:text-indigo-950"
                  : "text-emerald-700 hover:text-emerald-900"
              }`}
              aria-label="Dismiss notification"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {/* Stats bar */}
      <div
        data-tour="interview-stats"
        className="grid grid-cols-2 lg:grid-cols-6 gap-4"
      >
        <StatCard label="Total Interviews" value={stats.total} color="indigo" />
        <StatCard label="Upcoming" value={stats.upcoming} color="sky" />
        <StatCard label="Needs Action" value={stats.needsAction} color="amber" />
        <StatCard label="Fully Leveraged" value={stats.leveraged} color="emerald" />
        <StatCard label="Needs Contact" value={stats.needsContact} color="rose" />
        <StatCard label="Signals Found" value={stats.signalsFound} color="violet" />
        {dismissedCount > 0 && (
          <StatCard label="Dismissed" value={dismissedCount} color="slate" />
        )}
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id="interview-search"
            type="text"
            placeholder="Search by name, topic, or company..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       placeholder:text-slate-400 transition-shadow"
          />
        </div>

        <div
          data-tour="interview-filters"
          className="flex gap-1.5 overflow-x-auto pb-1"
        >
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              id={`filter-${filter.value}`}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === filter.value
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Restore All button (visible only in Dismissed tab) */}
      {isDismissedView && dismissedCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-600">
            {dismissedCount} dismissed interview{dismissedCount !== 1 ? "s" : ""}
          </p>
          <button
            type="button"
            onClick={restoreAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 hover:border-emerald-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
            Restore All
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-200 rounded w-1/2" />
                  <div className="h-5 bg-slate-200 rounded w-16" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-3 bg-slate-200 rounded w-full" />
                <div className="h-3 bg-slate-200 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center">
          <p className="text-rose-700 font-medium">{error}</p>
          <button
            onClick={() => fetchInterviews()}
            className="mt-3 px-4 py-2 bg-rose-600 text-white rounded-lg text-sm hover:bg-rose-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && pagination && pagination.totalCount > PAGE_SIZE && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Showing {interviews.length} of {pagination.totalCount} interview(s).
          Use search or filters to narrow the list, or load more when needed.
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && interviews.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No interviews yet</h3>
          <p className="text-slate-500 max-w-sm mx-auto">
            {search
              ? "No interviews match your search. Try different keywords."
              : "No interviews have been imported yet. Use the Google Sheet importer above to add them."}
          </p>
        </div>
      )}

      {/* Interview cards grid */}
      {!loading && !error && sortedInterviews.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sortedInterviews.map((interview) => (
            <InterviewCard
              key={interview.id}
              interview={interview}
              onAction={(id, action) => {
                setActiveInterviewId(id);
                setActiveAction(action);
              }}
              onResearchProminence={researchProminence}
              onViewDetails={(id, options) =>
                setActiveDetail({
                  interviewId: id,
                  focus: options?.focus,
                })
              }
              researchingProminence={researchingId === interview.id}
              researchDisabled={
                researchingId !== null && researchingId !== interview.id
              }
              researchFeedback={
                researchFeedback?.interviewId === interview.id
                  ? {
                      tone: researchFeedback.tone,
                      message: researchFeedback.message,
                    }
                  : undefined
              }
              autoScanQueued={shouldQuietScanProminence(interview)}
              onDismiss={dismissCard}
              onRestore={restoreCard}
              showRestoreMode={isDismissedView}
            />
          ))}
        </div>
      )}

      {!loading && !error && pagination?.hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() =>
              fetchInterviews({
                append: true,
                offset: pagination.offset + pagination.limit,
              })
            }
            disabled={loadingMore}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}

      {/* Action modal */}
      {activeAction && activeInterviewId && (
        <ActionModal
          interviewId={activeInterviewId}
          actionType={activeAction}
          onClose={() => {
            setActiveAction(null);
            setActiveInterviewId(null);
          }}
          onSuccess={(message) => {
            if (message) setNotice({ tone: "success", message });
            fetchInterviews();
          }}
        />
      )}

      {activeDetail && activeDetailInterview && (
        <InterviewDetailPanel
          interview={activeDetailInterview}
          initialFocus={activeDetail.focus}
          onClose={() => setActiveDetail(null)}
        />
      )}
    </div>
  );
}

function formatSearchConfigNotice(data: ProminenceResponse) {
  const base =
    data.error ||
    "Standout research needs a Gemini or Google Search API key before it can run.";

  if (!data.diagnostics) return base;

  const diagnostics = data.diagnostics;
  const details = [
    `Gemini key: ${diagnostics.hasGeminiSearch ? "yes" : "no"}`,
    `Google Custom Search: ${
      diagnostics.hasGoogleCustomSearch ? "yes" : "no"
    }`,
    `Vercel env: ${diagnostics.vercelEnv || "unknown"}`,
    diagnostics.gitBranch ? `branch: ${diagnostics.gitBranch}` : null,
    diagnostics.gitCommit ? `commit: ${diagnostics.gitCommit}` : null,
  ].filter(Boolean);

  return `${base} Diagnostics: ${details.join("; ")}.`;
}

function isStandoutCostControlCode(code: string | undefined) {
  return Boolean(code && code.startsWith("STANDOUT_"));
}

function shouldQuietScanProminence(interview: InterviewView) {
  const hasStoredSignal =
    interview.companyEmployeeCount !== null &&
    interview.companyEmployeeCount !== undefined;
  const hasStoredRevenue =
    interview.companyRevenueUsd !== null &&
    interview.companyRevenueUsd !== undefined;
  const hasStoredAudience =
    interview.largestSocialFollowerCount !== null &&
    interview.largestSocialFollowerCount !== undefined;
  const hasStoredNotes = Boolean(interview.prominenceNotes?.trim());
  const hasStructuredSignals = Boolean(interview.prominenceSignalsJson?.trim());
  const alreadyResearched = interview.actions.some(
    (action) => action.actionType === "PROMINENCE_RESEARCHED"
  );

  if (!hasStructuredSignals) return true;

  return (
    !alreadyResearched &&
    !hasStoredSignal &&
    !hasStoredRevenue &&
    !hasStoredAudience &&
    !hasStoredNotes
  );
}

function getProminenceSortScore(interview: InterviewView) {
  const prominence = interview.prominence;
  if (!prominence) return 0;
  if (prominence.frontFlag) return 3;
  if (
    prominence.signalGroups.audience.length > 0 ||
    prominence.signalGroups.company.length > 0
  ) {
    return 2;
  }
  if (prominence.hasAnySignals) return 1;
  return 0;
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color] || colorClasses.indigo}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-75 mt-0.5">{label}</p>
    </div>
  );
}
