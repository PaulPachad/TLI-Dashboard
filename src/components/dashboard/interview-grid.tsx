"use client";

// ==============================================================================
// Interview Grid — Displays all interview cards with search and filters
// ==============================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { InterviewCard } from "./interview-card";
import { InterviewDetailPanel } from "@/components/panels/interview-detail-panel";
import { ActionModal } from "./action-modal";
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
];

const PROMINENCE_PRIORITY: Record<string, number> = {
  elite: 3,
  high_value: 2,
  notable: 1,
  standard: 0,
};
const QUIET_SCAN_LIMIT = 6;

type NoticeTone = "success" | "warning";

interface DashboardNotice {
  message: string;
  tone: NoticeTone;
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
}

export function InterviewGrid({ clientId }: InterviewGridProps) {
  const [interviews, setInterviews] = useState<InterviewView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeAction, setActiveAction] =
    useState<InterviewActionType | null>(null);
  const [activeInterviewId, setActiveInterviewId] = useState<string | null>(null);
  const [researchingId, setResearchingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<DashboardNotice | null>(null);
  const quietScanStarted = useRef(false);

  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (clientId) params.set("clientId", clientId);
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/interviews?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load interviews.");
      }

      const data = await res.json();
      setInterviews(data.interviews || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interviews.");
    } finally {
      setLoading(false);
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

      if (!res.ok || cancelled) return;

      const data = (await res.json()) as { updated?: number };
      if (!cancelled && data.updated && data.updated > 0) {
        await fetchInterviews();
      }
    })().catch((scanError) => {
      console.warn("Quiet VIP scan skipped:", scanError);
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

  const selectedInterview = selectedId
    ? interviews.find((interview) => interview.id === selectedId)
    : null;

  const researchProminence = async (interviewId: string) => {
    try {
      setResearchingId(interviewId);
      setNotice(null);
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
          return;
        }

        throw new Error(data.error || "VIP research failed.");
      }

      setNotice({
        tone: "success",
        message: data.note || "VIP research complete.",
      });
      await fetchInterviews();
      if (selectedId === interviewId) {
        setSelectedId(null);
        setTimeout(() => setSelectedId(interviewId), 50);
      }
    } catch (err) {
      setNotice({
        tone: "warning",
        message: err instanceof Error ? err.message : "VIP research failed.",
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
  const stats = {
    total: interviews.length,
    upcoming: interviews.filter(isUnpublished).length,
    needsAction: interviews.filter((interview) => !isUnpublished(interview) && interview.currentStatus !== "leveraged").length,
    leveraged: interviews.filter((interview) => interview.currentStatus === "leveraged").length,
    needsContact: interviews.filter((interview) => interview.currentStatus === "needs_contact").length,
    spotlight: interviews.filter((interview) =>
      ["elite", "high_value"].includes(interview.prominence?.tier ?? "standard")
    ).length,
  };

  // Sort interviews so that actionable ones are at the top, then upcoming, then leveraged.
  const sortedInterviews = [...interviews].sort((a, b) => {
    const getScore = (interview: InterviewView) => {
      if (interview.currentStatus === "leveraged") return 3; // Lowest priority
      if (isUnpublished(interview)) return 2; // Medium priority
      return 1; // Highest priority (Needs Action / Live)
    };
    const workflowSort = getScore(a) - getScore(b);
    if (workflowSort !== 0) return workflowSort;

    return (
      (PROMINENCE_PRIORITY[b.prominence?.tier ?? "standard"] ?? 0) -
      (PROMINENCE_PRIORITY[a.prominence?.tier ?? "standard"] ?? 0)
    );
  });

  return (
    <div className="space-y-6">
      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className={`font-semibold ${
              notice.tone === "warning"
                ? "text-amber-800 hover:text-amber-950"
                : "text-emerald-700 hover:text-emerald-900"
            }`}
            aria-label="Dismiss notification"
          >
            Close
          </button>
        </div>
      )}
      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard label="Total Interviews" value={stats.total} color="indigo" />
        <StatCard label="Upcoming" value={stats.upcoming} color="sky" />
        <StatCard label="Needs Action" value={stats.needsAction} color="amber" />
        <StatCard label="Fully Leveraged" value={stats.leveraged} color="emerald" />
        <StatCard label="Needs Contact" value={stats.needsContact} color="rose" />
        <StatCard label="VIP Signals" value={stats.spotlight} color="violet" />
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

        <div className="flex gap-1.5 overflow-x-auto pb-1">
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
            onClick={fetchInterviews}
            className="mt-3 px-4 py-2 bg-rose-600 text-white rounded-lg text-sm hover:bg-rose-700 transition-colors"
          >
            Try Again
          </button>
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
              onViewDetails={(id) => setSelectedId(id)}
              onResearchProminence={researchProminence}
              researchingProminence={researchingId === interview.id}
              autoScanQueued={shouldQuietScanProminence(interview)}
            />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedInterview && (
        <InterviewDetailPanel
          interview={selectedInterview}
          onClose={() => setSelectedId(null)}
        />
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
            if (selectedId === activeInterviewId) {
              setSelectedId(null);
              setTimeout(() => setSelectedId(activeInterviewId), 50);
            }
          }}
        />
      )}
    </div>
  );
}

function formatSearchConfigNotice(data: ProminenceResponse) {
  const base =
    data.error ||
    "VIP research needs a Gemini or Google Search API key before it can run.";

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
  const alreadyResearched = interview.actions.some(
    (action) => action.actionType === "PROMINENCE_RESEARCHED"
  );

  return (
    !alreadyResearched &&
    !hasStoredSignal &&
    !hasStoredRevenue &&
    !hasStoredAudience &&
    !hasStoredNotes
  );
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
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color] || colorClasses.indigo}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-75 mt-0.5">{label}</p>
    </div>
  );
}
