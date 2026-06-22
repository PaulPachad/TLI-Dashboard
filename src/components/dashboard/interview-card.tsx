"use client";

// ==============================================================================
// Interview Card — Main card component for each published interview
// ==============================================================================

import { useState } from "react";
import type {
  InterviewActionType,
  InterviewProminenceSignal,
  InterviewView,
} from "@/types/interview";
import { buildInterviewImageSources } from "@/lib/images/interview-image";

interface InterviewCardProps {
  interview: InterviewView;
  onAction?: (interviewId: string, action: InterviewActionType) => void;
  onViewDetails?: (
    interviewId: string,
    options?: { focus?: "sources" }
  ) => void;
  onResearchProminence?: (interviewId: string) => void;
  researchingProminence?: boolean;
  autoScanQueued?: boolean;
  onDismiss?: (interviewId: string) => void;
  onRestore?: (interviewId: string) => void;
  showRestoreMode?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "New", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  needs_contact: { label: "Needs Contact", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  email_sent: { label: "Email Sent", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  shared: { label: "Shared", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  leveraged: { label: "Leveraged", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
};

const PROMINENCE_TONES: Record<string, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
};

export function InterviewCard({
  interview,
  onAction,
  onViewDetails,
  onResearchProminence,
  researchingProminence,
  autoScanQueued,
  onDismiss,
  onRestore,
  showRestoreMode,
}: InterviewCardProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const isUnpublished =
    interview.articleUrl.includes("/unpublished/") ||
    interview.liveEmailStatusImported?.toUpperCase() !== "LIVE";
  const statusConfig = STATUS_CONFIG[interview.currentStatus] || STATUS_CONFIG.new;
  const imageSources = buildInterviewImageSources(interview);
  const currentImage = imageSources[imageIndex];
  const prominence = interview.prominence;
  const frontFlag = prominence?.frontFlag ?? null;
  const signalGroups = prominence?.signalGroups;
  const hasSignals = prominence?.hasAnySignals ?? false;

  const cardBorderClasses = frontFlag
    ? frontFlag.tone === "violet"
      ? "border-violet-300 ring-1 ring-violet-100"
      : "border-amber-300 ring-1 ring-amber-100"
    : hasSignals
      ? "border-sky-100"
      : "border-slate-200";

  return (
    <div
      id={`interview-card-${interview.id}`}
      className={`card-flip-container group flex flex-col h-full ${isFlipped ? "is-flipped" : ""}`}
    >
      <div className="card-flip-inner flex-1 flex flex-col">
        {/* Front Face */}
        <div
          className={`card-flip-front flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm h-full
                     transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${cardBorderClasses}`}
        >
          {/* Interview image */}
          <button
            type="button"
            onClick={() => setIsFlipped(true)}
            aria-label={`Show standout and interview details for ${interview.intervieweeName}`}
            className="relative block aspect-[16/8] w-full overflow-hidden bg-gradient-to-br from-indigo-50 to-cyan-50 text-left focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            {currentImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentImage}
                alt={`${interview.intervieweeName} interview`}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                style={{ objectPosition: "center 28%" }}
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
            {frontFlag && (
              <div
                title={frontFlag.reason}
                className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/75 bg-white/95 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur ${
                  frontFlag.tone === "violet"
                    ? "text-violet-800"
                    : "text-amber-800"
                }`}
              >
                <svg
                  className={`h-3.5 w-3.5 ${
                    frontFlag.tone === "violet"
                      ? "text-violet-500"
                      : "text-amber-500"
                  }`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.95-.69l1.07-3.292z" />
                </svg>
                {frontFlag.label}
              </div>
            )}
          </button>
          {/* Dismiss / Restore button */}
          {showRestoreMode ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRestore?.(interview.id);
              }}
              aria-label={`Restore ${interview.intervieweeName}`}
              className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/95 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm backdrop-blur transition-all hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              Restore
            </button>
          ) : onDismiss ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(interview.id);
              }}
              aria-label={`Dismiss ${interview.intervieweeName}`}
              className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/60 bg-black/30 text-white/70 opacity-0 backdrop-blur-sm transition-all group-hover:opacity-100 hover:!bg-black/50 hover:!text-white hover:shadow-md focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
              title="Dismiss this card"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}

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
              {interview.intervieweeTitle && (
                <p className="text-xs text-slate-400 truncate">
                  {interview.intervieweeTitle}
                </p>
              )}
              <div className="mt-1.5">
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
              </div>
              <button
                id={`research-vip-${interview.id}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onResearchProminence?.(interview.id);
                }}
                disabled={researchingProminence}
                aria-label={`Research standout signals for ${interview.intervieweeName}`}
                className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:border-amber-300 hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {researchingProminence ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-700 border-t-transparent" />
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.977 2.89a1 1 0 00-.363 1.118l1.519 4.674c.3.921-.755 1.688-1.539 1.118l-3.977-2.89a1 1 0 00-1.176 0l-3.977 2.89c-.784.57-1.838-.197-1.539-1.118l1.519-4.674a1 1 0 00-.363-1.118l-3.977-2.89c-.783-.57-.38-1.81.588-1.81h4.915a1 1 0 00.95-.69l1.519-4.674z" />
                  </svg>
                )}
                {researchingProminence
                  ? "Researching..."
                  : autoScanQueued
                    ? "Will research automatically"
                  : hasSignals
                    ? "Refresh standout research"
                    : "Research standout signals"}
              </button>
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
              <ActionBadge done={interview.actionSummary.socialImageGenerated} label="Image" />
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
                {interview.estimatedPublishDate ? (
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
                ) : interview.liveEmailStatusImported && interview.liveEmailStatusImported.toUpperCase() !== "LIVE" ? (
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    Publish Status:{" "}
                    <span className="text-slate-800 font-semibold">
                      {interview.liveEmailStatusImported}
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mt-1">
                    No estimated publish date provided.
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-2">
                  Once this interview is published, click &quot;Sync Sheet&quot; at the top of the page to check if it is live.
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
                onClick={(e) => e.stopPropagation()}
                className="flex min-h-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-center text-xs font-semibold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100"
              >
                Read Article
              </a>
              <button
                id={`send-live-email-${interview.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(interview.id, "send_live_email");
                }}
                className="min-h-10 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Send Live Link Email
              </button>
              <button
                id={`request-zoom-${interview.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(interview.id, "send_zoom_invite");
                }}
                className="min-h-10 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
              >
                Request Zoom Interview
              </button>
              <button
                id={`share-linkedin-${interview.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(interview.id, "generate_linkedin");
                }}
                className="min-h-10 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
              >
                Share on LinkedIn
              </button>
              <button
                id={`generate-social-image-${interview.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(interview.id, "generate_social_image");
                }}
                className="min-h-10 rounded-lg bg-pink-600 px-3 py-2 text-xs font-semibold text-white hover:bg-pink-700 col-span-2"
              >
                Get Social Image
              </button>
            </div>
          )}
        </div>

        {/* Back Face (Details) */}
        <div
          className={`card-flip-back absolute inset-0 w-full h-full overflow-hidden rounded-xl border bg-white shadow-sm flex flex-col z-10 ${cardBorderClasses}`}
        >
          {/* Back Header */}
          <div className="sticky top-0 bg-slate-50 border-b border-slate-100 px-4 py-3 flex items-center justify-between shrink-0 z-10">
            <div className="min-w-0 flex-1 pr-2">
              <h4 className="font-semibold text-slate-900 truncate text-sm">
                {interview.intervieweeName}
              </h4>
              <p className="text-[10px] text-slate-400 truncate">
                {interview.intervieweeCompany || "Details"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails?.(interview.id);
                }}
                className="p-1 px-2 rounded hover:bg-slate-200 text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 text-[11px] font-semibold bg-indigo-50 border border-indigo-100 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                title="Open full detail panel"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Full Details
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFlipped(false);
                }}
                aria-label={`Back to front of ${interview.intervieweeName} card`}
                className="p-1 px-2 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1 text-[11px] font-semibold bg-slate-100 border border-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                title="Flip back to front"
              >
                <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back
              </button>
            </div>
          </div>

