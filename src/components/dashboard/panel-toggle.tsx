"use client";

import { motion } from "framer-motion";

export type PanelType = "interviews" | "topics" | "events";

interface PanelToggleProps {
  activePanel: PanelType;
  onChange: (panel: PanelType) => void;
}

export function PanelToggle({ activePanel, onChange }: PanelToggleProps) {
  const tabs: { id: PanelType; label: string }[] = [
    { id: "interviews", label: "Interviews" },
    { id: "topics", label: "Topics" },
    { id: "events", label: "Events" },
  ];

  return (
    <div className="flex justify-center mb-8">
      <div className="relative flex space-x-1 rounded-full bg-slate-100 p-1 shadow-inner border border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center justify-center rounded-full px-6 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 z-10 ${
              activePanel === tab.id
                ? "text-white"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            {activePanel === tab.id && (
              <motion.div
                layoutId="active-panel-bubble"
                className="absolute inset-0 z-0 rounded-full bg-indigo-600 shadow-sm"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
