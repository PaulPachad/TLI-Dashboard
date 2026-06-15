// ==============================================================================
// GET/PUT /api/clients/settings — Client profile settings
// ==============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";

// GET — Fetch current client settings
export async function GET() {
  try {
    const user = await requireApiAuth();
    
    if (!user.clientId) {
      return NextResponse.json({ client: null });
    }

    const client = await db.client.findUnique({
      where: { id: user.clientId },
    });

    return NextResponse.json({ client });
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

// PUT — Update client settings
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
    } = body;
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
    });

    return NextResponse.json({ success: true, client: updated });
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
