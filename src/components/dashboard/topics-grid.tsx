"use client";

import { useState } from "react";
import { Topic } from "@prisma/client";
import { TopicDetailPanel } from "@/components/panels/topic-detail-panel";

export function TopicsGrid({ topics }: { topics: Topic[] }) {
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "tag">("grid");
  const [sortBy, setSortBy] = useState<"name" | "tags">("name");

  if (topics.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
        <p>No topics found.</p>
        <p className="text-sm">They will appear here once synced from your sheet.</p>
      </div>
    );
  }

  const tags = [
    {
      id: "pitch",
      label: "Pitch Form",
      colorClass: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-700/10 hover:bg-indigo-100/80 cursor-pointer",
      activeColorClass: "bg-indigo-600 text-white ring-1 ring-indigo-600 cursor-pointer"
    },
    {
      id: "responses",
      label: "Responses",
      colorClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10 hover:bg-emerald-100/80 cursor-pointer",
      activeColorClass: "bg-emerald-600 text-white ring-1 ring-emerald-600 cursor-pointer"
    },
    {
      id: "template",
      label: "Interview Template",
      colorClass: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10 hover:bg-amber-100/80 cursor-pointer",
      activeColorClass: "bg-amber-600 text-white ring-1 ring-amber-600 cursor-pointer"
    }
  ];

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const filteredTopics = topics.filter((topic) => {
    if (selectedTags.length === 0) return true;
    return selectedTags.every((tagId) => {
      if (tagId === "pitch") return !!topic.sourceRequests;
      if (tagId === "responses") return !!topic.responses;
      if (tagId === "template") return !!topic.interviewQuestions;
      return true;
    });
  });

  // Sort helper
  const sortTopics = (list: Topic[]) => {
    return [...list].sort((a, b) => {
      if (sortBy === "tags") {
        const countA = (a.sourceRequests ? 1 : 0) + (a.responses ? 1 : 0) + (a.interviewQuestions ? 1 : 0);
        const countB = (b.sourceRequests ? 1 : 0) + (b.responses ? 1 : 0) + (b.interviewQuestions ? 1 : 0);
        if (countA !== countB) {
          return countB - countA; // Descending (most tags first)
        }
        return a.title.localeCompare(b.title);
      } else {
        return a.title.localeCompare(b.title);
      }
    });
  };

  // Group topics by tag
  const groupedByTag: Record<string, { label: string; color: string; list: Topic[] }> = {
    pitch: { label: "Pitch Form", color: "text-indigo-700 border-indigo-200 bg-indigo-50/50", list: [] },
    responses: { label: "Responses", color: "text-emerald-700 border-emerald-200 bg-emerald-50/50", list: [] },
    template: { label: "Interview Template", color: "text-amber-700 border-amber-200 bg-amber-50/50", list: [] },
    none: { label: "Title Only", color: "text-slate-600 border-slate-200 bg-slate-50", list: [] }
  };

  filteredTopics.forEach((topic) => {
    let hasAny = false;
    if (topic.sourceRequests) {
      groupedByTag.pitch.list.push(topic);
      hasAny = true;
    }
    if (topic.responses) {
      groupedByTag.responses.list.push(topic);
      hasAny = true;
    }
    if (topic.interviewQuestions) {
      groupedByTag.template.list.push(topic);
      hasAny = true;
    }
    if (!hasAny) {
      groupedByTag.none.list.push(topic);
    }
  });

  const activeGroups = Object.entries(groupedByTag).filter(([key, group]) => {
    if (selectedTags.length > 0) {
      return selectedTags.includes(key) && group.list.length > 0;
    }
    return group.list.length > 0;
  });

  const renderTopicCard = (topic: Topic) => {
    const hasPitch = !!topic.sourceRequests;
    const hasResponses = !!topic.responses;
    const hasQuestions = !!topic.interviewQuestions;

    return (
      <div
        key={topic.id}
        onClick={() => setSelectedTopic(topic)}
        className="group flex flex-col cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md hover:border-indigo-300 animate-fadeIn"
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
                Interview Template
              </span>
            )}
            {!hasPitch && !hasResponses && !hasQuestions && (
              <span className="text-xs text-slate-400">Title only</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Controls panel */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        {/* Left: Tag Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">Filter:</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => {
              const isActive = selectedTags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-all shadow-sm ${
                    isActive ? tag.activeColorClass : tag.colorClass
                  }`}
                >
                  {isActive && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {tag.label}
                </button>
              );
            })}
            
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="text-xs text-slate-500 hover:text-indigo-600 font-semibold px-2 py-1 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Right: View Mode & Sort By */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">View:</span>
            <div className="inline-flex rounded-lg bg-slate-200 p-0.5 animate-fadeIn">
              <button
                onClick={() => setViewMode("grid")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  viewMode === "grid"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Show All
              </button>
              <button
                onClick={() => setViewMode("tag")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  viewMode === "tag"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Group by Tag
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Sort By:</span>
            <div className="inline-flex rounded-lg bg-slate-200 p-0.5 animate-fadeIn">
              <button
                onClick={() => setSortBy("name")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  sortBy === "name"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Name
              </button>
              <button
                onClick={() => setSortBy("tags")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  sortBy === "tags"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Tags
              </button>
            </div>
          </div>
        </div>
      </div>

      {filteredTopics.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 animate-fadeIn">
          <p>No topics match the selected filters.</p>
          <button
            onClick={() => setSelectedTags([])}
            className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear Filters
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sortTopics(filteredTopics).map(renderTopicCard)}
        </div>
      ) : (
        <div className="space-y-10 animate-fadeIn">
          {activeGroups.map(([key, group]) => {
            const sortedGroupTopics = sortTopics(group.list);
            return (
              <div key={key} className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${group.color}`}>
                    {group.label}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                    {sortedGroupTopics.length} {sortedGroupTopics.length === 1 ? "Topic" : "Topics"}
                  </span>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 animate-fadeIn">
                  {sortedGroupTopics.map(renderTopicCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedTopic && (
        <TopicDetailPanel
          topic={selectedTopic}
          onClose={() => setSelectedTopic(null)}
        />
      )}
    </div>
  );
}
