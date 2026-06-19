// ==============================================================================
// DELETE /api/clients/[id] — Delete a client and their associated users
// ==============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAdmin } from "@/lib/auth-helpers";
import {
  AdminClientUpdateError,
  normalizeAdminClientUpdate,
  selectClientLoginUser,
} from "@/lib/clients/admin-update";
import { hash } from "bcryptjs";

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
    const adminUser = await requireApiAdmin();
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: "Client ID is required." }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    const result = await db.$transaction(async (tx) => {
      const existingClient = await tx.client.findUnique({
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
        throw new AdminClientUpdateError("Client not found.", 404);
      }

      const { data, normalizedEmail, newPassword } = normalizeAdminClientUpdate(
        body,
        existingClient
      );
      let loginEmail: string | null = null;
      const emailChanged =
        Boolean(normalizedEmail) &&
        existingClient.email.toLowerCase() !== normalizedEmail;
      let passwordUpdated = false;
      let loginUserId: string | null = null;

      if (normalizedEmail || newPassword) {
        const loginUser = selectClientLoginUser(existingClient);
        if (!loginUser) {
          throw new AdminClientUpdateError(
            "This client does not have a client login account to update."
          );
        }

        if (normalizedEmail) {
          const userWithTargetEmail = await tx.user.findUnique({
            where: { email: normalizedEmail },
          });
          if (userWithTargetEmail && userWithTargetEmail.id !== loginUser.id) {
            throw new AdminClientUpdateError(
              "Another user already uses that email address."
            );
          }
        }

        loginUserId = loginUser.id;
      }

      const client = await tx.client.update({
        where: { id },
        data,
      });

      if ((normalizedEmail || newPassword) && loginUserId) {
        const nextUserData: {
          email?: string;
          name?: string;
          passwordHash?: string;
          sessionVersion?: { increment: number };
        } = {
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
          ...(data.name ? { name: data.name } : {}),
        };
        if (newPassword) {
          nextUserData.passwordHash = await hash(newPassword, 12);
          nextUserData.sessionVersion = { increment: 1 };
        }

        const updatedUser = await tx.user.update({
          where: { id: loginUserId },
          data: nextUserData,
        });
        loginEmail = updatedUser.email;
        passwordUpdated = Boolean(newPassword);

        if (emailChanged) {
          await tx.adminAuditLog.create({
            data: {
              actorUserId: adminUser.id,
              targetClientId: id,
              action: "CLIENT_EMAIL_UPDATED",
              previousEmail: existingClient.email,
              newEmail: normalizedEmail,
              metadataJson: JSON.stringify({
                loginUserId,
                replyToEmailUpdated:
                  data.replyToEmail === normalizedEmail,
              }),
            },
          });
        }
        if (newPassword) {
          await tx.adminAuditLog.create({
            data: {
              actorUserId: adminUser.id,
              targetClientId: id,
              action: "CLIENT_PASSWORD_UPDATED",
              metadataJson: JSON.stringify({
                loginUserId,
                existingSessionsInvalidated: true,
              }),
            },
          });
        }
      }

      return { client, loginEmail, emailChanged, passwordUpdated };
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
