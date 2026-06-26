"use client";

// ==============================================================================
// Create Client Form — Admin creates a new TLI client
// ==============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClientForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ clientId: string; tempPassword?: string } | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    title: "",
    password: "",
    linkedinUrl: "",
    authorityColumnUrl: "",
    schedulingLink: "",
  });

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create client.");
        return;
      }

      setSuccess({
        clientId: data.client.id,
        tempPassword: data.tempPassword,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-emerald-800 text-lg">✓ Client Created</h3>
        <p className="text-emerald-700">
          Client <strong>{form.name}</strong> has been created.
        </p>
        {success.tempPassword && (
          <div className="bg-white border border-emerald-300 rounded-lg p-4">
            <p className="text-sm text-slate-600 mb-1">Temporary Password:</p>
            <p className="font-mono text-lg text-slate-900 select-all">{success.tempPassword}</p>
            <p className="text-xs text-slate-500 mt-2">
              Share this securely with the client. They can use it to log in.
            </p>
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/admin/clients/${success.clientId}`)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Import Google Sheet →
          </button>
          <button
            onClick={() => router.push("/admin/clients")}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Back to Clients
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
          <p className="text-rose-700 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="client-name" className="block text-sm font-medium text-slate-700 mb-1">
            Name *
          </label>
          <input
            id="client-name"
            type="text"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="John Smith"
            required
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="client-email" className="block text-sm font-medium text-slate-700 mb-1">
            Email *
          </label>
          <input
            id="client-email"
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="john@example.com"
            required
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="client-company" className="block text-sm font-medium text-slate-700 mb-1">
            Company
          </label>
          <input
            id="client-company"
            type="text"
            value={form.company}
            onChange={(e) => updateField("company", e.target.value)}
            placeholder="Acme Corp"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="client-title" className="block text-sm font-medium text-slate-700 mb-1">
            Title
          </label>
          <input
            id="client-title"
            type="text"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="CEO"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="client-password" className="block text-sm font-medium text-slate-700 mb-1">
            Password
          </label>
          <input
            id="client-password"
            type="password"
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Leave blank for auto-generated"
            minLength={8}
            autoComplete="new-password"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-xs text-slate-400 mt-1">Leave blank to auto-generate a temporary password.</p>
        </div>
        <div>
          <label htmlFor="client-linkedin" className="block text-sm font-medium text-slate-700 mb-1">
            LinkedIn URL
          </label>
          <input
            id="client-linkedin"
            type="url"
            value={form.linkedinUrl}
            onChange={(e) => updateField("linkedinUrl", e.target.value)}
            placeholder="https://linkedin.com/in/..."
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="client-authority-column" className="block text-sm font-medium text-slate-700 mb-1">
            Authority / Medium Column URL
          </label>
          <input
            id="client-authority-column"
            type="url"
            value={form.authorityColumnUrl}
            onChange={(e) => updateField("authorityColumnUrl", e.target.value)}
            placeholder="https://medium.com/@JimHamel"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-xs text-slate-400 mt-1">
            Adds a dashboard button to the client&apos;s main Authority column.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="client-scheduling" className="block text-sm font-medium text-slate-700 mb-1">
          Scheduling Link
        </label>
        <input
          id="client-scheduling"
          type="url"
          value={form.schedulingLink}
          onChange={(e) => updateField("schedulingLink", e.target.value)}
          placeholder="https://calendly.com/..."
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          id="create-client-btn"
          disabled={loading}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium
                     hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Creating..." : "Create Client"}
        </button>
      </div>
    </form>
  );
}
