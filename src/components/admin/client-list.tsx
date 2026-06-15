"use client";

// ==============================================================================
// Admin Client List — View all clients and their import status
// ==============================================================================

import { useState, useEffect } from "react";
import Link from "next/link";

interface ClientSummary {
  id: string;
  name: string;
  company: string | null;
  email: string;
  createdAt: string;
  _count: {
    interviews: number;
    sheetSources: number;
  };
  sheetSources: Array<{
    id: string;
    sheetTitle: string | null;
    lastSyncedAt: string | null;
  }>;
}

export function ClientList() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchClients() {
    try {
      setLoading(true);
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to load clients.");
      const data = await res.json();
      setClients(data.clients || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clients.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Fetching is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchClients();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="h-3 bg-slate-200 rounded w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center">
        <p className="text-rose-700">{error}</p>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">No clients yet</h3>
        <p className="text-slate-500 mb-4">Create your first client to get started.</p>
        <Link
          href="/admin/clients/new"
          className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + Create Client
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {clients.map((client) => (
        <Link
          key={client.id}
          href={`/admin/clients/${client.id}`}
          className="block bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <span className="text-indigo-600 font-semibold">
                  {client.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-900">{client.name}</h3>
                <p className="truncate text-sm text-slate-500">
                  {client.company ? `${client.company} · ` : ""}
                  {client.email}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 text-sm sm:justify-end sm:border-0 sm:pt-0">
              <div className="text-center">
                <p className="font-semibold text-slate-900">{client._count.interviews}</p>
                <p className="text-xs text-slate-400">Interviews</p>
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900">{client._count.sheetSources}</p>
                <p className="text-xs text-slate-400">Sheets</p>
              </div>
              <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
