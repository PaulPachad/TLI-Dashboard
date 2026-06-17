"use client";

import { useMemo, useState } from "react";
import { Event } from "@prisma/client";
import { buildEventOutreachEmailBody } from "@/lib/email/copy";

function parseEventDate(dateStr: string | null): Date {
  if (!dateStr) return new Date(864000000000000); // Sort undated events at the very end

  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  
  const str = dateStr.toLowerCase();
  
  // Find the first month mentioned in the date string
  let foundMonthIndex = -1;
  let earliestPos = Infinity;
  
  months.forEach((m, idx) => {
    const pos = str.indexOf(m);
    if (pos !== -1 && pos < earliestPos) {
      earliestPos = pos;
      foundMonthIndex = idx;
    }
  });

  if (foundMonthIndex === -1) {
    return new Date(864000000000000); // Unknown month at the end
  }

  // Extract day number following the month
  const afterMonth = str.substring(earliestPos + months[foundMonthIndex].length);
  const dayMatch = afterMonth.match(/\d+/);
  const day = dayMatch ? parseInt(dayMatch[0], 10) : 1;

  // Assume year 2026 (matching dashboard context)
  return new Date(2026, foundMonthIndex, day);
}

export function EventsGrid({ events }: { events: Event[] }) {
  const [viewMode, setViewMode] = useState<"grid" | "city">("grid");
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <div
        data-tour="events-controls"
        className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500"
      >
        <p>No upcoming events.</p>
        <p className="text-sm">Events will appear here once synced.</p>
      </div>
    );
  }

  // Sort helper
  const sortEvents = (list: Event[]) => {
    return [...list].sort((a, b) => {
      if (sortBy === "date") {
        return parseEventDate(a.date).getTime() - parseEventDate(b.date).getTime();
      } else {
        return a.eventName.localeCompare(b.eventName);
      }
    });
  };

  // Group events by city
  const groupedByCity = events.reduce((acc, event) => {
    const city = event.location ? event.location.trim() : "Other / Virtual";
    if (!acc[city]) acc[city] = [];
    acc[city].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  // Sort cities alphabetically
  const sortedCities = Object.keys(groupedByCity).sort((a, b) => a.localeCompare(b));

  const renderEventCard = (event: Event) => (
    <div
      key={event.id}
      data-tour="event-card"
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
        <button
          type="button"
          data-tour="event-email-contact"
          onClick={() => setSelectedEvent(event)}
          className="mt-2 inline-flex min-h-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
        >
          Email Contact
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {notice && (
        <div
          role="status"
          className="flex items-start justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="font-semibold text-emerald-700 hover:text-emerald-900"
            aria-label="Dismiss notification"
          >
            Close
          </button>
        </div>
      )}

      {/* Controls panel */}
      <div
        data-tour="events-controls"
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">View Mode:</span>
          <div className="inline-flex rounded-lg bg-slate-200 p-0.5">
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
              onClick={() => setViewMode("city")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                viewMode === "city"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Group by City
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Sort By:</span>
          <div className="inline-flex rounded-lg bg-slate-200 p-0.5">
            <button
              onClick={() => setSortBy("date")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                sortBy === "date"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Date
            </button>
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
          </div>
        </div>
      </div>

      {/* Events Listing */}
      {viewMode === "grid" ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sortEvents(events).map(renderEventCard)}
        </div>
      ) : (
        <div className="space-y-10">
          {sortedCities.map((city) => {
            const cityEvents = sortEvents(groupedByCity[city]);
            return (
              <div key={city} className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <svg
                    className="h-5 w-5 text-indigo-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <h2 className="text-xl font-bold text-slate-800">{city}</h2>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                    {cityEvents.length} {cityEvents.length === 1 ? "Event" : "Events"}
                  </span>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {cityEvents.map(renderEventCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedEvent && (
        <EventOutreachModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onSuccess={(message) => {
            setNotice(message);
            setSelectedEvent(null);
          }}
        />
      )}
    </div>
  );
}

function renderContactLinks(contactStr: string) {
  if (!contactStr) return null;
  const tokens = contactStr.split(/[\s,;]+/).filter(Boolean);
  const elements: React.ReactNode[] = [];

  tokens.forEach((token, idx) => {
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

function EventOutreachModal({
  event,
  onClose,
  onSuccess,
}: {
  event: Event;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const defaultRecipients = useMemo(
    () => extractEmails(event.contactInfo || "").join(", "),
    [event.contactInfo]
  );
  const [recipients, setRecipients] = useState(defaultRecipients);
  const [subject, setSubject] = useState(`Press opportunities for ${event.eventName}`);
  const [body, setBody] = useState(buildEventOutreachEmailBody(event));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    try {
      setSending(true);
      setError(null);

      const response = await fetch(`/api/outreach/events/${event.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, subject, body }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not send event outreach.");
      }
      onSuccess(data.note || "Event outreach sent.");
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Could not send event outreach."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-6">
      <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Event outreach email"
        className="relative z-50 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl animate-slide-up"
      >
        <div className="border-b border-slate-100 p-5 pr-14">
          <h3 className="text-lg font-semibold text-slate-900">Email Event Contact</h3>
          <p className="mt-1 text-sm text-slate-500">
            Send an Authority Magazine press-opportunity request for {event.eventName}.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close event outreach"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              To
            </label>
            <textarea
              required
              rows={2}
              value={recipients}
              onChange={(eventChange) => setRecipients(eventChange.target.value)}
              placeholder="contact@example.com, press@example.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Subject
            </label>
            <input
              required
              value={subject}
              onChange={(eventChange) => setSubject(eventChange.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Body
            </label>
            <textarea
              required
              rows={12}
              value={body}
              onChange={(eventChange) => setBody(eventChange.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !recipients.trim()}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send Email"}
          </button>
        </div>
      </form>
    </div>
  );
}

function extractEmails(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.replace(/[<>()]/g, "").trim().toLowerCase())
        .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
    ),
  ];
}
