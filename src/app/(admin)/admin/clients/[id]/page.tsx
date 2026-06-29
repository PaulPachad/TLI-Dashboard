import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { notFound } from "next/navigation";
import { SheetImportForm } from "@/components/admin/sheet-import-form";
import { InterviewGrid } from "@/components/dashboard/interview-grid";
import { DeleteClientButton } from "@/components/admin/delete-client-button";
import { ClientProfileEditor } from "@/components/admin/client-profile-editor";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const client = await db.client.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      company: true,
      email: true,
      topicsSheetUrl: true,
      _count: { select: { interviews: true } },
      sheetSources: {
        select: {
          id: true,
          sheetTitle: true,
          sheetUrl: true,
          lastSyncedAt: true,
        },
        orderBy: { lastSyncedAt: "desc" },
      },
    },
  });

  if (!client) notFound();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/admin/clients"
            className="text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            ← Back to Clients
          </Link>
          <div className="mt-3 flex min-w-0 items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <span className="text-indigo-600 font-bold text-xl">
                {client.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
              <p className="truncate text-slate-500">
                {client.company ? `${client.company} · ` : ""}{client.email}
              </p>
            </div>
          </div>
        </div>
        <div className="shrink-0">
          <DeleteClientButton clientId={client.id} clientName={client.name} />
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-indigo-600">{client._count.interviews}</p>
          <p className="text-xs text-slate-500 mt-0.5">Interviews Imported</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-indigo-600">{client.sheetSources.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">Sheet Sources</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-indigo-600">
            {client.sheetSources[0]?.lastSyncedAt
              ? new Date(client.sheetSources[0].lastSyncedAt).toLocaleDateString()
              : "Never"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Last Synced</p>
        </div>
      </div>

      <ClientProfileEditor
        clientId={client.id}
        initialName={client.name}
        initialCompany={client.company}
        initialEmail={client.email}
        initialAuthorityColumnUrl={null}
      />

      {/* Sheet import */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Import Google Sheet</h2>
        <SheetImportForm clientId={client.id} initialTopicsSheetUrl={client.topicsSheetUrl || ""} />
      </section>

      {/* Existing sheet sources */}
      {client.sheetSources.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Imported Sheets</h2>
          <div className="space-y-2">
            {client.sheetSources.map((source) => (
              <div
                key={source.id}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{source.sheetTitle || "Untitled"}</p>
                  <p className="truncate text-xs text-slate-400 sm:max-w-md">{source.sheetUrl}</p>
                </div>
                <p className="text-xs text-slate-400">
                  {source.lastSyncedAt
                    ? `Synced ${new Date(source.lastSyncedAt).toLocaleString()}`
                    : "Not synced"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Interviews */}
      {client._count.interviews > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Published Interviews</h2>
          <InterviewGrid clientId={client.id} />
        </section>
      )}
    </div>
  );
}