          {/* Back Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            {/* Interviewee Details */}
            <BackSection title="Interviewee">
              <BackRow label="Name" value={interview.intervieweeName} />
              <BackRow label="Company" value={interview.intervieweeCompany} />
              <BackRow label="Title" value={interview.intervieweeTitle} />
              <BackRow label="Email" value={interview.intervieweeEmail} isEmail />
            </BackSection>

            {/* Standout Signals */}
            {prominence && signalGroups && hasSignals && (
              <BackSection title="Standout Signals">
                <SignalGroup
                  title="Role & Notability"
                  signals={signalGroups.exceptional}
                />
                <SignalGroup title="Audience" signals={signalGroups.audience} />
                <SignalGroup
                  title="Company Size"
                  signals={signalGroups.company.filter(
                    (signal) => signal.label !== "Revenue"
                  )}
                />
                <SignalGroup
                  title="Revenue"
                  signals={signalGroups.company.filter(
                    (signal) => signal.label === "Revenue"
                  )}
                />
                <SignalGroup title="Evidence" signals={signalGroups.context} />
                {prominence.evidenceSources.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetails?.(interview.id, { focus: "sources" });
                    }}
                    className="mt-1 rounded text-left text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  >
                    View sources
                  </button>
                )}
                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                  <div>
                    <span className="block font-semibold text-slate-700">
                      {prominence.tierLabel}
                    </span>
                    Tier
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-700">
                      {prominence.score}/100
                    </span>
                    Score
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-700">
                      {capitalize(prominence.confidence)}
                    </span>
                    Confidence
                  </div>
                </div>
              </BackSection>
            )}

            {/* Publicist details */}
            {(interview.publicistName || interview.publicistEmail) && (
              <BackSection title="Publicist">
                <BackRow label="Name" value={interview.publicistName} />
                <BackRow label="Email" value={interview.publicistEmail} isEmail />
              </BackSection>
            )}

            {/* Article Details */}
            <BackSection title="Article">
              <BackRow label="Topic" value={interview.topic} />
              {isUnpublished ? (
                <div className="flex items-start gap-2 text-[11px]">
                  <span className="text-[10px] text-slate-400 w-16 shrink-0 pt-0.5">Status</span>
                  <span className="text-amber-700 italic font-medium">
                    Unpublished {interview.estimatedPublishDate ? `(Est: ${new Date(interview.estimatedPublishDate).toLocaleDateString()})` : ""}
                  </span>
                </div>
              ) : (
                <BackRow label="Article" value={interview.articleUrl} isLink />
              )}
              <BackRow label="BuzzFeed" value={interview.buzzfeedUrl} isLink />
              <BackRow label="Interview Doc" value={interview.interviewDocUrl} isLink />
            </BackSection>

            {/* Social accounts */}
            {(interview.linkedinUrl || interview.twitterUrl) && (
              <BackSection title="Social Media">
                <BackRow label="LinkedIn" value={interview.linkedinUrl} isLink />
                <BackRow label="X / Twitter" value={interview.twitterUrl} isLink />
              </BackSection>
            )}

            {/* Media */}
            {(interview.image1Url || interview.image2Url || interview.videoUrl) && (
              <BackSection title="Media">
                {interview.image1Url && (
                  <div className="mb-2">
                    <p className="text-[10px] text-slate-400 mb-1">Photo</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={interview.image1Url}
                      alt={interview.intervieweeName}
                      className="w-20 h-20 rounded-lg object-cover border border-slate-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
                <BackRow label="Image 2" value={interview.image2Url} isLink />
                <BackRow label="Video" value={interview.videoUrl} isLink />
              </BackSection>
            )}

            {/* Actions Timeline */}
            <BackSection title="Action Timeline">
              {interview.actions && interview.actions.length > 0 ? (
                <div className="space-y-2.5 mt-1">
                  {interview.actions.map((action) => (
                    <div key={action.id} className="flex items-start gap-2 text-[11px]">
                      <div
                        className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                          action.status === "SUCCESS"
                            ? "bg-emerald-500"
                            : action.status === "FAILED"
                            ? "bg-rose-500"
                            : "bg-amber-500"
                        }`}
                      />
                      <div>
                        <p className="text-slate-700 font-semibold leading-tight">
                          {formatActionType(action.actionType)}
                        </p>
                        {action.recipient && (
                          <p className="text-slate-400 text-[9px] mt-0.5">To: {action.recipient}</p>
                        )}
                        {action.linkedinPostUrl && (
                          <a
                            href={action.linkedinPostUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 block text-[10px] font-semibold text-indigo-600 hover:underline"
                          >
                            View LinkedIn post
                          </a>
                        )}
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          {new Date(action.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic">No actions taken yet</p>
              )}
            </BackSection>
          </div>
        </div>
      </div>
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

function BackSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
        {title}
      </h5>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SignalGroup({
  title,
  signals,
}: {
  title: string;
  signals: InterviewProminenceSignal[];
}) {
  if (signals.length === 0) return null;

  return (
    <div className="space-y-1.5 border-l-2 border-slate-100 pl-2">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      {signals.map((signal, index) => (
        <div
          key={`${signal.label}-${signal.value ?? ""}-${index}`}
          className="flex items-start justify-between gap-2 text-[11px]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-700">
                {signal.label}
              </span>
              {signal.value && (
                <span
                  className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
                    PROMINENCE_TONES[signal.tone]
                  }`}
                >
                  {signal.value}
                </span>
              )}
            </div>
            {signal.detail && (
              <p className="mt-0.5 leading-relaxed text-slate-500">
                {signal.detail}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function BackRow({
  label,
  value,
  isLink,
  isEmail,
}: {
  label: string;
  value?: string | null;
  isLink?: boolean;
  isEmail?: boolean;
}) {
  if (!value) return null;

  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="text-[10px] text-slate-400 w-16 shrink-0 pt-0.5">{label}</span>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-indigo-600 hover:text-indigo-800 hover:underline break-all transition-colors flex-1"
        >
          {value.length > 40 ? value.substring(0, 40) + "..." : value}
        </a>
      ) : isEmail ? (
        <a
          href={`mailto:${value}`}
          onClick={(e) => e.stopPropagation()}
          className="text-indigo-600 hover:text-indigo-800 hover:underline transition-colors flex-1"
        >
          {value}
        </a>
      ) : (
        <span className="text-slate-700 font-medium flex-1">{value}</span>
      )}
    </div>
  );
}

function formatActionType(type: string): string {
  const labels: Record<string, string> = {
    LIVE_EMAIL_GENERATED: "Live email generated",
    LIVE_EMAIL_SENT: "Live email sent",
    LINKEDIN_POST_GENERATED: "LinkedIn post generated",
    LINKEDIN_POST_COPIED: "LinkedIn post copied",
    MARKED_SHARED: "Marked as shared",
    LINKEDIN_URL_ADDED: "LinkedIn post URL added",
    ZOOM_INVITE_SENT: "Zoom invitation sent",
    NOTE_ADDED: "Note added",
    CONTACT_INFO_UPDATED: "Contact info updated",
    IMPORT_CREATED: "Interview imported",
    PROMINENCE_RESEARCHED: "Standout signals researched",
  };
  return labels[type] || type;
}

function capitalize(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
