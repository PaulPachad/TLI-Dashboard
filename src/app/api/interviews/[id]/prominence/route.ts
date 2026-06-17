import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import {
  GOOGLE_SEARCH_NOT_CONFIGURED_CODE,
  GoogleSearchConfigError,
  researchInterviewProminence,
} from "@/lib/prominence/research";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiAuth();
    const { id } = await params;

    const interview = await db.interview.findUnique({
      where: { id },
      include: {
        actions: {
          select: { actionType: true, status: true },
        },
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found." },
        { status: 404 }
      );
    }

    if (user.role !== "ADMIN" && user.clientId !== interview.clientId) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const result = await researchInterviewProminence(interview);
    const updated = await db.interview.update({
      where: { id },
      data: {
        companyEmployeeCount: result.companyEmployeeCount,
        companyRevenueUsd: result.companyRevenueUsd,
        largestSocialFollowerCount: result.largestSocialFollowerCount,
        prominenceNotes: result.prominenceNotes,
      },
    });

    await db.action.create({
      data: {
        clientId: interview.clientId,
        interviewId: id,
        actionType: "PROMINENCE_RESEARCHED",
        status: "SUCCESS",
        note:
          result.assessment.tier === "standard"
            ? "Researched VIP signals. No strong prominence signals found yet."
            : `Researched VIP signals and flagged ${result.assessment.tierLabel}.`,
        metadataJson: JSON.stringify({
          score: result.assessment.score,
          tier: result.assessment.tier,
          confidence: result.assessment.confidence,
          sourceCount: result.sourceResults.length,
        }),
        createdByUserId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      interview: updated,
      prominence: result.assessment,
      sourceCount: result.sourceResults.length,
      note:
        result.assessment.tier === "standard"
          ? "Research complete. No strong VIP signal found yet."
          : `Research complete: ${result.assessment.tierLabel} (${result.assessment.score}/100).`,
    });
  } catch (error: unknown) {
    if (error instanceof GoogleSearchConfigError) {
      return NextResponse.json(
        {
          code: GOOGLE_SEARCH_NOT_CONFIGURED_CODE,
          error:
            "VIP research needs Google Search setup. Add GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID.",
        },
        { status: 503 }
      );
    }

    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("Prominence research failed:", error);
    return NextResponse.json(
      {
        error:
          err.message ||
          "Could not research VIP signals. Check the search configuration and try again.",
      },
      { status: 500 }
    );
  }
}
