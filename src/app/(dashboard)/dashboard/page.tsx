import { DashboardPanels } from "@/components/dashboard/dashboard-panels";
import { OnboardingChecklist, type ReadinessState } from "@/components/dashboard/onboarding-checklist";
import { SyncButton } from "@/components/dashboard/sync-button";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { UserRole } from "@/types/db";
import type { Event, Topic } from "@prisma/client";

export default async function DashboardHomePage() {
  const user = await requireAuth();

  // Fetch topics, events, and account readiness for this client
  let topics: Topic[] = [];
  let events: Event[] = [];
  let authorityColumnUrl: string | null = null;
  let readinessState: ReadinessState = {
    hasSheetConnected: false,
    hasEmailConfigured: false,
    hasSchedulingConfigured: false,
    hasFirstOutreachSent: false,
    isAdmin: user.role === UserRole.ADMIN,
    isClient: Boolean(user.clientId),
    clientId: user.clientId || null,
  };

  if (user.clientId) {
    const [authColUrl, topList, evList, clientData, sheetCount, interviewCount, actionCount] =
      await Promise.all([
        getClientAuthorityColumnUrl(user.clientId),
        db.topic.findMany({
          where: { clientId: user.clientId },
          orderBy: { createdAt: "desc" },
        }),
        db.event.findMany({
          where: { clientId: user.clientId },
          orderBy: { createdAt: "desc" },
        }),
        db.client.findUnique({
          where: { id: user.clientId },
          select: { replyToEmail: true, signature: true, schedulingLink: true },
        }),
        db.sheetSource.count({ where: { clientId: user.clientId } }),
        db.interview.count({ where: { clientId: user.clientId } }),
        db.action.count({
          where: {
            clientId: user.clientId,
            status: "SUCCESS",
            actionType: {
              in: [
                "LIVE_EMAIL_SENT",
                "ZOOM_INVITE_SENT",
                "LINKEDIN_POST_GENERATED",
                "MARKED_SHARED",
                "SOCIAL_IMAGE_GENERATED",
              ],
            },
          },
        }),
      ]);

    authorityColumnUrl = authColUrl;
    topics = topList;
    events = evList;

    readinessState = {
      hasSheetConnected: sheetCount > 0 || interviewCount > 0,
      hasEmailConfigured: Boolean(clientData?.replyToEmail || clientData?.signature),
      hasSchedulingConfigured: Boolean(clientData?.schedulingLink),
      hasFirstOutreachSent: actionCount > 0,
      isAdmin: false,
      isClient: true,
      clientId: user.clientId,
    };
  } else if (user.role === UserRole.ADMIN) {
    const [topList, evList, sheetCount, interviewCount, actionCount] = await Promise.all([
      db.topic.findMany({ orderBy: { createdAt: "desc" } }),
      db.event.findMany({ orderBy: { createdAt: "desc" } }),
      db.sheetSource.count(),
      db.interview.count(),
      db.action.count({ where: { status: "SUCCESS" } }),
    ]);
    topics = topList;
    events = evList;
    readinessState = {
      hasSheetConnected: sheetCount > 0 || interviewCount > 0,
      hasEmailConfigured: true,
      hasSchedulingConfigured: true,
      hasFirstOutreachSent: actionCount > 0,
      isAdmin: true,
      isClient: false,
      clientId: null,
    };
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

      {/* Account Readiness & Quick Start Checklist */}
      <OnboardingChecklist readiness={readinessState} />

      {/* Dashboard Panels (Interviews, Topics, Events, Tutorial) */}
      <DashboardPanels topics={topics} events={events} />
    </div>
  );
}

async function getClientAuthorityColumnUrl(
  clientId: string
): Promise<string | null> {
  try {
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { authorityColumnUrl: true },
    });
    return client?.authorityColumnUrl || null;
  } catch (error) {
    if (isMissingAuthorityColumnUrlColumnError(error)) {
      return null;
    }
    throw error;
  }
}

function isMissingAuthorityColumnUrlColumnError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : JSON.stringify(error);
  return (
    /authorityColumnUrl/.test(message) &&
    /does not exist|no such column|unknown column|invalid/i.test(message)
  );
}
