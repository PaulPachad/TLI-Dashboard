"use client";

// ==============================================================================
// Settings Page — Client settings, spreadsheet auto-sync & password management
// ==============================================================================

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { SheetImportForm } from "@/components/admin/sheet-import-form";

const SERVICE_ACCOUNT_EMAIL = "tli-dashboard@gen-lang-client-0870177061.iam.gserviceaccount.com";

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
    topicsSheetUrl: "",
    authorityColumnUrl: "",
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
          topicsSheetUrl: data.client.topicsSheetUrl || "",
          authorityColumnUrl: data.client.authorityColumnUrl || "",
        });
      }
    } catch (err) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to load settings.",
      });
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (session?.user && isClient) {
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

      let successText = "Settings updated successfully!";

      // If topicsSheetUrl is non-empty, auto-trigger topics & events sync
      if (form.topicsSheetUrl && form.topicsSheetUrl.trim()) {
        try {
          const syncRes = await fetch("/api/sync-topics", { method: "POST" });
          const syncData = await syncRes.json();
          if (syncRes.ok) {
            successText = `Settings saved! Auto-synced ${syncData.topicsCount ?? 0} topics and ${syncData.eventsCount ?? 0} events from your sheet.`;
          } else {
            successText = `Settings saved, but topics sync encountered an issue: ${syncData.error || "Please verify Google Sheets viewer permissions."}`;
          }
        } catch (syncErr) {
          successText = `Settings saved, but auto-sync could not complete: ${syncErr instanceof Error ? syncErr.message : "Network error"}`;
        }
      }

      setBannerMessage({ type: "success", text: successText });
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
        <p className="text-slate-500 mt-1">Manage your account profile, spreadsheet auto-sync, and default options</p>
      </div>

      {/* Google Service Account Chip */}
      <ServiceAccountChip />

      {bannerMessage && (
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
      )}

      {/* Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Profile Card + Password Change Card */}
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

          {/* Self-Service Password Change */}
          <PasswordChangeCard />
        </div>

        {/* Configurations Form */}
        <div className="md:col-span-2">
          {isClient ? (
            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 space-y-6">
                <h2 className="text-lg font-semibold text-slate-900">Profile &amp; Incubator Defaults</h2>

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
                      Zoom / Scheduling Link
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

                  {/* Authority Column URL */}
                  <div className="sm:col-span-2">
                    <label htmlFor="authorityColumnUrl" className="block text-sm font-medium text-slate-700 mb-1">
                      Authority / Medium Column URL
                    </label>
                    <input
                      type="url"
                      id="authorityColumnUrl"
                      value={form.authorityColumnUrl}
                      onChange={(e) => setForm({ ...form, authorityColumnUrl: e.target.value })}
                      placeholder="e.g. https://medium.com/@JimHamel"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Adds a top dashboard button linking to your main Authority Magazine or Medium column.
                    </p>
                  </div>

                  {/* Section 1: Topics & Events Google Sheet */}
                  <div id="topics-sheet" className="sm:col-span-2 scroll-mt-6 border-t border-slate-100 pt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">1</span>
                      <h3 className="text-base font-semibold text-slate-900">1. Topics &amp; Events Google Sheet</h3>
                    </div>
                    <label htmlFor="topicsSheetUrl" className="block text-sm font-medium text-slate-700 mb-1">
                      Google Sheet URL (Topics &amp; Events)
                    </label>
                    <input
                      type="url"
                      id="topicsSheetUrl"
                      value={form.topicsSheetUrl}
                      onChange={(e) => setForm({ ...form, topicsSheetUrl: e.target.value })}
                      placeholder="e.g. https://docs.google.com/spreadsheets/d/..."
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Powers your <strong>Topics</strong> and <strong>Events</strong> tabs. Saving settings automatically triggers an immediate sync. Ensure the Google Service Account has viewer access.
                    </p>
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
                    placeholder="John Doe&#10;Founder &amp; CEO, MyCompany"
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
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {loading ? "Saving & Syncing..." : "Save Settings"}
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

      {/* Section 2: Published & Upcoming Interviews Google Sheet */}
      {isClient && (session?.user as { clientId?: string })?.clientId && (
        <div id="sheet-import" className="animate-slide-up scroll-mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">2</span>
            <h2 className="text-lg font-semibold text-slate-900">2. Published &amp; Upcoming Interviews Google Sheet</h2>
          </div>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Link your master Authority Magazine interview spreadsheet to import and sync interview progress, published articles, and VIP records.
          </p>
          <SheetImportForm
            clientId={(session!.user as { clientId?: string }).clientId as string}
            initialTopicsSheetUrl={form.topicsSheetUrl}
          />
        </div>
      )}
    </div>
  );
}

function ServiceAccountChip() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-900">
          Google Sheets Service Account Access
        </p>
        <p className="text-xs text-indigo-700">
          Share your Google Sheets with this address as <strong className="font-semibold text-indigo-950">Viewer</strong> to enable automated sync:
        </p>
        <code className="inline-block mt-0.5 font-mono text-xs text-slate-800 bg-white/90 px-2 py-1 rounded border border-indigo-200 break-all select-all">
          {SERVICE_ACCOUNT_EMAIL}
        </code>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(SERVICE_ACCOUNT_EMAIL);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="shrink-0 self-start sm:self-center inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-2xs hover:bg-indigo-50 transition-colors"
      >
        {copied ? "✓ Copied Email!" : "📋 Copy Service Account Email"}
      </button>
    </div>
  );
}

function PasswordChangeCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "New password must be at least 8 characters long." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "New password and confirmation do not match." });
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/clients/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to change password.");
      }

      setMessage({ type: "success", text: "Password changed successfully!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to change password.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
        Change Password
      </h2>
      <form onSubmit={handlePasswordChange} className="space-y-4">
        {message && (
          <div
            role="alert"
            className={`p-3 rounded-lg text-xs font-medium border ${
              message.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {message.text}
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">
            Current Password
          </label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">
            New Password
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <span className="text-[11px] text-slate-400 mt-0.5 block">Minimum 8 characters</span>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">
            Confirm New Password
          </label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
          className="w-full mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
        >
          {submitting ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
