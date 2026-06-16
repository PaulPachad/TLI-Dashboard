"use client";

// ==============================================================================
// Interview Detail Panel — Slide-out side panel with full interview details
// ==============================================================================

import { useEffect, useRef } from "react";
import type { InterviewView } from "@/types/interview";

interface InterviewDetailPanelProps {
  interview: InterviewView;
  onClose: () => void;
}

export function InterviewDetailPanel({ interview, onClose }: InterviewDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isUnpublished =
    interview.articleUrl.includes("/unpublished/") ||
    interview.liveEmailStatusImported?.toUpperCase() !== "LIVE";

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Interview details"
        className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 overflow-y-auto
                      animate-slide-in-right"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-slate-900">Interview Details</h2>
          <button
            ref={closeButtonRef}
            id="close-detail-panel"
            onClick={onClose}
            aria-label="Close interview details"
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Interviewee info */}
          <Section title="Interviewee">
            <DetailRow label="Name" value={interview.intervieweeName} />
            <DetailRow label="Company" value={interview.intervieweeCompany} />
            <DetailRow label="Title" value={interview.intervieweeTitle} />
            <DetailRow label="Email" value={interview.intervieweeEmail} isEmail />
          </Section>

          {interview.prominence && interview.prominence.tier !== "standard" && (
            <Section title="VIP Signals">
              <DetailRow label="Tier" value={interview.prominence.tierLabel} />
              <DetailRow label="Score" value={`${interview.prominence.score}/100`} />
              <DetailRow label="Confidence" value={capitalize(interview.prominence.confidence)} />
              <div className="flex items-start gap-3">
                <span className="text-xs text-slate-400 w-20 shrink-0 pt-0.5">Badges</span>
                <div className="flex flex-wrap gap-1.5">
                  {interview.prominence.badges.map((badge) => (
                    <span
                      key={badge.label}
                      className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              </div>
              {interview.prominence.reasons.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-xs text-slate-400 w-20 shrink-0 pt-0.5">Why</span>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {interview.prominence.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* Publicist info */}
          {(interview.publicistName || interview.publicistEmail) && (
            <Section title="Publicist">
              <DetailRow label="Name" value={interview.publicistName} />
              <DetailRow label="Email" value={interview.publicistEmail} isEmail />
            </Section>
          )}

          {/* Article */}
          <Section title="Article">
            <DetailRow label="Topic" value={interview.topic} />
            {isUnpublished ? (
              <>
                <div className="flex items-start gap-3">
                  <span className="text-xs text-slate-400 w-20 shrink-0 pt-0.5">Article</span>
                  <span className="text-sm text-slate-500 italic">
                    {interview.articleUrl.includes("/unpublished/")
                      ? "Not published yet (Authority Magazine link missing)"
                      : "Draft (Not published yet - status in sheet needs to be \"LIVE\")"}
                  </span>
                </div>
                {interview.estimatedPublishDate ? (
                  <DetailRow
                    label="Est. Publish"
                    value={new Date(interview.estimatedPublishDate).toLocaleDateString("en-US", {
                      month: "2-digit",
                      day: "2-digit",
                      year: "2-digit",
                    })}
                  />
                ) : interview.liveEmailStatusImported && interview.liveEmailStatusImported.toUpperCase() !== "LIVE" ? (
                  <DetailRow label="Status" value={interview.liveEmailStatusImported} />
                ) : null}
              </>
            ) : (
              <DetailRow label="Article" value={interview.articleUrl} isLink />
            )}
            {interview.buzzfeedUrl && (
              <DetailRow label="BuzzFeed" value={interview.buzzfeedUrl} isLink />
            )}
            {interview.interviewDocUrl && (
              <DetailRow label="Interview Doc" value={interview.interviewDocUrl} isLink />
            )}
          </Section>

          {/* Social */}
          {(interview.linkedinUrl || interview.twitterUrl) && (
            <Section title="Social Media">
              <SocialRow label="LinkedIn" value={interview.linkedinUrl} />
              <SocialRow label="X / Twitter" value={interview.twitterUrl} />
            </Section>
          )}

          {/* Media */}
          {(interview.image1Url || interview.image2Url || interview.videoUrl) && (
            <Section title="Media">
              {interview.image1Url && (
                <div className="mb-3">
                  <p className="text-xs text-slate-500 mb-1">Photo</p>
                  {/* Remote sheet images can come from arbitrary hosts. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={interview.image1Url}
                    alt={interview.intervieweeName}
                    className="w-32 h-32 rounded-lg object-cover border border-slate-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
              {interview.image2Url && (
                <DetailRow label="Image 2" value={interview.image2Url} isLink />
              )}
              {interview.videoUrl && (
                <DetailRow label="Video" value={interview.videoUrl} isLink />
              )}
            </Section>
          )}

          {/* Action Timeline */}
          <Section title="Action Timeline">
            {interview.actions && interview.actions.length > 0 ? (
              <div className="space-y-3">
                {interview.actions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-start gap-3 text-sm"
                  >
                    <div
                      className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                        action.status === "SUCCESS"
                          ? "bg-emerald-500"
                          : action.status === "FAILED"
                          ? "bg-rose-500"
                          : "bg-amber-500"
                      }`}
                    />
                    <div>
                      <p className="text-slate-700 font-medium">
                        {formatActionType(action.actionType)}
                      </p>
                      {action.recipient && (
                        <p className="text-slate-500 text-xs">To: {action.recipient}</p>
                      )}
                      {action.note && (
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          {action.note}
                        </p>
                      )}
                      {action.linkedinPostUrl && (
                        <a
                          href={action.linkedinPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block break-all text-xs font-medium text-indigo-600 hover:underline"
                        >
                          View LinkedIn post
                        </a>
                      )}
                      <p className="text-slate-400 text-xs">
                        {new Date(action.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">No actions taken yet</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailRow({
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
    <div className="flex items-start gap-3">
      <span className="text-xs text-slate-400 w-20 shrink-0 pt-0.5">{label}</span>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline break-all transition-colors"
        >
          {value.length > 50 ? value.substring(0, 50) + "..." : value}
        </a>
      ) : isEmail ? (
        <a
          href={`mailto:${value}`}
          className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
        >
          {value}
        </a>
      ) : (
        <span className="text-sm text-slate-700">{value}</span>
      )}
    </div>
  );
}

function SocialRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) return null;

  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-slate-400 w-20 shrink-0 pt-0.5">{label}</span>
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline break-all transition-colors"
        title={value}
      >
        {formatSocialHandle(value)}
      </a>
    </div>
  );
}

function formatSocialHandle(value: string): string {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    const handle = segments.at(-1);
    return handle ? `@${handle}` : url.hostname;
  } catch {
    return value;
  }
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
    PROMINENCE_RESEARCHED: "VIP signals researched",
  };
  return labels[type] || type;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
