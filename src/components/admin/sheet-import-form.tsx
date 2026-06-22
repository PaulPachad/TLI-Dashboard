"use client";

// ==============================================================================
// Sheet Import Form — Paste a Google Sheets URL and import interviews
// ==============================================================================

import { useState } from "react";
import { getSpreadsheetColumnLabel } from "@/lib/google-sheets/column-label";

interface ImportPreview {
  demoMode: boolean;
  sheetTitle: string;
  totalRows: number;
  published: number;
  unpublishedTotal?: number;
  skippedNoArticle: number;
  skippedInvalidArticle: number;
  skippedEmpty: number;
  previewLimit?: number;
  previewTruncated?: boolean;
  interviews: Array<{
    rowNumber: number;
    intervieweeName: string;
    topic: string | null;
    articleUrl: string;
    hasEmail: boolean;
    hasPublicist: boolean;
  }>;
  unpublished?: Array<{
    rowNumber: number;
    intervieweeName: string;
    topic: string | null;
    estimatedPublishDate: string | null;
    reason: string;
  }>;
  headerMappings?: Array<{
    field: string;
    matchedHeader: string;
    matchType: string;
    columnIndex: number;
  }>;
  unmappedHeaders?: string[];
}

interface SheetImportFormProps {
  clientId: string;
  initialTopicsSheetUrl?: string;
  onImportComplete?: () => void;
}

