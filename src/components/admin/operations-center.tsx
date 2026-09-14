"use client";

import { useMemo, useState } from "react";
import type { OperationsSnapshot, OperationsStatus } from "@/lib/operations/service";

interface OperationsCenterProps {
  initialData: OperationsSnapshot;
}

type LoadState = "idle" | "loading" | "error" | "permission";

export function OperationsCenter({ initialData }: OperationsCenterProps) {
  const [data, setData] = useState(initialData);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OperationsStatus>("all");

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.clients.filter((client) => {
      const matchesStatus = statusFilter === "all" || client.status === statusFilter;
      const haystack = [
        client.clientName,
        client.managedBy,
        client.sheetTitle || "",
        client.statusLabel,
      ]
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [data.clients, query, statusFilter]);

  async function refreshStatus() {
    setLoadState("loading");
    setError(null);
    try {
      const [healthRes, runsRes, clientsRes] = await Promise.all([
        fetch("/api/admin/operations/health"),
        fetch("/api/admin/operations/runs"),
        fetch("/api/admin/operations/clients"),
      ]);

      if ([healthRes, runsRes, clientsRes].some((res) => res.status === 401 || res.status === 403)) {
        setLoadState("permission");
        return;
      }
      if (!healthRes.ok || !runsRes.ok || !clientsRes.ok) {
        throw new Error("Could not load operations status.");
      }

      const [health, runs, clients] = await Promise.all([
        healthRes.json(),
        runsRes.json(),
        clientsRes.json(),
      ]);

      setData((current) => ({
        ...current,
        generatedAt: health.generatedAt,
        environment: health.environment,
        appsScript: health.appsScript,
        healthCards: health.healthCards,
        partialDataMessage: health.partialDataMessage || runs.partialDataMessage || null,
        recentRuns: runs.runs || [],
        clients: clients.clients || [],
      }));
      setLoadState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load operations status.");
      setLoadState("error");
    }
  }

  if (loadState === "permission") {
    return (
      <main className="rounded-lg border border-amber-200 bg-amber-50 p-6" aria-labelledby="operations-denied-title">
        <h1 id="operations-denied-title" className="text-lg font-semibold text-amber-950">
          Admin access required
        </h1>
        <p className="mt-2 text-sm text-amber-900">
          Your session no longer has access to operations status. Sign in as an admin to continue.
        </p>
      </main>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Authority Operations Center
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Monitor publishing, marketing automation, reports, and row-level issues without exposing live automation controls.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={data.environment} status="unknown" />
          <StatusPill label={data.appsScript.statusLabel} status={data.appsScript.connected ? "ready" : "attention"} />
          <StatusPill label={`Apps Script ${data.appsScript.version}`} status="unknown" />
          <button
            type="button"
            onClick={refreshStatus}
            disabled={loadState === "loading"}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            {loadState === "loading" ? "Refreshing..." : "Refresh Status"}
          </button>
        </div>
      </header>

      <div className="sr-only" aria-live="polite">
        {loadState === "loading" ? "Refreshing operations status." : ""}
        {loadState === "error" ? error : ""}
      </div>

      {data.partialDataMessage && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3" aria-label="Partial data notice">
          <p className="text-sm font-medium text-amber-950">{data.partialDataMessage}</p>
        </section>
      )}

      {loadState === "error" && (
        <section className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3" role="alert">
          <p className="text-sm font-medium text-rose-900">{error}</p>
          <button
            type="button"
            onClick={refreshStatus}
            className="mt-3 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
          >
            Try Again
          </button>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white" aria-labelledby="bridge-setup-title">
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="bridge-setup-title" className="text-base font-semibold text-slate-900">
              Read-Only Bridge Setup
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Connect this before enabling daily or weekly run buttons. No write actions are active here yet.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.appsScript.projectUrl && (
              <a
                href={data.appsScript.projectUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open Apps Script
              </a>
            )}
            <button
              type="button"
              disabled
              title="Commands stay disabled until the read-only bridge is connected and verified"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400"
            >
              Run Buttons Locked
            </button>
          </div>
        </div>
        <div className="grid gap-3 border-t border-slate-100 px-5 py-4 md:grid-cols-3">
          <BridgeSetupItem
            label="Web App URL"
            value={data.appsScript.setup.urlConfigured ? "Configured" : "Missing"}
            ready={data.appsScript.setup.urlConfigured}
          />
          <BridgeSetupItem
            label="Shared Secret"
            value={data.appsScript.setup.secretConfigured ? "Configured" : "Missing"}
            ready={data.appsScript.setup.secretConfigured}
          />
          <BridgeSetupItem
            label="Bridge File"
            value={data.appsScript.setup.bridgeFile}
            ready
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Operations health">
        {data.healthCards.map((card) => (
          <article key={card.key} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-600">{card.label}</h2>
                <p className="mt-2 text-2xl font-bold text-slate-950">{card.value}</p>
              </div>
              <StatusDot status={card.status} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white" aria-labelledby="quick-actions-title">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="quick-actions-title" className="text-lg font-semibold text-slate-900">
            Main Actions
          </h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 lg:grid-cols-2">
            <DisabledPrimaryAction
              label="Run Daily Update"
              detail="Dashboard updater"
              icon="calendar"
            />
            <DisabledPrimaryAction
              label="Run Weekly Marketing Automation"
              detail="Authority Press emails and reports"
              icon="mail"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {["Refresh Status", "Diagnose Client", "Update Client Now", "View Latest Report"].map((label) => (
              <button
                key={label}
                type="button"
                disabled
                title="Disabled while the Operations Center is read-only"
                className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-500"
              >
                {label}
                <span className="mt-1 block text-xs font-medium text-slate-400">Read-only bridge</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section className="rounded-lg border border-slate-200 bg-white" aria-labelledby="clients-title">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 id="clients-title" className="text-lg font-semibold text-slate-900">
                  Client Portals
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Actions are visible but disabled until signed Apps Script commands exist.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor="operations-client-search">
                  Search clients
                </label>
                <input
                  id="operations-client-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search clients"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
                <label className="sr-only" htmlFor="operations-status-filter">
                  Filter client status
                </label>
                <select
                  id="operations-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | OperationsStatus)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="all">All statuses</option>
                  <option value="ready">Ready</option>
                  <option value="attention">Needs attention</option>
                  <option value="blocked">Blocked</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">Client</th>
                  <th scope="col" className="px-5 py-3">Master Row</th>
                  <th scope="col" className="px-5 py-3">Unpublished</th>
                  <th scope="col" className="px-5 py-3">Last Updated</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                      {data.clients.length === 0 ? "No clients have been imported yet." : "No clients match this view."}
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((client) => (
                    <tr key={client.id}>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{client.clientName}</div>
                        <div className="mt-1 text-xs text-slate-500">{client.managedBy}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{client.masterRow}</td>
                      <td className="px-5 py-4 font-semibold text-slate-900">{client.unpublishedCount}</td>
                      <td className="px-5 py-4 text-slate-600">{formatDate(client.lastUpdated)}</td>
                      <td className="px-5 py-4">
                        <StatusPill label={client.statusLabel} status={client.status} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-400">
                            Diagnose
                          </button>
                          <button type="button" disabled className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-400">
                            Update
                          </button>
                          {client.sheetUrl ? (
                            <a
                              href={client.sheetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Open Sheet
                            </a>
                          ) : (
                            <span className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-400">
                              No Sheet
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white" aria-labelledby="runs-title">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 id="runs-title" className="text-lg font-semibold text-slate-900">
                Recent Runs
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {data.recentRuns.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  No Apps Script automation runs are visible in the SaaS yet.
                </p>
              ) : (
                data.recentRuns.map((run) => (
                  <article key={run.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{run.type}</h3>
                        <p className="mt-1 text-xs text-slate-500">{run.requestedBy}</p>
                      </div>
                      <StatusPill label={run.status.replace(/_/g, " ")} status={run.status === "completed" ? "ready" : "unknown"} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {formatDate(run.startedAt)} - {run.counts.sent} sent, {run.counts.skipped + run.counts.failed} skipped/failed
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white" aria-labelledby="errors-title">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 id="errors-title" className="text-lg font-semibold text-slate-900">
                Error Queue Preview
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {data.errors.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  No open operations errors are visible.
                </p>
              ) : (
                data.errors.map((item) => (
                  <article key={item.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{item.label}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                      </div>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {item.count}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function BridgeSetupItem({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
        <StatusDot status={ready ? "ready" : "attention"} />
      </div>
      <p className="mt-2 break-words text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function StatusPill({ label, status }: { label: string; status: OperationsStatus }) {
  const colors = {
    ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
    attention: "border-amber-200 bg-amber-50 text-amber-700",
    blocked: "border-rose-200 bg-rose-50 text-rose-700",
    unknown: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${colors[status]}`}>
      {label}
    </span>
  );
}

function DisabledPrimaryAction({
  label,
  detail,
  icon,
}: {
  label: string;
  detail: string;
  icon: "calendar" | "mail";
}) {
  return (
    <button
      type="button"
      disabled
      title="Disabled while the Operations Center is read-only"
      className="flex min-h-24 items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 text-left text-slate-500"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
        {icon === "calendar" ? <CalendarIcon /> : <MailIcon />}
      </span>
      <span>
        <span className="block text-base font-bold text-slate-600">{label}</span>
        <span className="mt-1 block text-sm font-medium text-slate-400">{detail}</span>
        <span className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-400">
          Read-only bridge
        </span>
      </span>
    </button>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25m10.5-2.25v2.25M3.75 8.25h16.5M5.25 5.25h13.5A1.5 1.5 0 0120.25 6.75v12A1.5 1.5 0 0118.75 20.25H5.25a1.5 1.5 0 01-1.5-1.5v-12a1.5 1.5 0 011.5-1.5z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 7.5v9A2.25 2.25 0 0119.5 18.75h-15A2.25 2.25 0 012.25 16.5v-9m19.5 0A2.25 2.25 0 0019.5 5.25h-15A2.25 2.25 0 002.25 7.5m19.5 0l-8.59 5.154a2.25 2.25 0 01-2.32 0L2.25 7.5" />
    </svg>
  );
}

function StatusDot({ status }: { status: OperationsStatus }) {
  const colors = {
    ready: "bg-emerald-500",
    attention: "bg-amber-500",
    blocked: "bg-rose-500",
    unknown: "bg-slate-400",
  };
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
      <span className={`h-2.5 w-2.5 rounded-full ${colors[status]}`} aria-hidden="true" />
      {status === "ready" ? "Ready" : status === "attention" ? "Attention" : status === "blocked" ? "Blocked" : "Unknown"}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
