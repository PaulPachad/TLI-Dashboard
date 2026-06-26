import { DashboardPanels } from "@/components/dashboard/dashboard-panels";
import { SyncButton } from "@/components/dashboard/sync-button";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { UserRole } from "@/types/db";
import type { Event, Topic } from "@prisma/client";

export default async function DashboardHomePage() {
  const user = await requireAuth();

  // Fetch topics and events for this client
  let topics: Topic[] = [];
  let events: Event[] = [];
  let authorityColumnUrl: string | null = null;
  
  if (user.clientId) {
    const client = await db.client.findUnique({
      where: { id: user.clientId },
      select: { authorityColumnUrl: true },
    });
    authorityColumnUrl = client?.authorityColumnUrl || null;
    topics = await db.topic.findMany({
      where: { clientId: user.clientId },
      orderBy: { createdAt: "desc" },
    });
    events = await db.event.findMany({
      where: { clientId: user.clientId },
      orderBy: { createdAt: "desc" },
    });
  } else if (user.role === UserRole.ADMIN) {
    topics = await db.topic.findMany({
      orderBy: { createdAt: "desc" },
    });
    events = await db.event.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Your Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track and leverage your Authority Magazine interviews, topics, and events
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {authorityColumnUrl && (
            <a
              href={authorityColumnUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all duration-200 hover:border-indigo-300 hover:bg-indigo-50 active:bg-indigo-100"
            >
              <svg
                className="h-4 w-4 text-indigo-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5M8.25 15.75L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
              Authority Column
            </a>
          )}
          <SyncButton />
        </div>
      </div>

      <DashboardPanels topics={topics} events={events} />
    </div>
  );
}
