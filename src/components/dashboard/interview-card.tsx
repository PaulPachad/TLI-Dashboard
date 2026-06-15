"use client";

// ==============================================================================
// Interview Card — Main card component for each published interview
// ==============================================================================

import { useState } from "react";
import type { InterviewActionType, InterviewView } from "@/types/interview";
import { buildInterviewImageSources } from "@/lib/images/interview-image";

interface InterviewCardProps {
  interview: InterviewView;
  onAction?: (interviewId: string, action: InterviewActionType) => void;
  onViewDetails?: (interviewId: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "New", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  needs_contact: { label: "Needs Contact", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  email_sent: { label: "Email Sent", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  shared: { label: "Shared", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  leveraged: { label: "Leveraged", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
};

export function InterviewCard({ interview, onAction, onViewDetails }: InterviewCardProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const isUnpublished =
    interview.articleUrl.includes("/unpublished/") ||
    interview.liveEmailStatusImported?.toUpperCase() !== "LIVE";
  const statusConfig = STATUS_CONFIG[interview.currentStatus] || STATUS_CONFIG.new;
  const imageSources = buildInterviewImageSources(interview);
  const currentImage = imageSources[imageIndex];

  return (
    <div
      id={`interview-card-${interview.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm
                 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
    >
      {/* Interview image */}
      <div className="relative aspect-[16/7] overflow-hidden bg-gradient-to-br from-indigo-50 to-cyan-50">
        {currentImage ? (
          // Sheet images can come from arbitrary hosts; the browser handles the
          // source fallback chain without requiring a broad Next image allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentImage}
            alt={`${interview.intervieweeName} interview`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            referrerPolicy="no-referrer"
            onError={() => setImageIndex((current) => current + 1)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white bg-indigo-100 shadow-sm">
              <span className="text-xl font-semibold text-indigo-600">
                {interview.intervieweeName.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-900/20 to-transparent" />
      </div>

      {/* Header with name */}
      <div className="flex items-start gap-4 p-5 pb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 truncate text-base">
            {interview.intervieweeName}
          </h3>
          {interview.intervieweeCompany && (
            <p className="text-sm text-slate-500 truncate">
              {interview.intervieweeCompany}
            </p>
          )}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            {isUnpublished ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
                Unpublished
              </span>
            ) : (
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig.bg} ${statusConfig.color}`}
              >
                {statusConfig.label}
              </span>
            )}
            <button
              id={`view-details-${interview.id}`}
              onClick={() => onViewDetails?.(interview.id)}
              className="text-xs font-medium text-slate-500 hover:text-indigo-700"
            >
              Details
            </button>
          </div>
        </div>
      </div>

      {/* Topic */}
      {interview.topic && (
        <div className="px-5 pb-3">
          <p className="text-sm text-slate-600 line-clamp-2">
            <span className="font-medium text-slate-700">Topic:</span>{" "}
            {interview.topic}
          </p>
        </div>
      )}

      {/* Contact info */}
      <div className="px-5 pb-3 space-y-1">
        {interview.intervieweeEmail && (
          <p className="text-xs text-slate-500 truncate flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {interview.intervieweeEmail}
          </p>
        )}
        {interview.publicistName && (
          <p className="text-xs text-slate-500 truncate flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            PR: {interview.publicistName}
          </p>
        )}
      </div>

      {/* Action badges */}
      {!isUnpublished && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          <ActionBadge done={interview.actionSummary.liveEmailSent} label="Email" />
          <ActionBadge done={interview.actionSummary.linkedinGenerated} label="LinkedIn" />
          <ActionBadge done={interview.actionSummary.markedShared} label="Shared" />
          <ActionBadge done={interview.actionSummary.zoomInviteSent} label="Zoom" />
        </div>
      )}

      {/* Primary actions */}
      {isUnpublished ? (
        <div className="mt-auto border-t border-slate-100 p-4 bg-slate-50/50">
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-800">
              <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Unpublished Interview
            </div>
            {interview.liveEmailStatusImported && interview.liveEmailStatusImported.toUpperCase() !== "LIVE" ? (
              <p className="text-xs text-slate-600 mt-1 font-medium">
                Publish Status:{" "}
                <span className="text-slate-800 font-semibold">
                  {interview.liveEmailStatusImported}
                </span>
              </p>
            ) : interview.estimatedPublishDate ? (
              <p className="text-xs text-slate-600 mt-1 font-medium">
                Estimated Publish Date:{" "}
                <span className="text-slate-800 font-semibold">
                  {new Date(interview.estimatedPublishDate).toLocaleDateString("en-US", {
                    month: "2-digit",
                    day: "2-digit",
                    year: "2-digit",
                  })}
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-1">
                No estimated publish date provided.
              </p>
            )}
            <p className="text-[10px] text-slate-400 mt-2">
              {interview.articleUrl.includes("/unpublished/")
                ? "Once live, add the Authority Magazine Link to your sheet, set the status to 'LIVE', and re-sync."
                : "Once live, change the status to 'LIVE' in your Google Sheet and re-sync."}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-slate-100 p-4">
          <a
            id={`read-article-${interview.id}`}
            href={interview.articleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-center text-xs font-semibold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100"
          >
            Read Article
          </a>
          <button
            id={`send-live-email-${interview.id}`}
            onClick={() => onAction?.(interview.id, "send_live_email")}
            className="min-h-10 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Send Live Link Email
          </button>
          <button
            id={`request-zoom-${interview.id}`}
            onClick={() => onAction?.(interview.id, "send_zoom_invite")}
            className="min-h-10 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
          >
            Request Zoom Interview
          </button>
          <button
            id={`share-linkedin-${interview.id}`}
            onClick={() => onAction?.(interview.id, "generate_linkedin")}
            className="min-h-10 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
          >
            Share on LinkedIn
          </button>
        </div>
      )}
    </div>
  );
}

function ActionBadge({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase transition-colors ${
        done
          ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
          : "bg-slate-50 text-slate-400 border border-slate-200"
      }`}
    >
      {done ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      )}
      {label}
    </span>
  );
}