export function SheetImportForm({ clientId, initialTopicsSheetUrl, onImportComplete }: SheetImportFormProps) {
  const [sheetUrl, setSheetUrl] = useState("");
  const [importAll, setImportAll] = useState(false);
  const [topicsSheetUrl, setTopicsSheetUrl] = useState(initialTopicsSheetUrl || "");
  const [isSavingTopics, setIsSavingTopics] = useState(false);
  const [topicsSuccess, setTopicsSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    unchanged: number;
    duplicatesSkipped: number;
  } | null>(null);
  
  const [customMappings, setCustomMappings] = useState<Record<string, number>>({});
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [showMappingConfig, setShowMappingConfig] = useState(false);

  const previewInterviews = preview?.interviews ?? [];
  const unpublishedInterviews = preview?.unpublished ?? [];
  const unpublishedTotal = preview?.unpublishedTotal ?? unpublishedInterviews.length;
  const importableTotal = (preview?.published ?? 0) + unpublishedTotal;
  const headerMappings = preview?.headerMappings ?? [];
  const unmappedHeaders = preview?.unmappedHeaders ?? [];
  const errorGuidance = getImportRecoveryGuidance(error);

  async function handlePreview() {
    if (!sheetUrl.trim()) {
      setError("Please paste a Google Sheets URL.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setPreview(null);
      setImportResult(null);

      const res = await fetch("/api/import-google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, sheetUrl: sheetUrl.trim(), importAll, customMappings }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to read the sheet.");
        setWarnings(data.warnings || []);
        if (data.headers) {
          setSheetHeaders(data.headers);
          setShowMappingConfig(true);
        }
        return;
      }

      setPreview(data.preview || null);
      setError(data.error || null);
      setWarnings(data.warnings || []);
      
      if (data.headers) {
        setSheetHeaders(data.headers);
      }
      if (data.error && data.headers) {
        setShowMappingConfig(true);
      }
      if (data.preview?.headerMappings) {
        const initialMappings: Record<string, number> = {};
        for (const m of data.preview.headerMappings) {
          if (m.columnIndex !== undefined) {
            initialMappings[m.field] = m.columnIndex;
          }
        }
        setCustomMappings(initialMappings);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmImport() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/import-google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, sheetUrl: sheetUrl.trim(), confirm: true, importAll, customMappings }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Import failed.");
        return;
      }

      setImportResult(data.result);
      setPreview(null);
      onImportComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred during import.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveTopicsSheet() {
    try {
      setIsSavingTopics(true);
      setError(null);
      setTopicsSuccess(false);

      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicsSheetUrl: topicsSheetUrl.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save Topics sheet URL.");
        return;
      }

      // Trigger the sync right away
      if (topicsSheetUrl.trim()) {
        try {
          const syncRes = await fetch(`/api/sync-topics?clientId=${clientId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const syncData = await syncRes.json();
          if (!syncRes.ok) {
            setError(syncData.error || "Saved URL, but failed to sync topics/events.");
            setIsSavingTopics(false);
            return;
          }
        } catch (e) {
          console.error("Failed to trigger sync after saving topics sheet", e);
          setError("Saved URL, but failed to reach sync server.");
          setIsSavingTopics(false);
          return;
        }
      }
      
      setTopicsSuccess(true);
      setTimeout(() => setTopicsSuccess(false), 3000);
      onImportComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsSavingTopics(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* URL Inputs */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-8">
        
        {/* Interviews Sheet */}
        <div>
          <h3 className="font-semibold text-slate-900 mb-1">Import Interviews Sheet</h3>
          <p className="text-sm text-slate-500 mb-4">
            Paste the Interviews Google Sheets link. This will trigger a preview before importing.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="sheet-url-input"
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         placeholder:text-slate-400"
              disabled={loading}
            />
            <button
              id="preview-import-btn"
              onClick={handlePreview}
              disabled={loading || !sheetUrl.trim()}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium
                         hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Reading...
                </span>
              ) : (
                "Preview Import"
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <input
              id="import-all-checkbox"
              type="checkbox"
              checked={importAll}
              onChange={(e) => setImportAll(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              disabled={loading}
            />
            <label htmlFor="import-all-checkbox" className="text-xs font-medium text-slate-700 select-none">
              Import all entries (by default, sheets with more than 200 rows are limited to the last 100)
            </label>
          </div>

          {sheetHeaders.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowMappingConfig(!showMappingConfig)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-850 transition-colors inline-flex items-center gap-1 select-none"
              >
                {showMappingConfig ? (
                  <>
                    <span>Hide Column Configuration</span>
                    <span>▴</span>
                  </>
                ) : (
                  <>
                    <span>Customize Column Mappings</span>
                    <span>▾</span>
                  </>
                )}
              </button>
            </div>
          )}

          {showMappingConfig && sheetHeaders.length > 0 && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 animate-slide-up">
              <div>
                <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Configure Column Mappings</h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  If the system did not automatically detect the correct columns, or if you want to override them, select the columns manually:
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { field: "articleUrl", label: "Authority Magazine Link (Required)" },
                  { field: "intervieweeName", label: "Guest Name" },
                  { field: "intervieweeEmail", label: "Guest Email" },
                  { field: "topic", label: "Topic" },
                  { field: "estimatedPublishDate", label: "Estimated Publishing Date" },
                  { field: "liveEmailStatusImported", label: "Emailed Status (LIVE)" },
                  { field: "linkedinUrl", label: "LinkedIn URL" },
                  { field: "twitterUrl", label: "Twitter/X URL" },
                  { field: "videoUrl", label: "Video URL" },
                  { field: "interviewDocUrl", label: "Google Doc URL" },
                  { field: "publicistName", label: "Publicist Name" },
                  { field: "publicistEmail", label: "Publicist Email" },
                ].map(({ field, label }) => (
                  <div key={field} className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600 truncate">{label}</label>
                    <select
                      value={customMappings[field] !== undefined ? customMappings[field] : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomMappings((prev) => {
                          const next = { ...prev };
                          if (val === "") {
                            delete next[field];
                          } else {
                            next[field] = parseInt(val, 10);
                          }
                          return next;
                        });
                      }}
                      className="block w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white 
                                 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="">Auto-detect</option>
                      {sheetHeaders.map((header, idx) => (
                        <option key={idx} value={idx}>
                          Column {getSpreadsheetColumnLabel(idx)}: {header || "Blank header"}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={handlePreview}
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold
                             hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Update Preview
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100 w-full" />

        {/* Topics & Events Sheet */}
        <div>
          <h3 className="font-semibold text-slate-900 mb-1">Topics & Events Sheet</h3>
          <p className="text-sm text-slate-500 mb-4">
            Paste the parallel Topics & Events Google Sheets link. Saving this will automatically trigger a sync.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="topics-sheet-url-input"
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={topicsSheetUrl}
              onChange={(e) => setTopicsSheetUrl(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
                         placeholder:text-slate-400"
              disabled={isSavingTopics}
            />
            <button
              id="save-topics-btn"
              onClick={handleSaveTopicsSheet}
              disabled={isSavingTopics}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium
                         hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[140px]"
            >
              {isSavingTopics ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </span>
              ) : topicsSuccess ? (
                "Saved & Synced!"
              ) : (
                "Save & Sync"
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 rounded-xl p-4"
        >
          <p className="text-rose-700 text-sm font-medium">{error}</p>
          {errorGuidance && (
            <p className="mt-2 text-sm text-rose-600">{errorGuidance}</p>
          )}
          <button
            type="button"
            onClick={handlePreview}
            disabled={loading || !sheetUrl.trim()}
            className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Retry preview
          </button>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-50 border border-amber-200 rounded-xl p-4"
        >
          <h4 className="text-amber-700 text-sm font-semibold mb-2">Warnings</h4>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-amber-700 text-sm flex items-start gap-2">
                <span className="mt-1 text-amber-400">⚠</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {preview.demoMode && (
            <div className="border-b border-sky-200 bg-sky-50 px-6 py-3 text-sm text-sky-800">
              Demo mode is on. The Google Sheet data is real; email delivery is
              simulated.
            </div>
          )}
          <div className="p-6 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-3">Import Preview</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Sheet</p>
                <p className="font-semibold text-slate-900 truncate">{preview.sheetTitle}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Total Rows</p>
                <p className="font-semibold text-slate-900">{preview.totalRows}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs text-emerald-600">Published</p>
                <p className="font-semibold text-emerald-700">{preview.published}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-amber-600">Unpublished</p>
                <p className="font-semibold text-amber-700">{unpublishedTotal}</p>
              </div>
            </div>

            {preview.previewTruncated && (
              <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                Showing the first {preview.previewLimit ?? previewInterviews.length} preview rows so the browser stays fast.
                The full {importableTotal} interview(s) will still be imported when confirmed.
              </div>
            )}

            {/* Column mappings */}
            <div className="flex items-center justify-between mb-4">
              <details className="flex-1">
                <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700 select-none">
                  Column Mappings ({headerMappings.length} matched)
                </summary>
                <div className="mt-2 bg-slate-50 rounded-lg p-3 space-y-1">
                  {headerMappings.map((m, i) => (
                    <div key={i} className="text-xs flex items-center gap-2">
                      <span className="text-slate-500 w-16 shrink-0 font-mono">
                        Column {getSpreadsheetColumnLabel(m.columnIndex)}
                      </span>
                      <span className="text-slate-400 w-36 truncate">{m.matchedHeader}</span>
                      <span className="text-slate-300">→</span>
                      <span className="text-slate-700 font-medium">{m.field}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          m.matchType === "exact"
                            ? "bg-emerald-100 text-emerald-700"
                            : m.matchType === "alias"
                            ? "bg-blue-100 text-blue-700"
                            : m.matchType === "manual"
                            ? "bg-purple-100 text-purple-700 font-semibold"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {m.matchType}
                      </span>
                    </div>
                  ))}
                  {unmappedHeaders.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <p className="text-xs text-slate-400">
                        Unmapped: {unmappedHeaders.join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              </details>
              {sheetHeaders.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMappingConfig(!showMappingConfig);
                    document.getElementById("sheet-url-input")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors select-none"
                >
                  {showMappingConfig ? "Hide Config" : "Edit Mappings"}
                </button>
              )}
            </div>
          </div>

          {/* Interview list */}
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Row</th>
                  <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Interviewee</th>
                  <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Topic</th>
                  <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewInterviews.map((interview, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-400">{interview.rowNumber}</td>
                    <td className="px-4 py-2 text-slate-900 font-medium">{interview.intervieweeName}</td>
                    <td className="px-4 py-2 text-slate-600 truncate max-w-[200px]">
                      {interview.topic || "—"}
                    </td>
                    <td className="px-4 py-2">
                      {interview.hasEmail ? (
                        <span className="text-emerald-600 text-xs">✓ Yes</span>
                      ) : (
                        <span className="text-amber-600 text-xs">✗ Missing</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {unpublishedInterviews.length > 0 && (
            <div className="border-t border-slate-200">
              <div className="bg-amber-50 px-4 py-3">
                <h4 className="text-sm font-semibold text-amber-800">
                  Real rows not yet published
                </h4>
              </div>
              <div className="overflow-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Row</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Interviewee</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Topic</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Estimated Publish Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Why it cannot import</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {unpublishedInterviews.map((interview) => (
                      <tr key={interview.rowNumber}>
                        <td className="px-4 py-2 text-slate-400">{interview.rowNumber}</td>
                        <td className="px-4 py-2 font-medium text-slate-900">{interview.intervieweeName}</td>
                        <td className="max-w-[240px] truncate px-4 py-2 text-slate-600">
                          {interview.topic || "-"}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {interview.estimatedPublishDate || "-"}
                        </td>
                        <td className="px-4 py-2 text-amber-700">{interview.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Confirm button */}
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:justify-end">
            <button
              onClick={() => {
                setPreview(null);
                setWarnings([]);
              }}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              id="confirm-import-btn"
              onClick={handleConfirmImport}
              disabled={loading || importableTotal === 0}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium
                         hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading
                ? "Importing..."
                : importableTotal === 0
                  ? "No Interviews Found"
                  : `Import ${importableTotal} Interview(s)`}
            </button>
          </div>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
          <h3 className="font-semibold text-emerald-800 mb-2">✓ Import Complete</h3>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-emerald-600">Created</p>
              <p className="text-xl font-bold text-emerald-800">{importResult.created}</p>
            </div>
            <div>
              <p className="text-emerald-600">Updated</p>
              <p className="text-xl font-bold text-emerald-800">{importResult.updated}</p>
            </div>
            <div>
              <p className="text-emerald-600">Unchanged</p>
              <p className="text-xl font-bold text-emerald-800">{importResult.unchanged}</p>
            </div>
            <div>
              <p className="text-emerald-600">Duplicates Skipped</p>
              <p className="text-xl font-bold text-emerald-800">
                {importResult.duplicatesSkipped}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getImportRecoveryGuidance(error: string | null): string | null {
  if (!error) return null;
  const normalized = error.toLowerCase();
  if (normalized.includes("permission") || normalized.includes("share")) {
    return "Make sure the sheet is shared with the service account email, then retry.";
  }
  if (normalized.includes("mapping") || normalized.includes("column")) {
    return "Open the column mapping section, match the required columns, then preview again.";
  }
  if (normalized.includes("network") || normalized.includes("reach")) {
    return "Check your connection and Google Sheets access. Your form values are preserved.";
  }
  return "Your sheet link and mappings are preserved. Fix the issue above, then retry.";
}
