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
  
  if (user.clientId) {
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
        <div>
          <SyncButton />
        </div>
      </div>

      <DashboardPanels topics={topics} events={events} />
    </div>
  );
}
