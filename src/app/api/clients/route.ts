// ==============================================================================
// GET/POST /api/clients — Client CRUD for admin
// ==============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAdmin } from "@/lib/auth-helpers";
import { hash } from "bcryptjs";
import { randomInt } from "crypto";

// GET — List all clients
export async function GET() {
  try {
    await requireApiAdmin();

    const clients = await db.client.findMany({
      include: {
        _count: {
          select: {
            interviews: true,
            sheetSources: true,
          },
        },
        sheetSources: {
          select: {
            id: true,
            sheetTitle: true,
            lastSyncedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ clients });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error fetching clients:", error);
    return NextResponse.json(
      { error: "Failed to fetch clients." },
      { status: 500 }
    );
  }
}

// POST — Create a new client + user account
export async function POST(request: NextRequest) {
  try {
    await requireApiAdmin();

    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.email) {
      return NextResponse.json(
        { error: "Client name and email are required." },
        { status: 400 }
      );
    }
    if (body.password && String(body.password).length < 8) {
      return NextResponse.json(
        { error: "Client passwords must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Check if email already exists as a user
    const existingUser = await db.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 400 }
      );
    }

    // Create client and user in a transaction
    const result = await db.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          name: body.name,
          company: body.company || null,
          email: body.email.toLowerCase().trim(),
          title: body.title || null,
          signature: body.signature || null,
          linkedinUrl: body.linkedinUrl || null,
          schedulingLink: body.schedulingLink || null,
          defaultHashtags:
            body.defaultHashtags ||
            "#AuthorityMagazine #ThoughtLeadership #Leadership #Interview",
          replyToEmail: body.email.toLowerCase().trim(),
        },
      });

      // Create a user account for the client
      const password = body.password || generateTempPassword();
      const passwordHash = await hash(password, 12);

      const user = await tx.user.create({
        data: {
          email: body.email.toLowerCase().trim(),
          passwordHash,
          name: body.name,
          role: "CLIENT",
          clientId: client.id,
        },
      });

      return { client, user, tempPassword: body.password ? undefined : password };
    });

    return NextResponse.json({
      client: result.client,
      user: {
        id: result.user.id,
        email: result.user.email,
      },
      tempPassword: result.tempPassword,
      message: result.tempPassword
        ? `Client created. Temporary password: ${result.tempPassword} — share this securely.`
        : "Client created with the provided password.",
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "Failed to create client." },
      { status: 500 }
    );
  }
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(randomInt(chars.length));
  }
  return password;
}
