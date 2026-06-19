"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ClientProfileEditorProps {
  clientId: string;
  initialName: string;
  initialCompany: string | null;
  initialEmail: string;
}

export function ClientProfileEditor({
  clientId,
  initialName,
  initialCompany,
  initialEmail,
}: ClientProfileEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [company, setCompany] = useState(initialCompany || "");
  const [email, setEmail] = useState(initialEmail);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim(),
          email: email.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not update this client.");
      }

      setMessage(
        data.loginEmail
          ? `Client email and login updated to ${data.loginEmail}.`
          : "Client profile updated."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this client.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Client Profile</h2>
          <p className="text-sm text-slate-500">
            Update the client-facing profile and login email.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-0"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">
            Client Name
          </span>
          <input
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">
            Company
          </span>
          <input
            type="text"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">
            Client Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
          />
        </label>
      </div>

      {message && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}
    </form>
  );
}
