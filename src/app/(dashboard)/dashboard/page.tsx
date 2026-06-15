import { DashboardPanels } from "@/components/dashboard/dashboard-panels";
import { SyncButton } from "@/components/dashboard/sync-button";
import { requireAuth } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

export default async function DashboardHomePage() {
  const user = await requireAuth();

  // Fetch topics and events for this client
  let topics: any[] = [];
  let events: any[] = [];
  
  if (user.clientId) {
    topics = await prisma.topic.findMany({
      where: { clientId: user.clientId },
      orderBy: { createdAt: "desc" },
    });
    events = await prisma.event.findMany({
      where: { clientId: user.clientId },
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
