import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAdmin } from "@/lib/auth-helpers";
import { ensureAutomationProfile } from "@/lib/automation/service";

export async function GET() {
  try {
    await requireApiAdmin();
    const profile = await ensureAutomationProfile();
    const learnedRules = await db.learnedRule.findMany({
      where: { profileId: profile.id },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ learnedRules });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to load learned rules.");
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireApiAdmin();
    const profile = await ensureAutomationProfile();
    const body = await request.json();
    const id = String(body.id || "");
    const originalTopic = String(body.originalTopic || "").trim();
    const normalizedTopic = normalizeTopic(originalTopic);
    const correctTopicName = String(body.correctTopicName || "").trim();

    if (!originalTopic || !correctTopicName) {
      return NextResponse.json(
        { error: "Original topic and correct topic are required." },
        { status: 400 }
      );
    }

    const rule = id
      ? await db.learnedRule.update({
          where: { id },
          data: {
            originalTopic,
            normalizedTopic,
            correctTopicName,
            correctDocId: String(body.correctDocId || "").trim() || null,
            confidence: body.confidence === undefined ? null : Number(body.confidence),
            isEnabled: body.isEnabled !== false,
          },
        })
      : await db.learnedRule.upsert({
          where: {
            profileId_normalizedTopic: {
              profileId: profile.id,
              normalizedTopic,
            },
          },
          update: {
            originalTopic,
            correctTopicName,
            correctDocId: String(body.correctDocId || "").trim() || null,
            confidence: body.confidence === undefined ? null : Number(body.confidence),
            isEnabled: body.isEnabled !== false,
          },
          create: {
            profileId: profile.id,
            originalTopic,
            normalizedTopic,
            correctTopicName,
            correctDocId: String(body.correctDocId || "").trim() || null,
            confidence: body.confidence === undefined ? null : Number(body.confidence),
            isEnabled: body.isEnabled !== false,
          },
        });

    return NextResponse.json({ success: true, rule });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to save learned rule.");
  }
}

function normalizeTopic(value: string) {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function handleApiError(error: unknown, fallback: string) {
  const err = error as { status?: number; message?: string };
  if (err.status) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: err.message || fallback }, { status: 500 });
}
