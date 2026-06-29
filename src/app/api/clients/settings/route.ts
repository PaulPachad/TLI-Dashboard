// ==============================================================================
// GET/PUT /api/clients/settings - Client profile settings
// ==============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { normalizeAuthorityColumnUrl } from "@/lib/clients/authority-column";

const clientSettingsSelect = {
  id: true,
  name: true,
  company: true,
  email: true,
  title: true,
  signature: true,
  linkedinUrl: true,
  schedulingLink: true,
  defaultHashtags: true,
  defaultSignoff: true,
  replyToEmail: true,
  topicsSheetUrl: true,
} as const;

// GET - Fetch current client settings
export async function GET() {
  try {
    const user = await requireApiAuth();

    if (!user.clientId) {
      return NextResponse.json({ client: null });
    }

    const client = await db.client.findUnique({
      where: { id: user.clientId },
      select: clientSettingsSelect,
    });

    const authorityColumnUrl = await getAuthorityColumnUrlIfAvailable(
      user.clientId
    );

    return NextResponse.json({
      client: client ? { ...client, authorityColumnUrl } : null,
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error fetching client settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings." },
      { status: 500 }
    );
  }
}

// PUT - Update client settings
export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiAuth();

    if (!user.clientId) {
      return NextResponse.json(
        { error: "Only client users can update settings." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      name,
      email,
      signature,
      schedulingLink,
      defaultHashtags,
      defaultSignoff,
      replyToEmail,
      topicsSheetUrl,
      authorityColumnUrl,
    } = body;
    const authorityColumnUrlWasProvided = "authorityColumnUrl" in body;
    const normalizedName = String(name || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedName || !normalizedEmail) {
      return NextResponse.json(
        { error: "Name and contact email are required." },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Enter a valid contact email address." },
        { status: 400 }
      );
    }
    const normalizedReplyTo = String(replyToEmail || "").trim().toLowerCase();
    if (
      normalizedReplyTo &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedReplyTo)
    ) {
      return NextResponse.json(
        { error: "Enter a valid reply-to email address." },
        { status: 400 }
      );
    }

    let normalizedAuthorityColumnUrl: string | null = null;
    try {
      normalizedAuthorityColumnUrl = normalizeAuthorityColumnUrl(
        authorityColumnUrl
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Enter a valid Authority Magazine or Medium column URL.",
        },
        { status: 400 }
      );
    }

    let normalizedSchedulingLink: string | null = null;
    if (String(schedulingLink || "").trim()) {
      try {
        const url = new URL(String(schedulingLink).trim());
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
        normalizedSchedulingLink = url.toString();
      } catch {
        return NextResponse.json(
          { error: "Enter a valid HTTP or HTTPS scheduling link." },
          { status: 400 }
        );
      }
    }

    const updated = await db.client.update({
      where: { id: user.clientId },
      data: {
        name: normalizedName,
        email: normalizedEmail,
        signature: String(signature || "").trim() || null,
        schedulingLink: normalizedSchedulingLink,
        defaultHashtags: String(defaultHashtags || "").trim() || null,
        defaultSignoff: String(defaultSignoff || "").trim() || "Warmly",
        replyToEmail: normalizedReplyTo || null,
        topicsSheetUrl: String(topicsSheetUrl || "").trim() || null,
      },
      select: clientSettingsSelect,
    });

    const savedAuthorityColumnUrl = authorityColumnUrlWasProvided
      ? await updateAuthorityColumnUrlIfAvailable(
          user.clientId,
          normalizedAuthorityColumnUrl
        )
      : await getAuthorityColumnUrlIfAvailable(user.clientId);

    return NextResponse.json({
      success: true,
      client: { ...updated, authorityColumnUrl: savedAuthorityColumnUrl },
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error updating client settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings." },
      { status: 500 }
    );
  }
}

async function getAuthorityColumnUrlIfAvailable(
  clientId: string
): Promise<string | null> {
  try {
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { authorityColumnUrl: true },
    });
    return client?.authorityColumnUrl || null;
  } catch (error) {
    if (isMissingAuthorityColumnUrlColumnError(error)) {
      return null;
    }
    throw error;
  }
}

async function updateAuthorityColumnUrlIfAvailable(
  clientId: string,
  authorityColumnUrl: string | null
): Promise<string | null> {
  try {
    const client = await db.client.update({
      where: { id: clientId },
      data: { authorityColumnUrl },
      select: { authorityColumnUrl: true },
    });
    return client.authorityColumnUrl || null;
  } catch (error) {
    if (isMissingAuthorityColumnUrlColumnError(error)) {
      return null;
    }
    throw error;
  }
}

function isMissingAuthorityColumnUrlColumnError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : JSON.stringify(error);
  return (
    /authorityColumnUrl/.test(message) &&
    /does not exist|no such column|unknown column|invalid/i.test(message)
  );
}
