interface ClientLoginUser {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
}

export interface ExistingClientForAdminUpdate {
  id: string;
  email: string;
  replyToEmail?: string | null;
  users: ClientLoginUser[];
}

export interface NormalizedAdminClientUpdate {
  data: {
    name?: string;
    company?: string | null;
    email?: string;
    replyToEmail?: string | null;
    topicsSheetUrl?: string | null;
  };
  normalizedEmail: string | null;
  newPassword: string | null;
}

export function normalizeAdminClientUpdate(
  body: Record<string, unknown>,
  existingClient: ExistingClientForAdminUpdate
): NormalizedAdminClientUpdate {
  const data: NormalizedAdminClientUpdate["data"] = {};

  if ("name" in body) {
    const normalizedName = String(body.name || "").trim();
    if (!normalizedName) {
      throw new AdminClientUpdateError("Client name is required.");
    }
    data.name = normalizedName;
  }

  if ("company" in body) {
    data.company = String(body.company || "").trim() || null;
  }

  if ("topicsSheetUrl" in body) {
    data.topicsSheetUrl = String(body.topicsSheetUrl || "").trim() || null;
  }

  let normalizedEmail: string | null = null;
  if ("email" in body) {
    normalizedEmail = String(body.email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      throw new AdminClientUpdateError("Client email is required.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new AdminClientUpdateError("Enter a valid client email address.");
    }

    data.email = normalizedEmail;
    if (
      !existingClient.replyToEmail ||
      existingClient.replyToEmail.toLowerCase() ===
        existingClient.email.toLowerCase()
    ) {
      data.replyToEmail = normalizedEmail;
    }
  }

  let newPassword: string | null = null;
  if ("password" in body) {
    newPassword = String(body.password || "");
    if (newPassword && newPassword.length < 8) {
      throw new AdminClientUpdateError(
        "Client passwords must be at least 8 characters."
      );
    }
    if (!newPassword) {
      newPassword = null;
    }
  }

  if (Object.keys(data).length === 0 && !newPassword) {
    throw new AdminClientUpdateError("No client changes were provided.");
  }

  return { data, normalizedEmail, newPassword };
}

export function selectClientLoginUser(
  existingClient: ExistingClientForAdminUpdate
): ClientLoginUser | null {
  return (
    existingClient.users.find(
      (user) =>
        user.role === "CLIENT" &&
        user.email.toLowerCase() === existingClient.email.toLowerCase()
    ) ||
    existingClient.users.find((user) => user.role === "CLIENT") ||
    null
  );
}

export class AdminClientUpdateError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
