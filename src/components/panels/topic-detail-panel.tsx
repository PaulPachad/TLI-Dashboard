"use client";

import { useEffect, useRef } from "react";
import { Topic } from "@prisma/client";

interface TopicDetailPanelProps {
  topic: Topic;
  onClose: () => void;
}

export function TopicDetailPanel({ topic, onClose }: TopicDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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
        aria-label="Topic details"
        className="fixed right-0 top-0 h-full w-full max-w-lg bg-slate-50 shadow-2xl z-50 overflow-y-auto
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

        <div className="p-6 space-y-6">
          {topic.sourceRequests && (
            <Section title="Source Requests (Pitch Form)" colorClass="text-indigo-600">
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">
                {topic.sourceRequests}
              </p>
            </Section>
          )}

          {topic.responses && (
            <Section title="Responses" colorClass="text-emerald-600">
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">
                {topic.responses}
              </p>
            </Section>
          )}

          {topic.interviewQuestions && (
            <Section title="Interview Template / Suggested Questions" colorClass="text-amber-600">
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">
                {topic.interviewQuestions}
              </p>
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
