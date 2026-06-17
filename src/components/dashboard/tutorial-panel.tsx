"use client";

interface TutorialPanelProps {
  onStartTour: () => void;
}

const TOUR_HIGHLIGHTS = [
  "Tabs and dashboard navigation",
  "Sync, search, filters, and cards",
  "VIP signals and interview details",
  "Email, LinkedIn, Zoom, and social image actions",
  "Topics, events, and press outreach",
];

export function TutorialPanel({ onStartTour }: TutorialPanelProps) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 py-8 text-center">
      <section className="w-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
          Guided Tour
        </p>
        <h2 className="mt-3 text-2xl font-bold text-slate-900">
          Walk Through The Dashboard
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
          A short step-by-step guide will highlight each real button, tab, and
          card control, then explain what it does in plain language.
        </p>

        <button
          type="button"
          data-tour="guided-tour-start"
          onClick={onStartTour}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          Start Guided Tour
        </button>
      </section>

      <section className="w-full rounded-xl border border-slate-200 bg-slate-50 p-5 text-left">
        <h3 className="text-sm font-semibold text-slate-900">
          The tour covers:
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {TOUR_HIGHLIGHTS.map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                </svg>
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
