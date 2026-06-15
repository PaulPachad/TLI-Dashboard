"use client";

// ==============================================================================
// Admin Import Page — Select client and import Google Sheets data
// ==============================================================================

import { useState, useEffect } from "react";
import Link from "next/link";
import { SheetImportForm } from "@/components/admin/sheet-import-form";

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

export default function AdminImportPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchClients() {
    try {
      setLoading(true);
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to load clients.");
      const data = await res.json();
      setClients(data.clients || []);
      if (data.clients && data.clients.length > 0) {
        setSelectedClientId(data.clients[0].id);
      }
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

  return (
    <div className="space-y-6 max-w-4xl animate-slide-up">
      {/* Header */}
      <div>
        <Link
          href="/admin"
          className="text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Import Interview Data</h1>
        <p className="text-slate-500 mt-1">Import published interviews from Google Sheets for a specific client</p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <p className="text-sm text-slate-500">Loading clients…</p>
          </div>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
          <p className="font-semibold">Error Loading Clients</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-900">No clients found</h3>
          <p className="text-sm text-slate-500 mt-1">You must create a client account before you can import data.</p>
          <Link
            href="/admin/clients/new"
            className="inline-flex items-center gap-1.5 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors mt-4"
          >
            + Create Client
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Client Selector */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <label htmlFor="client-select" className="block text-sm font-medium text-slate-700 mb-1">
                Select Client
              </label>
              <select
                id="client-select"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.company ? `(${c.company})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Import Form */}
          {selectedClientId && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <SheetImportForm clientId={selectedClientId} key={selectedClientId} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
