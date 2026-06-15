"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

/* ============================================================================
   SVG Icons
   ============================================================================ */

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function ArrowUpTrayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function CogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/* ============================================================================
   Navigation
   ============================================================================ */

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const adminNavItems: NavItem[] = [
  { label: "Admin Panel", href: "/admin", icon: GridIcon },
  { label: "Clients", href: "/admin/clients", icon: UsersIcon },
  { label: "Import", href: "/admin/import", icon: ArrowUpTrayIcon },
];

const dashboardNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: GridIcon },
  { label: "Settings", href: "/dashboard/settings", icon: CogIcon },
];

/* ============================================================================
   Admin Layout
   ============================================================================ */

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessionContext = useSession();
  const session = sessionContext?.data;
  const status = sessionContext?.status ?? "loading";
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    else if (status === "authenticated" && userRole !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [router, status, userRole]);

  if (status === "unauthenticated") return null;

  // Loading
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }

  // Admin role check
  if (userRole !== "ADMIN") {
    return null;
  }

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  function handleSignOut() {
    signOut({ callbackUrl: "/login" });
  }

  const SidebarContent = (
    <nav className="flex flex-1 flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-6">
        <Image src="/logo.png" alt="" width={32} height={32} priority unoptimized className="bg-white rounded-sm" />
        <span className="text-sm font-bold text-slate-900">TLI Leverage</span>
      </div>

      <div className="flex-1 space-y-1 px-3 py-4">
        {/* Dashboard Section */}
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Main
        </p>
        {dashboardNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              id={`admin-nav-${item.label.toLowerCase()}`}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        {/* Admin Section */}
        <p className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Admin
        </p>
        {adminNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              id={`admin-nav-${item.label.toLowerCase()}`}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* User Info Footer */}
      <div className="border-t border-slate-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
            {session?.user?.email?.[0]?.toUpperCase() ?? "A"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {session?.user?.name ?? session?.user?.email ?? "Admin"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {session?.user?.email}
            </p>
          </div>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl lg:hidden">
          <div className="absolute right-2 top-3">
            <button
              id="admin-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close sidebar"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          {SidebarContent}
        </aside>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white shadow-sm lg:flex lg:flex-col">
        {SidebarContent}
      </aside>

      {/* Main Area */}
      <div className="flex flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-sm lg:px-8">
          <div className="flex items-center gap-3">
            <button
              id="admin-sidebar-toggle"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Open sidebar"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <h1 className="text-sm font-semibold text-slate-900 lg:text-base">
              TLI Leverage Dashboard
            </h1>
            <span className="hidden rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 sm:inline">
              Admin
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:inline">
              {session?.user?.email}
            </span>
            <button
              id="admin-sign-out-button"
              onClick={handleSignOut}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
