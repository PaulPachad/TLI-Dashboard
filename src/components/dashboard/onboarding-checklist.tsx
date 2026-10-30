"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export interface ReadinessState {
  hasSheetConnected: boolean;
  hasEmailConfigured: boolean;
  hasSchedulingConfigured: boolean;
  hasFirstOutreachSent: boolean;
  isAdmin?: boolean;
  isClient?: boolean;
  clientId?: string | null;
}

interface OnboardingChecklistProps {
  readiness: ReadinessState;
}

const STORAGE_KEY_COLLAPSED = "tli-readiness-checklist-collapsed-v1";

export function OnboardingChecklist({ readiness }: OnboardingChecklistProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  // Calculate completed count
  const steps = [
    {
      id: "sheet",
      number: 1,
      title: "Connect & Sync Interviews Sheet",
      description:
        "Link your Google Sheet to import your published Authority Magazine features and upcoming editorial pipeline.",
      isComplete: readiness.hasSheetConnected,
      href: "/dashboard/settings#sheet-import",
      actionText: readiness.hasSheetConnected ? "Manage Sheet in Settings →" : "Link Google Sheet →",
      primaryAction: !readiness.hasSheetConnected,
    },
    {
      id: "email",
      number: 2,
      title: "Configure Reply-To Email & Signature",
      description:
        "Set your professional email signature and reply-to address so guest responses arrive directly in your inbox.",
      isComplete: readiness.hasEmailConfigured,
      href: "/dashboard/settings",
      actionText: readiness.hasEmailConfigured ? "Update in Settings →" : "Configure Email & Signature →",
      primaryAction: !readiness.hasEmailConfigured && readiness.hasSheetConnected,
    },
    {
      id: "calendar",
      number: 3,
      title: "Add Zoom / Calendly Scheduling Link",
      description:
        "Provide your calendar booking link so Zoom invitations never go out without a 1-click scheduling link.",
      isComplete: readiness.hasSchedulingConfigured,
      href: "/dashboard/settings",
      actionText: readiness.hasSchedulingConfigured ? "Update Link →" : "Add Scheduling Link →",
      primaryAction: !readiness.hasSchedulingConfigured && readiness.hasEmailConfigured,
    },
    {
      id: "outreach",
      number: 4,
      title: "Send Your First Guest Outreach or LinkedIn Share",
      description:
        "Reach out to your first VIP guest with a live feature email, invite them to a 15-min chat, or publish social copy.",
      isComplete: readiness.hasFirstOutreachSent,
      href: "#interviews-section",
      actionText: readiness.hasFirstOutreachSent ? "View Interviews Below ↓" : "Start First Outreach Below ↓",
      primaryAction: !readiness.hasFirstOutreachSent && readiness.hasSchedulingConfigured,
    },
  ];

  const completedCount = steps.filter((s) => s.isComplete).length;
  const allComplete = completedCount === steps.length;

  useEffect(() => {
    try {
      const storedCollapsed = localStorage.getItem(STORAGE_KEY_COLLAPSED);
      if (storedCollapsed === "true" || (storedCollapsed === null && allComplete)) {
        setIsCollapsed(true);
      }
    } catch {
      // localStorage fallback
    }
  }, [allComplete]);

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED, String(next));
    } catch {
      // localStorage fallback
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED, "true");
    } catch {
      // localStorage fallback
    }
  };

  if (isDismissed) {
    return null;
  }

  // Collapsed Pill View
  if (isCollapsed) {
    return (
      <div className="mb-6 flex items-center justify-between rounded-xl border border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-indigo-50/30 px-4 py-2.5 shadow-xs transition-all hover:border-slate-300">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              allComplete
                ? "bg-emerald-100 text-emerald-700"
                : "bg-indigo-100 text-indigo-700"
            }`}
          >
            {allComplete ? "✓" : `${completedCount}/4`}
          </span>
          <p className="text-sm font-medium text-slate-700">
            {allComplete ? (
              <span className="font-semibold text-emerald-800">
                Account Setup 4/4 Complete ✓ — All systems ready for maximum interview leverage
              </span>
            ) : (
              <span>
                Account Readiness:{" "}
                <span className="font-semibold text-indigo-600">
                  {completedCount} of 4 steps complete
                </span>
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-indigo-600 transition-colors"
        >
          <span>Show Checklist</span>
          <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>
    );
  }

  // Expanded Checklist View
  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/20 to-sky-50/30 p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-indigo-100/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow-2xs">
              ⚡
            </span>
            <h2 className="text-base font-bold text-slate-900">
              Account Readiness & Quick Start
            </h2>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                allComplete
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border border-indigo-200 bg-indigo-50 text-indigo-700"
              }`}
            >
              {allComplete ? "4/4 Complete ✓" : `${completedCount} of 4 Ready`}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Complete these 4 foundational steps to unlock zero-friction guest outreach, Zoom scheduling, and social leverage.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            Collapse
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex items-center rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="Dismiss checklist"
            aria-label="Dismiss checklist"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4 mb-5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              allComplete ? "bg-emerald-500" : "bg-indigo-600"
            }`}
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 ${
              step.isComplete
                ? "border-emerald-200/80 bg-emerald-50/30"
                : step.primaryAction
                ? "border-indigo-300 bg-white shadow-xs ring-1 ring-indigo-200/60"
                : "border-slate-200 bg-white"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    step.isComplete
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-700 font-semibold"
                  }`}
                >
                  {step.isComplete ? "✓" : step.number}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                    step.isComplete
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {step.isComplete ? "Complete" : "Action Needed"}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                {step.title}
              </h3>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                {step.description}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100">
              {step.href.startsWith("#") ? (
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("interview-search") || document.querySelector('[data-tour="interview-stats"]');
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={`w-full inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    step.primaryAction
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {step.actionText}
                </button>
              ) : (
                <Link
                  href={step.href}
                  className={`w-full inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    step.primaryAction
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {step.actionText}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
