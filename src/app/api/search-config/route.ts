import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth-helpers";
import { getSearchDiagnostics } from "@/lib/prominence/research";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiAuth();
    return NextResponse.json({
      ok: true,
      diagnostics: getSearchDiagnostics(),
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    return NextResponse.json(
      { error: "Could not check search configuration." },
      { status: 500 }
    );
  }
}
