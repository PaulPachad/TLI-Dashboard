import { UserRole } from "@/types/db";

export interface TenantScopedUser {
  role: UserRole | string;
  clientId: string | null;
}

export function canAccessClientResource(
  user: TenantScopedUser,
  resourceClientId: string | null | undefined
): boolean {
  if (user.role === UserRole.ADMIN || user.role === "ADMIN") return true;
  return Boolean(user.clientId && resourceClientId === user.clientId);
}

export function resolveRequestedClientId(
  user: TenantScopedUser,
  requestedClientId?: string | null
): string | null {
  if (user.role === UserRole.ADMIN || user.role === "ADMIN") {
    return requestedClientId?.trim() || null;
  }
  return user.clientId;
}
