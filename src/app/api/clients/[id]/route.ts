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
