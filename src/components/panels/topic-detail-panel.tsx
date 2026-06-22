"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Topic } from "@prisma/client";
import { buildTopicInvitationEmailBody } from "@/lib/email/copy";

interface TopicDetailPanelProps {
  topic: Topic;
  onClose: () => void;
}

export function TopicDetailPanel({ topic, onClose }: TopicDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState(
    `Invitation to participate in Authority Magazine: ${topic.title}`
  );
  const [body, setBody] = useState(buildTopicInvitationEmailBody(topic));
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const messageElement = messageRef.current;
    if (!messageElement) return;

    messageElement.style.height = "auto";
    messageElement.style.height = `${messageElement.scrollHeight}px`;
  }, [body]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    closeButtonRef.current?.focus({ preventScroll: true });

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
      document.documentElement.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [onClose]);

  async function handleSendInvitation(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSending(true);
      setError(null);
      setNotice(null);

      const response = await fetch(`/api/outreach/topics/${topic.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, subject, body }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not send topic invitation.");
      }

      setNotice(data.note || "Topic invitation sent.");
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Could not send topic invitation."
      );
    } finally {
      setSending(false);
    }
  }

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
        aria-label="Topic details"
        className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-lg flex-col overflow-hidden bg-slate-50 shadow-2xl
                      animate-slide-in-right"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-5 flex items-start justify-between z-10 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-slate-900 pr-4 leading-tight">{topic.title}</h2>
            <p className="text-sm text-slate-500 mt-1">Synced from Google Sheets</p>
          </div>
          <button
            ref={closeButtonRef}
            id="close-topic-panel"
            onClick={onClose}
            aria-label="Close topic details"
            className="p-2 -mr-2 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div ref={contentRef} className="flex-1 space-y-6 overflow-y-auto p-6">
          {topic.sourceRequests && (
            <Section title="Source Requests (Pitch Form)" colorClass="text-indigo-600">
              <div className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">
                {renderTextWithLinks(topic.sourceRequests)}
              </div>
            </Section>
          )}

          {topic.responses && (
            <Section title="Responses" colorClass="text-emerald-600">
              <div className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">
                {renderTextWithLinks(topic.responses)}
              </div>
            </Section>
          )}

          {topic.interviewQuestions && (
            <Section title="Interview Template / Suggested Questions" colorClass="text-amber-600">
              <div className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">
                {renderTextWithLinks(topic.interviewQuestions)}
              </div>
            </Section>
          )}

          {topic.interviewQuestions && (
            <Section title="Invite Participants" colorClass="text-indigo-600">
              <form onSubmit={handleSendInvitation} className="space-y-4">
                <div className="sticky top-0 z-20 -mx-5 -mt-5 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
                  <p className="text-xs font-medium text-slate-500">
                    Review the invitation and send it when ready.
                  </p>
                  <button
                    type="submit"
                    disabled={sending || !recipients.trim()}
                    className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send Invitation"}
                  </button>
                </div>

                {notice && (
                  <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    {notice}
                  </div>
                )}
                {error && (
                  <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Recipients
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={recipients}
                    onChange={(event) => setRecipients(event.target.value)}
                    placeholder="one@example.com, two@example.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Separate multiple email addresses with commas, spaces, or semicolons.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Subject
                  </label>
                  <input
                    required
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Message
                  </label>
                  <textarea
                    ref={messageRef}
                    required
                    rows={1}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    className="w-full resize-none overflow-hidden rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs leading-relaxed focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="h-2" />
              </form>
            </Section>
          )}

          {!topic.sourceRequests && !topic.responses && !topic.interviewQuestions && (
            <div className="text-center p-8 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-500">No additional details provided for this topic.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function renderTextWithLinks(text: string) {
  if (!text) return null;
  
  const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = mdRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...autoLinkRawUrls(text.substring(lastIndex, match.index)));
    }
    parts.push(
      <a
        key={match.index}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-4 decoration-indigo-200 hover:decoration-indigo-400 transition-colors inline-flex items-center gap-1"
      >
        {match[1]}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    );
    lastIndex = mdRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(...autoLinkRawUrls(text.substring(lastIndex)));
  }

  return <>{parts}</>;
}

function autoLinkRawUrls(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(
      <a
        key={`raw-${match.index}`}
        href={match[1]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-500 hover:text-indigo-700 underline underline-offset-2 break-all"
      >
        {match[1]}
      </a>
    );
    lastIndex = urlRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts;
}

function Section({ title, children, colorClass }: { title: string; children: React.ReactNode; colorClass: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className={`text-sm font-bold uppercase tracking-wider mb-4 ${colorClass}`}>
        {title}
      </h3>
      {children}
    </div>
  );
}
