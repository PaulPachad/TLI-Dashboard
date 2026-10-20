import { requireAdmin } from "@/lib/auth-helpers";

export const metadata = {
  title: "Friday Release Hub | Authority Magazine TLI",
  description: "Automated Mockup Sync, Live Feature Dispatch & Follow-up Release Control Center",
};

export default async function AdminReleasePage() {
  await requireAdmin();

  const releaseHubUrl =
    process.env.NEXT_PUBLIC_RELEASE_HUB_URL ||
    "https://authority-release-hub-wvwctuad2q-ue.a.run.app";

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full bg-slate-950 text-slate-100">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Friday Release Hub & Live Control Center
          </h1>
          <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Cloud Run 60m Runtime
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <a
            href="https://release.authoritymag.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-white transition flex items-center space-x-1"
          >
            <span>release.authoritymag.co</span>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <a
            href={releaseHubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md transition shadow"
          >
            Open Standalone Window
          </a>
        </div>
      </div>

      {/* Embedded Live Dashboard */}
      <div className="flex-1 w-full relative">
        <iframe
          src={releaseHubUrl}
          title="Authority Magazine Release Hub"
          className="w-full h-full border-0 absolute inset-0"
          allow="clipboard-write; clipboard-read"
        />
      </div>
    </div>
  );
}
