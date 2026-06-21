"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PanelType } from "./panel-toggle";

interface GuidedTourProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  tourSignal: number;
}

interface TourStep {
  panel: PanelType;
  selector: string;
  title: string;
  body: string;
  optional?: boolean;
}

const TOUR_STEPS: TourStep[] = [
  {
    panel: "interviews",
    selector: "#sync-sheet-button",
    title: "Sync Sheet",
    body: "Pulls the newest interviews, topics, and events from your connected Google Sheets. Re-sync after the sheet changes.",
  },
  {
    panel: "interviews",
    selector: '[data-tour="dashboard-tabs"]',
    title: "Main Tabs",
    body: "Move between interviews, topic ideas, event opportunities, and this guided tour.",
  },
  {
    panel: "interviews",
    selector: '[data-tour="interview-stats"]',
    title: "Dashboard Totals",
    body: "These counters show the workload at a glance, including live/upcoming items and researched signals found.",
  },
  {
    panel: "interviews",
    selector: "#interview-search",
    title: "Search",
    body: "Find a person, topic, company, or PR contact quickly.",
  },
  {
    panel: "interviews",
    selector: '[data-tour="interview-filters"]',
    title: "Filters",
    body: "Jump to upcoming interviews, new live articles, contacts needed, shared articles, or fully leveraged items.",
  },
  {
    panel: "interviews",
    selector: '[id^="interview-card-"]',
    title: "Interview Cards",
    body: "Each card shows the guest, company, topic, publishing status, contact info, and next leverage actions.",
  },
  {
    panel: "interviews",
    selector: '[id^="research-vip-"]',
    title: "Standout Signals",
    body: "The dashboard researches standout, audience, and company signals in the background. This button is a manual refresh if you want to re-check one person.",
  },
  {
    panel: "interviews",
    selector: '[id^="view-details-"]',
    title: "Details",
    body: "Open the full side panel for contacts, signal sources, links, media, and action history.",
  },
  {
    panel: "interviews",
    selector: '[id^="send-live-email-"]',
    title: "Send Live Link Email",
    body: "Send the published article to the interviewee or publicist and record the outreach automatically.",
    optional: true,
  },
  {
    panel: "interviews",
    selector: '[id^="share-linkedin-"]',
    title: "Share On LinkedIn",
    body: "Generate client-ready LinkedIn copy so the article becomes visible social proof.",
    optional: true,
  },
  {
    panel: "interviews",
    selector: '[id^="request-zoom-"]',
    title: "Request Zoom Interview",
    body: "Turn the published feature into a warm follow-up and invite the guest into another conversation.",
    optional: true,
  },
  {
    panel: "interviews",
    selector: '[id^="generate-social-image-"]',
    title: "Get Social Image",
    body: "Create a branded share image for LinkedIn, Instagram, or client promotion.",
    optional: true,
  },
  {
    panel: "topics",
    selector: '[data-tour="tab-topics"]',
    title: "Topics Tab",
    body: "This tab organizes pitch ideas, source responses, and interview-question materials.",
  },
  {
    panel: "topics",
    selector: '[data-tour="topics-controls"]',
    title: "Topic Filters",
    body: "Filter by pitch forms, responses, and interview templates when preparing the next feature.",
    optional: true,
  },
  {
    panel: "topics",
    selector: '[data-tour="topic-card"]',
    title: "Topic Cards",
    body: "Open a topic to review the source request, responses, and interview questions in one place.",
    optional: true,
  },
  {
    panel: "events",
    selector: '[data-tour="tab-events"]',
    title: "Events Tab",
    body: "Events help clients find press opportunities, conferences, and relevant outreach targets.",
  },
  {
    panel: "events",
    selector: '[data-tour="events-controls"]',
    title: "Event Controls",
    body: "Sort events by date or name, or group by city when planning outreach.",
    optional: true,
  },
  {
    panel: "events",
    selector: '[data-tour="event-email-contact"]',
    title: "Email Contact",
    body: "Use this to draft press access, coverage, or event outreach from the event details.",
    optional: true,
  },
  {
    panel: "tutorial",
    selector: '[data-tour="guided-tour-start"]',
    title: "Replay Anytime",
    body: "The Tutorial tab is now a launchpad. Clients can restart this guided walkthrough whenever they need a refresher.",
  },
];

const STORAGE_KEY = "authority-dashboard-guided-tour-complete";

