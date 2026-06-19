// ==============================================================================
// Auth Helpers — Session utilities and role guards
// ==============================================================================

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { UserRole } from "@/types/db";
import { redirect } from "next/navigation";

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  clientId: string | null;
  sessionVersion: number;
}

/**
 * Get the current session user, or null if not authenticated.
 * For use in Server Components and API routes.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  const user = session.user as Record<string, unknown>;
  const userId = typeof user.id === "string" ? user.id : null;
  if (!userId) return null;

  const dbUser = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      clientId: true,
      sessionVersion: true,
    },
  });

  if (!dbUser) return null;

  const tokenSessionVersion =
    typeof user.sessionVersion === "number" ? user.sessionVersion : 0;
  if (dbUser.sessionVersion !== tokenSessionVersion) return null;

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as UserRole,
    clientId: dbUser.clientId,
    sessionVersion: dbUser.sessionVersion,
  };
}

/**
 * Require authentication. Redirects to /login if not authenticated.
 * For use in Server Components.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Require admin role. Redirects to /dashboard if not admin.
 * For use in Server Components.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== UserRole.ADMIN) redirect("/dashboard");
  return user;
}

/**
 * Require a client ID. Returns the client ID or redirects.
 * For use in Server Components.
 */
export async function requireClientUser(): Promise<SessionUser & { clientId: string }> {
  const user = await requireAuth();
  if (!user.clientId && user.role !== UserRole.ADMIN) {
    redirect("/dashboard");
  }
  return user as SessionUser & { clientId: string };
}

/**
 * For API routes: get the user or return null (no redirect).
 */
export async function getApiUser(): Promise<SessionUser | null> {
  return getCurrentUser();
}

/**
 * For API routes: require auth and return 401 if not authenticated.
 * Returns the user or throws an object with status/message for the caller to return.
 */
export async function requireApiAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw { status: 401, message: "Authentication required." };
  }
  return user;
}

export async function requireApiAdmin(): Promise<SessionUser> {
  const user = await requireApiAuth();
  if (user.role !== UserRole.ADMIN) {
    throw { status: 403, message: "Admin access required." };
  }
  return user;
}
