"use client";

import { useState } from "react";

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSync() {
    try {
      setSyncing(true);
      setError(null);
      setSuccess(false);

      const [resInterviews, resTopics] = await Promise.all([
        fetch("/api/sync", { method: "POST" }),
        fetch("/api/sync-topics", { method: "POST" }),
      ]);

      const dataInterviews = await resInterviews.json();
      const dataTopics = await resTopics.json();

      if (!resInterviews.ok) {
        throw new Error(dataInterviews.error || "Failed to sync interviews.");
      }
      
      if (!resTopics.ok) {
        throw new Error(dataTopics.error || "Failed to sync topics/events.");
      }

      setSuccess(true);
      // Wait a moment so the user sees the success state, then refresh
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync sheet.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        id="sync-sheet-button"
        onClick={handleSync}
        disabled={syncing}
        className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all duration-200 shadow-sm ${
          success
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : syncing
            ? "border-indigo-100 bg-indigo-50/50 text-indigo-400 cursor-not-allowed"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100"
        }`}
      >
        {success ? (
          <>
            <svg
              className="w-4 h-4 text-emerald-600 animate-bounce"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Synced!
          </>
        ) : syncing ? (
          <>
            <svg
              className="w-4 h-4 text-indigo-500 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Syncing...
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4 text-slate-500 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            Sync Sheet
          </>
        )}
      </button>

      {error && (
        <span className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2 py-1 max-w-[240px] text-right truncate">
          {error}
        </span>
      )}
    </div>
  );
}
