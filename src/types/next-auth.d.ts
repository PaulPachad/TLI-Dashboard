// ==============================================================================
// Next-Auth type augmentation for role and clientId in session
// ==============================================================================

import { UserRole } from "@/types/db";
import "next-auth";

declare module "next-auth" {
  interface User {
    role?: UserRole;
    clientId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: UserRole;
      clientId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    clientId?: string | null;
  }
}
