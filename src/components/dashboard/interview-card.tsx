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
import { formatActionLabel } from "@/lib/actions/labels";
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
  researchDisabled?: boolean;
  autoScanQueued?: boolean;
  onDismiss?: (interviewId: string) => void;
  onRestore?: (interviewId: string) => void;
  showRestoreMode?: boolean;
  researchFeedback?: {
    tone: "success" | "warning";
    message: string;
  };
  onEmailSaved?: (interviewId: string, email: string) => void;
  isDemoCard?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "Ready for Outreach", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  needs_contact: { label: "Missing Guest Email", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  email_sent: { label: "Email Sent", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  shared: { label: "Shared", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  leveraged: { label: "All Steps Complete", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
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
  researchDisabled,
  autoScanQueued,
  onDismiss,
  onRestore,
  showRestoreMode,
  researchFeedback,
  onEmailSaved,
  isDemoCard,
}: InterviewCardProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  
  // Inline Email Editor State
  const [guestEmail, setGuestEmail] = useState(interview.intervieweeEmail || "");
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const isUnpublished =
    interview.articleUrl.includes("/unpublished/") ||
    interview.liveEmailStatusImported?.toUpperCase() !== "LIVE";

  const effectiveStatus = !guestEmail && !interview.publicistEmail ? "needs_contact" : interview.currentStatus;
  const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.new;

  const imageSources = buildInterviewImageSources(interview);
  const currentImage = imageSources[imageIndex];
  const prominence = interview.prominence;
  const frontFlag = prominence?.frontFlag ?? null;
  const signalGroups = prominence?.signalGroups;
  const hasSignals = prominence?.hasAnySignals ?? false;
  const alreadyResearched = interview.actions.some(
    (action) => action.actionType === "PROMINENCE_RESEARCHED"
  );

  // Step 1..5 completion tracking
  const step1Done = Boolean(alreadyResearched || hasSignals || (prominence && prominence.score > 0));
  const step2Done = Boolean(interview.actionSummary.liveEmailSent);
  const step3Done = Boolean(interview.actionSummary.zoomInviteSent);
  const step4Done = Boolean(interview.actionSummary.markedShared || interview.actionSummary.linkedinGenerated);
  const step5Done = Boolean(interview.actionSummary.socialImageGenerated);

  const completedStepsCount =
    (step1Done ? 1 : 0) +
    (step2Done ? 1 : 0) +
    (step3Done ? 1 : 0) +
    (step4Done ? 1 : 0) +
    (step5Done ? 1 : 0);

  // Recommended Next Step calculation
  let recommendedStepNumber: number | null = null;
  if (!step1Done) {
    recommendedStepNumber = 1;
  } else if (!isUnpublished && !step2Done) {
    recommendedStepNumber = 2;
  } else if (!step3Done) {
    recommendedStepNumber = 3;
  } else if (!isUnpublished && !step4Done) {
    recommendedStepNumber = 4;
  } else if (!isUnpublished && !step5Done) {
    recommendedStepNumber = 5;
  }

  const cardBorderClasses = frontFlag
    ? frontFlag.tone === "violet"
      ? "border-violet-300 ring-1 ring-violet-100"
      : "border-amber-300 ring-1 ring-amber-100"
    : hasSignals
      ? "border-sky-100"
      : "border-slate-200";

  async function handleSaveGuestEmail(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setEmailError("Enter a valid email address");
      return;
    }

    try {
      setSavingEmail(true);
      setEmailError(null);

      if (interview.id === "demo") {
        setGuestEmail(cleanEmail);
        setEmailInput("");
        onEmailSaved?.(interview.id, cleanEmail);
        return;
      }

      const res = await fetch(`/api/interviews/${interview.id}/action`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervieweeEmail: cleanEmail }),
      });

      if (!res.ok) {
        // Fallback to POST
        const postRes = await fetch(`/api/interviews/${interview.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType: "add_contact",
            data: { intervieweeEmail: cleanEmail },
          }),
        });

        if (!postRes.ok) {
          const errData = await postRes.json();
          throw new Error(errData.error || "Failed to save email.");
        }
      }

      setGuestEmail(cleanEmail);
      setEmailInput("");
      onEmailSaved?.(interview.id, cleanEmail);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to save email.");
    } finally {
      setSavingEmail(false);
    }
  }

  return (
    <div
      id={`interview-card-${interview.id}`}
      className={`card-flip-container group flex flex-col h-full ${isFlipped ? "is-flipped" : ""}`}
    >
      <div className="card-flip-inner flex-1 flex flex-col">
        {/* ================================================================= */}
        {/* Front Face */}
        {/* ================================================================= */}
        <div
          className={`card-flip-front flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm h-full
                     transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${cardBorderClasses}`}
        >
          {/* Interview Image Header */}
          <div className="relative aspect-[16/8] w-full overflow-hidden bg-gradient-to-br from-indigo-50 to-cyan-50">
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

            {/* VIP Tier Badge (Top Left) */}
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

            {/* Explicit Flip for VIP Bio & History Button (Top Right) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFlipped(true);
              }}
              aria-label={`Flip for VIP Bio & History for ${interview.intervieweeName}`}
              className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur transition-all hover:bg-slate-50 hover:text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span>Flip for VIP Bio ↻</span>
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
                className="absolute right-3 bottom-3 z-20 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/95 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm backdrop-blur transition-all hover:bg-emerald-100"
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
                className="absolute left-3 bottom-3 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/60 bg-black/40 text-white opacity-0 backdrop-blur-sm transition-all group-hover:opacity-100 hover:!bg-black/60 hover:shadow-md"
                title="Dismiss this card"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>

          {/* Header Info */}
          <div className="flex items-start gap-4 p-5 pb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900 truncate text-base">
                  {interview.intervieweeName}
                </h3>
                {/* Read Live Article ↗ (Clean top utility link) */}
                {!isUnpublished && (
                  <a
                    id={`read-article-${interview.id}`}
                    href={interview.articleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                    title="Read live published article"
                  >
                    <span>Read Article</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5M8.25 15.75L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                )}
              </div>

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

              {/* Status and Signals Pills */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {isUnpublished ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-200">
                    Upcoming Feature
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusConfig.bg} ${statusConfig.color}`}
                  >
                    {statusConfig.label}
                  </span>
                )}

                {hasSignals && !frontFlag && (
                  <button
                    type="button"
                    onClick={() => setIsFlipped(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 hover:border-sky-300 hover:bg-sky-100"
                    title="VIP details available on the back of this card"
                  >
                    VIP Signals Found
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Topic */}
          {interview.topic && (
            <div className="px-5 pb-2">
              <p className="text-xs text-slate-600 line-clamp-1">
                <span className="font-semibold text-slate-700">Topic:</span>{" "}
                {interview.topic}
              </p>
            </div>
          )}

          {/* Contact Details & Inline Add Email Box */}
          <div className="px-5 pb-3">
            {guestEmail ? (
              <p className="text-xs text-slate-600 truncate flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="font-medium text-slate-700">{guestEmail}</span>
              </p>
            ) : (
              /* Inline Add Guest Email Form */
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 shadow-2xs">
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                    <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Missing Guest Email
                  </span>
                  <span className="text-[10px] text-amber-700 font-medium">Fast 3-sec fix</span>
                </div>
                <form onSubmit={handleSaveGuestEmail} className="flex gap-1.5">
                  <input
                    type="email"
                    placeholder="guest@company.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    disabled={savingEmail}
                    className="flex-1 min-w-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={savingEmail || !emailInput.trim()}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {savingEmail ? "..." : "Save"}
                  </button>
                </form>
                {emailError && <p className="mt-1 text-[10px] text-rose-600">{emailError}</p>}
              </div>
            )}

            {interview.publicistName && (
              <p className="mt-1 text-xs text-slate-500 truncate flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                PR: {interview.publicistName} {interview.publicistEmail ? `(${interview.publicistEmail})` : ""}
              </p>
            )}
          </div>

          {/* 3-Stage Editorial Pipeline Tracker for Upcoming/Unpublished Features */}
          {isUnpublished && (
            <div className="mx-5 mb-3 rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/60 via-white to-amber-50/40 p-3 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-2">
                <span className="flex items-center gap-1.5 text-sky-800">
                  <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
                  Editorial Production Pipeline
                </span>
                {interview.estimatedPublishDate ? (
                  <span className="text-[10px] font-medium text-slate-500">
                    Est: {new Date(interview.estimatedPublishDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    {interview.liveEmailStatusImported || "In Production"}
                  </span>
                )}
              </div>

              {/* 3-Stage Tracker */}
              <div className="grid grid-cols-3 gap-1 relative text-center">
                <div className="flex flex-col items-center">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold shadow-2xs">
                    ✓
                  </div>
                  <span className="mt-1 text-[10px] font-semibold text-slate-700 leading-tight">Submitted</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold shadow-2xs ring-2 ring-amber-200 animate-pulse">
                    ●
                  </div>
                  <span className="mt-1 text-[10px] font-semibold text-amber-800 leading-tight">In Production</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-400 text-[10px] font-bold">
                    ○
                  </div>
                  <span className="mt-1 text-[10px] font-medium text-slate-400 leading-tight">Live & Ready</span>
                </div>
              </div>
            </div>
          )}

          {/* Outreach Progress Bar */}
          <div className="px-5 pt-1 pb-2">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-semibold text-slate-700">
                {completedStepsCount === 5 ? (
                  <span className="text-emerald-700">✓ All 5 Outreach Steps Complete</span>
                ) : (
                  <span>{completedStepsCount} of 5 Outreach Steps Complete</span>
                )}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {Math.round((completedStepsCount / 5) * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  completedStepsCount === 5 ? "bg-emerald-500" : "bg-indigo-600"
                }`}
                style={{ width: `${(completedStepsCount / 5) * 100}%` }}
              />
            </div>
          </div>

          {/* Numbered 1->5 Workflow Action Buttons */}
          <div className="mt-auto space-y-1.5 border-t border-slate-100 p-4 bg-slate-50/50">
            {/* Step 1: Find VIP Credentials & Talking Points */}
            <button
              id={`research-vip-${interview.id}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResearchProminence?.(interview.id);
              }}
              disabled={researchingProminence || researchDisabled}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                step1Done
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70"
                  : recommendedStepNumber === 1
                  ? "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 ring-2 ring-indigo-200"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    step1Done
                      ? "bg-emerald-600 text-white"
                      : recommendedStepNumber === 1
                      ? "bg-white text-indigo-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {step1Done ? "✓" : "1"}
                </span>
                <span className="truncate">
                  {step1Done
                    ? "✓ VIP Signals Researched"
                    : "Step 1: Find VIP Credentials & Talking Points"}
                </span>
              </div>
              {recommendedStepNumber === 1 && (
                <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white tracking-wide uppercase">
                  Recommended Next Step
                </span>
              )}
            </button>

            {/* Step 2: Send Live Link Email */}
            <button
              id={`send-live-email-${interview.id}`}
              type="button"
              disabled={isUnpublished}
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(interview.id, "send_live_email");
              }}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                step2Done
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70"
                  : isUnpublished
                  ? "border border-slate-200 bg-slate-100/80 text-slate-400 cursor-not-allowed"
                  : recommendedStepNumber === 2
                  ? "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 ring-2 ring-indigo-200"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    step2Done
                      ? "bg-emerald-600 text-white"
                      : recommendedStepNumber === 2
                      ? "bg-white text-indigo-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {step2Done ? "✓" : "2"}
                </span>
                <span className="truncate">
                  {step2Done ? "✓ Live Link Email Sent" : "Step 2: Send Live Link Email"}
                </span>
              </div>
              {recommendedStepNumber === 2 && !isUnpublished && (
                <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white tracking-wide uppercase">
                  Recommended Next Step
                </span>
              )}
              {isUnpublished && (
                <span className="shrink-0 text-[10px] text-slate-400 font-normal">
                  Unlocks when live
                </span>
              )}
            </button>

            {/* Step 3: Invite to 15-Min Zoom Chat (Unlocked for upcoming features!) */}
            <button
              id={`request-zoom-${interview.id}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(interview.id, "send_zoom_invite");
              }}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                step3Done
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70"
                  : recommendedStepNumber === 3
                  ? "bg-teal-600 text-white shadow-sm hover:bg-teal-700 ring-2 ring-teal-200"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    step3Done
                      ? "bg-emerald-600 text-white"
                      : recommendedStepNumber === 3
                      ? "bg-white text-teal-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {step3Done ? "✓" : "3"}
                </span>
                <span className="truncate">
                  {step3Done
                    ? "✓ Zoom Invite Sent"
                    : isUnpublished
                    ? "Step 3: Pre-Draft 15-Min Zoom Invite"
                    : "Step 3: Invite to 15-Min Zoom Chat"}
                </span>
              </div>
              {recommendedStepNumber === 3 && (
                <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white tracking-wide uppercase">
                  Recommended Next Step
                </span>
              )}
            </button>

            {/* Step 4: Share Feature on LinkedIn */}
            <button
              id={`share-linkedin-${interview.id}`}
              type="button"
              disabled={isUnpublished}
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(interview.id, "generate_linkedin");
              }}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                step4Done
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70"
                  : isUnpublished
                  ? "border border-slate-200 bg-slate-100/80 text-slate-400 cursor-not-allowed"
                  : recommendedStepNumber === 4
                  ? "bg-sky-600 text-white shadow-sm hover:bg-sky-700 ring-2 ring-sky-200"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    step4Done
                      ? "bg-emerald-600 text-white"
                      : recommendedStepNumber === 4
                      ? "bg-white text-sky-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {step4Done ? "✓" : "4"}
                </span>
                <span className="truncate">
                  {step4Done ? "✓ Feature Shared on LinkedIn" : "Step 4: Share Feature on LinkedIn"}
                </span>
              </div>
              {recommendedStepNumber === 4 && !isUnpublished && (
                <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white tracking-wide uppercase">
                  Recommended Next Step
                </span>
              )}
              {isUnpublished && (
                <span className="shrink-0 text-[10px] text-slate-400 font-normal">
                  Unlocks when live
                </span>
              )}
            </button>

            {/* Step 5: Download Social Quote Graphic */}
            <button
              id={`generate-social-image-${interview.id}`}
              type="button"
              disabled={isUnpublished}
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(interview.id, "generate_social_image");
              }}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                step5Done
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70"
                  : isUnpublished
                  ? "border border-slate-200 bg-slate-100/80 text-slate-400 cursor-not-allowed"
                  : recommendedStepNumber === 5
                  ? "bg-pink-600 text-white shadow-sm hover:bg-pink-700 ring-2 ring-pink-200"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    step5Done
                      ? "bg-emerald-600 text-white"
                      : recommendedStepNumber === 5
                      ? "bg-white text-pink-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {step5Done ? "✓" : "5"}
                </span>
                <span className="truncate">
                  {step5Done ? "✓ Quote Graphic Ready" : "Step 5: Download Social Quote Graphic"}
                </span>
              </div>
              {recommendedStepNumber === 5 && !isUnpublished && (
                <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white tracking-wide uppercase">
                  Recommended Next Step
                </span>
              )}
              {isUnpublished && (
                <span className="shrink-0 text-[10px] text-slate-400 font-normal">
                  Unlocks when live
                </span>
              )}
            </button>
          </div>

          {/* Research Feedback or Pending Notice */}
          {(researchingProminence || researchDisabled || researchFeedback) && (
            <div className="px-4 py-2 border-t border-slate-100 bg-white">
              <p
                role="status"
                aria-live="polite"
                className={`text-[11px] font-medium leading-relaxed ${
                  researchingProminence
                    ? "text-indigo-600 animate-pulse"
                    : researchDisabled
                    ? "text-slate-500"
                    : researchFeedback?.tone === "warning"
                    ? "text-amber-700"
                    : "text-emerald-700"
                }`}
              >
                {researchingProminence
                  ? "Checking Google-grounded sources with Gemini Flash..."
                  : researchDisabled
                  ? "Wait for the current Standout refresh to finish."
                  : researchFeedback?.message}
              </p>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* Back Face (Details & VIP Signals) */}
        {/* ================================================================= */}
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
                {interview.intervieweeCompany || "Executive Bio & History"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                id={`view-details-${interview.id}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails?.(interview.id);
                }}
                className="p-1 px-2 rounded-lg hover:bg-slate-200 text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 text-[11px] font-semibold bg-indigo-50 border border-indigo-100"
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
                aria-label={`Flip back to actions for ${interview.intervieweeName}`}
                className="p-1 px-2.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1 text-xs font-semibold shadow-2xs"
                title="Flip back to actions"
              >
                <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                ← Flip Back to Actions
              </button>
            </div>
          </div>

          {/* Back Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            {/* Interviewee Details */}
            <BackSection title="Interviewee Details">
              <BackRow label="Name" value={interview.intervieweeName} />
              <BackRow label="Company" value={interview.intervieweeCompany} />
              <BackRow label="Title" value={interview.intervieweeTitle} />
              <BackRow label="Email" value={guestEmail} isEmail />
            </BackSection>

            {/* Standout Signals */}
            {prominence && signalGroups && hasSignals && (
              <BackSection title="VIP Credentials & Signals">
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
                    className="mt-1 rounded text-left text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
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
                          {formatActionLabel(action.actionType, action.status)}
                        </p>
                        {action.recipient && (
                          <p className="text-slate-400 text-[9px] mt-0.5">To: {action.recipient}</p>
                        )}
                        {action.note && (
                          <p className="mt-0.5 text-[9px] leading-relaxed text-slate-500">
                            {action.note}
                          </p>
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
                <p className="text-slate-400 italic text-xs">No actions taken yet</p>
              )}
            </BackSection>
          </div>
        </div>
      </div>
    </div>
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

function capitalize(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
