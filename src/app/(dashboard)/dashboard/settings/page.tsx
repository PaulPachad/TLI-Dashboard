"use client";

// ==============================================================================
// Settings Page — Client settings and profile defaults
// ==============================================================================

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { SheetImportForm } from "@/components/admin/sheet-import-form";

export default function SettingsPage() {
  const sessionContext = useSession();
  const session = sessionContext?.data;
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [bannerMessage, setBannerMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    signature: "",
    schedulingLink: "",
    defaultHashtags: "",
    defaultSignoff: "",
    replyToEmail: "",
  });

  const userRole = (session?.user as { role?: string })?.role;
  const isClient = userRole === "CLIENT";

  async function fetchSettings() {
    try {
      setFetching(true);
      const res = await fetch("/api/clients/settings");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load settings.");
      }
      if (data.client) {
          setForm({
            name: data.client.name || "",
            email: data.client.email || "",
            signature: data.client.signature || "",
          schedulingLink: data.client.schedulingLink || "",
          defaultHashtags: data.client.defaultHashtags || "",
          defaultSignoff: data.client.defaultSignoff || "",
          replyToEmail: data.client.replyToEmail || "",
        });
      }
    } catch (err) {
      setBannerMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to load settings.",
      });
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (session?.user && isClient) {
      // Fetching is the external synchronization performed by this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchSettings();
    }
  }, [session?.user, isClient]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setBannerMessage(null);
      const res = await fetch("/api/clients/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update settings.");
      }

      setBannerMessage({ type: "success", text: "Settings updated successfully!" });
    } catch (err: unknown) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "An error occurred.",
      });
    } finally {
      setLoading(false);
    }
  }

  if (fetching && isClient) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account Settings</h1>
        <p className="text-slate-500 mt-1">Manage your account profile and default options</p>
      </div>

      {(bannerMessage !== null ? (
        <div
          role="alert"
          className={`p-4 rounded-xl text-sm font-medium border animate-fade-in ${
            bannerMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {bannerMessage.text}
        </div>
      ) : null) as React.ReactNode}

      {/* Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Details (Read-only Card) */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
              Your Profile
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block">Name</label>
                <span className="text-sm font-medium text-slate-900 block mt-1">
                  {session?.user?.name || "N/A"}
                </span>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block">Email</label>
                <span className="text-sm font-medium text-slate-900 block mt-1 break-all">
                  {session?.user?.email}
                </span>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block">Account Role</label>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 mt-2">
                  {userRole}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Configurations Form */}
        <div className="md:col-span-2">
          {isClient ? (
            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 space-y-6">
                <h2 className="text-lg font-semibold text-slate-900">Profile & Incubator Defaults</h2>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label htmlFor="clientName" className="block text-sm font-medium text-slate-700 mb-1">
                      Client Name
                    </label>
                    <input
                      type="text"
                      id="clientName"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="clientEmail" className="block text-sm font-medium text-slate-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      id="clientEmail"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
                
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Reply-To Email */}
                  <div>
                    <label htmlFor="replyToEmail" className="block text-sm font-medium text-slate-700 mb-1">
                      Reply-To Email
                    </label>
                    <input
                      type="email"
                      id="replyToEmail"
                      value={form.replyToEmail}
                      onChange={(e) => setForm({ ...form, replyToEmail: e.target.value })}
                      placeholder="e.g. yourname@company.com"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Where replies from interviewees will go.
                    </p>
                  </div>

                  {/* Scheduling Link */}
                  <div>
                    <label htmlFor="schedulingLink" className="block text-sm font-medium text-slate-700 mb-1">
                      Zoom/Scheduling Link
                    </label>
                    <input
                      type="url"
                      id="schedulingLink"
                      value={form.schedulingLink}
                      onChange={(e) => setForm({ ...form, schedulingLink: e.target.value })}
                      placeholder="e.g. https://calendly.com/your-link"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Used in the Zoom invitation emails.
                    </p>
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Default Sign-off */}
                  <div>
                    <label htmlFor="defaultSignoff" className="block text-sm font-medium text-slate-700 mb-1">
                      Default Email Sign-off
                    </label>
                    <input
                      type="text"
                      id="defaultSignoff"
                      value={form.defaultSignoff}
                      onChange={(e) => setForm({ ...form, defaultSignoff: e.target.value })}
                      placeholder="e.g. Warmly, Best regards"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Default Hashtags */}
                  <div>
                    <label htmlFor="defaultHashtags" className="block text-sm font-medium text-slate-700 mb-1">
                      Default LinkedIn Hashtags
                    </label>
                    <input
                      type="text"
                      id="defaultHashtags"
                      value={form.defaultHashtags}
                      onChange={(e) => setForm({ ...form, defaultHashtags: e.target.value })}
                      placeholder="e.g. #Leadership #Incubator"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Email Signature */}
                <div>
                  <label htmlFor="signature" className="block text-sm font-medium text-slate-700 mb-1">
                    Email Signature
                  </label>
                  <textarea
                    id="signature"
                    rows={4}
                    value={form.signature}
                    onChange={(e) => setForm({ ...form, signature: e.target.value })}
                    placeholder="John Doe&#10;Founder & CEO, MyCompany"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none font-mono text-xs"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Appended to the end of all follow-up emails.
                  </p>
                </div>
              </div>

              {/* Form Actions */}
              <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-200">
                <button
                  type="submit"
                  id="save-settings-btn"
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Admin Configuration</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                As an Admin user, you do not have associated client organization settings. You can manage
                clients, sync data sheets, and perform administration operations via the Admin Dashboard.
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100 flex gap-3">
                <Link
                  href="/admin"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  Go to Admin Panel
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Google Sheet Import — only for CLIENT users */}
      {isClient && (session?.user as { clientId?: string })?.clientId && (
        <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Google Sheet</h2>
          <p className="text-sm text-slate-500 mb-4">
            Link your Authority Magazine interview spreadsheet to import and sync your data.
          </p>
          <SheetImportForm clientId={(session!.user as { clientId?: string }).clientId as string} />
        </div>
      )}
    </div>
  );
}
