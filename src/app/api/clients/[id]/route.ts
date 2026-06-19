// ==============================================================================
// DELETE /api/clients/[id] — Delete a client and their associated users
// ==============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAdmin } from "@/lib/auth-helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Ensure the user is an admin
    await requireApiAdmin();
    
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Client ID is required." },
        { status: 400 }
      );
    }

    // 2. Check if client exists
    const client = await db.client.findUnique({
      where: { id },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found." },
        { status: 404 }
      );
    }

    // 3. Delete associated users and the client in a transaction.
    // SheetSource, Interview, and Action will cascade delete automatically
    // via database onDelete: Cascade constraints.
    await db.$transaction(async (tx) => {
      // Delete user accounts associated with this client
      await tx.user.deleteMany({
        where: { clientId: id },
      });

      // Delete the client itself
      await tx.client.delete({
        where: { id },
      });
    });

    return NextResponse.json({
      success: true,
      message: `Client "${client.name}" and all associated data deleted.`,
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error deleting client:", error);
    return NextResponse.json(
      { error: "Failed to delete client." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiAdmin();
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: "Client ID is required." }, { status: 400 });
    }

    const body = await request.json();
    const existingClient = await db.client.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!existingClient) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }

    const data: {
      name?: string;
      company?: string | null;
      email?: string;
      replyToEmail?: string | null;
      topicsSheetUrl?: string | null;
    } = {};

    if ("name" in body) {
      const normalizedName = String(body.name || "").trim();
      if (!normalizedName) {
        return NextResponse.json(
          { error: "Client name is required." },
          { status: 400 }
        );
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
        return NextResponse.json(
          { error: "Client email is required." },
          { status: 400 }
        );
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return NextResponse.json(
          { error: "Enter a valid client email address." },
          { status: 400 }
        );
      }

      const existingUser = await db.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existingUser && existingUser.clientId !== id) {
        return NextResponse.json(
          { error: "Another user already uses that email address." },
          { status: 400 }
        );
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

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No client changes were provided." },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const client = await tx.client.update({
        where: { id },
        data,
      });

      let loginEmail: string | null = null;
      if (normalizedEmail) {
        const loginUser =
          existingClient.users.find(
            (user) =>
              user.role === "CLIENT" &&
              user.email.toLowerCase() === existingClient.email.toLowerCase()
          ) ||
          existingClient.users.find((user) => user.role === "CLIENT") ||
          null;

        if (loginUser) {
          const userWithTargetEmail = await tx.user.findUnique({
            where: { email: normalizedEmail },
          });

          if (!userWithTargetEmail || userWithTargetEmail.id === loginUser.id) {
            const updatedUser = await tx.user.update({
              where: { id: loginUser.id },
              data: {
                email: normalizedEmail,
                ...(data.name ? { name: data.name } : {}),
              },
            });
            loginEmail = updatedUser.email;
          } else {
            loginEmail = userWithTargetEmail.email;
          }
        }
      }

      return { client, loginEmail };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error updating client:", error);
    return NextResponse.json({ error: "Failed to update client." }, { status: 500 });
  }
}
