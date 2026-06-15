import { Topic } from "@prisma/client";

export function TopicsGrid({ topics }: { topics: Topic[] }) {
  if (topics.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
        <p>No topics found.</p>
        <p className="text-sm">They will appear here once synced from your sheet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {topics.map((topic) => (
        <div
          key={topic.id}
          className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md"
        >
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <h3 className="text-lg font-semibold text-slate-900 leading-tight">
              {topic.title}
            </h3>
          </div>
          <div className="flex flex-col gap-4 p-5">
            {topic.sourceRequests && (
              <div>
                <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-indigo-600">
                  Source Requests
                </h4>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {topic.sourceRequests}
                </p>
              </div>
            )}
            {topic.responses && (
              <div>
                <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-600">
                  Responses
                </h4>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {topic.responses}
                </p>
              </div>
            )}
            {topic.interviewQuestions && (
              <div>
                <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-600">
                  Interview Questions
                </h4>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {topic.interviewQuestions}
                </p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
