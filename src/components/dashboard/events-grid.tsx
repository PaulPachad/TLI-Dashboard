import { Event } from "@prisma/client";

export function EventsGrid({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
        <p>No upcoming events.</p>
        <p className="text-sm">Events will appear here once synced.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md"
        >
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <h3 className="text-lg font-semibold text-slate-900 leading-tight">
              {event.eventName}
            </h3>
          </div>
          <div className="flex flex-col gap-3 p-5 text-sm text-slate-700">
            {event.date && (
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span>{event.date}</span>
              </div>
            )}
            {event.location && (
              <div className="flex items-start gap-2">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span>{event.location}</span>
              </div>
            )}
            {event.status && (
              <div className="mt-2 text-sm text-slate-600 leading-relaxed">
                {event.status}
              </div>
            )}
            
            {event.contactInfo && (
              <div className="flex items-start gap-2 border-t border-slate-100 pt-3 mt-1 text-slate-600">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Contact</span>
                  {renderContactLinks(event.contactInfo)}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderContactLinks(contactStr: string) {
  if (!contactStr) return null;
  const tokens = contactStr.split(/[\s,;]+/).filter(Boolean);
  const elements: React.ReactNode[] = [];

  tokens.forEach((token, idx) => {
    // Check if it's an email address or contains one
    const cleanToken = token.replace(/[\(\)]/g, "").trim();
    if (cleanToken.includes("@")) {
      elements.push(
        <a
          key={`email-${idx}`}
          href={`mailto:${cleanToken}`}
          className="text-indigo-600 hover:text-indigo-800 underline font-medium hover:decoration-indigo-500 transition-colors"
        >
          {cleanToken}
        </a>
      );
    } else {
      elements.push(<span key={`text-${idx}`} className="text-slate-600 font-medium">{token}</span>);
    }

    if (idx < tokens.length - 1) {
      elements.push(<span key={`sep-${idx}`} className="text-slate-400 mx-1">/</span>);
    }
  });

  return <div className="flex flex-wrap items-center">{elements}</div>;
}
