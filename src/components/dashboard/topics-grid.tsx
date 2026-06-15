"use client";

import { useState } from "react";
import { Topic } from "@prisma/client";
import { TopicDetailPanel } from "@/components/panels/topic-detail-panel";

export function TopicsGrid({ topics }: { topics: Topic[] }) {
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

  if (topics.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
        <p>No topics found.</p>
        <p className="text-sm">They will appear here once synced from your sheet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => {
          const hasPitch = !!topic.sourceRequests;
          const hasResponses = !!topic.responses;
          const hasQuestions = !!topic.interviewQuestions;

          return (
            <div
              key={topic.id}
              onClick={() => setSelectedTopic(topic)}
              className="group flex flex-col cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md hover:border-indigo-300"
            >
              <div className="flex-1 p-5 flex flex-col">
                <h3 className="text-lg font-semibold text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors line-clamp-3">
                  {topic.title}
                </h3>
                
                <div className="mt-auto pt-6 flex flex-wrap gap-2">
                  {hasPitch && (
                    <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                      Pitch Form
                    </span>
                  )}
                  {hasResponses && (
                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                      Responses
                    </span>
                  )}
                  {hasQuestions && (
                    <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/10">
                      Template
                    </span>
                  )}
                  {!hasPitch && !hasResponses && !hasQuestions && (
                    <span className="text-xs text-slate-400">Title only</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedTopic && (
        <TopicDetailPanel
          topic={selectedTopic}
          onClose={() => setSelectedTopic(null)}
        />
      )}
    </>
  );
}