export function GuidedTour({
  activePanel,
  setActivePanel,
  tourSignal,
}: GuidedTourProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const step = TOUR_STEPS[stepIndex];
  const progressLabel = `${stepIndex + 1} of ${TOUR_STEPS.length}`;

  const closeTour = useCallback(() => {
    setIsOpen(false);
    setTargetRect(null);
    window.localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const move = useCallback(
    (direction: 1 | -1) => {
      setTargetRect(null);
      setStepIndex((current) => {
        const next = current + direction;
        if (next < 0) return 0;
        if (next >= TOUR_STEPS.length) {
          closeTour();
          return current;
        }
        return next;
      });
    },
    [closeTour]
  );

  const startTour = useCallback(() => {
    setStepIndex(0);
    setTargetRect(null);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (tourSignal <= 0) return;
    const timer = window.setTimeout(startTour, 0);
    return () => window.clearTimeout(timer);
  }, [startTour, tourSignal]);

  useEffect(() => {
    const hasCompleted = window.localStorage.getItem(STORAGE_KEY) === "true";
    if (!hasCompleted) {
      const timer = window.setTimeout(startTour, 700);
      return () => window.clearTimeout(timer);
    }
  }, [startTour]);

  useEffect(() => {
    if (!isOpen || !step) return;
    if (activePanel !== step.panel) {
      setActivePanel(step.panel);
    }

    let cancelled = false;
    let attempts = 0;

    function findTarget() {
      if (cancelled) return;
      attempts += 1;
      const target = document.querySelector<HTMLElement>(step.selector);

      if (!target && attempts < 8) {
        window.setTimeout(findTarget, 130);
        return;
      }

      if (!target) {
        if (step.optional && stepIndex < TOUR_STEPS.length - 1) {
          move(1);
        }
        return;
      }

      target.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "smooth",
      });

      window.setTimeout(() => {
        if (!cancelled) setTargetRect(target.getBoundingClientRect());
      }, 220);
    }

    const timer = window.setTimeout(findTarget, 180);
    const updatePosition = () => {
      const target = document.querySelector<HTMLElement>(step.selector);
      if (target) setTargetRect(target.getBoundingClientRect());
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [activePanel, isOpen, move, setActivePanel, step, stepIndex]);

  const spotlightStyle = useMemo(() => {
    if (!targetRect) return undefined;
    const padding = 8;
    return {
      left: Math.max(8, targetRect.left - padding),
      top: Math.max(8, targetRect.top - padding),
      width: Math.min(window.innerWidth - 16, targetRect.width + padding * 2),
      height: targetRect.height + padding * 2,
    };
  }, [targetRect]);

  const popoverStyle = useMemo(() => {
    if (!targetRect) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const width = 320;
    const gap = 16;
    const rightSpace = window.innerWidth - targetRect.right;
    const leftSpace = targetRect.left;
    const belowSpace = window.innerHeight - targetRect.bottom;
    let left = targetRect.right + gap;
    let top = targetRect.top;

    if (rightSpace < width + gap && leftSpace >= width + gap) {
      left = targetRect.left - width - gap;
    } else if (rightSpace < width + gap) {
      left = Math.max(16, Math.min(window.innerWidth - width - 16, targetRect.left));
      top =
        belowSpace > 210
          ? targetRect.bottom + gap
          : Math.max(16, targetRect.top - 230);
    }

    return {
      left,
      top: Math.max(16, Math.min(window.innerHeight - 250, top)),
    };
  }, [targetRect]);

  if (!isOpen || !step) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[1px]" />
      {spotlightStyle && (
        <div
          className="pointer-events-none fixed z-50 rounded-2xl border-2 border-amber-300 bg-white/5 shadow-[0_0_0_9999px_rgba(15,23,42,0.38),0_0_34px_rgba(251,191,36,0.85)] transition-all duration-200"
          style={spotlightStyle}
        />
      )}
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Dashboard guided tour"
        className="fixed z-[60] w-[min(320px,calc(100vw-32px))] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
        style={popoverStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Guided Tour · {progressLabel}
            </p>
            <h2 className="mt-1 text-base font-bold text-slate-900">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeTour}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Skip tour"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mt-3 text-sm leading-6 text-slate-600">{step.body}</p>

        <div className="mt-4 h-1.5 rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: `${((stepIndex + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={stepIndex === 0}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeTour}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() =>
                stepIndex === TOUR_STEPS.length - 1 ? closeTour() : move(1)
              }
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              {stepIndex === TOUR_STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
