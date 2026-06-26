import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { isDemoMode } from "@/lib/google-sheets";
import { buildEventOutreachEmailBody } from "@/lib/email/copy";
import { OutreachEmail } from "@/lib/email/templates/outreach";

interface OutreachBody {
  recipients?: string;
  subject?: string;
  body?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiAuth();
    const { id } = await params;
    const event = await db.event.findUnique({
      where: { id },
      include: {
        client: {
          select: { replyToEmail: true },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (user.role !== "ADMIN" && user.clientId !== event.clientId) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const data: OutreachBody = await request.json();
    const recipients = parseRecipients(data.recipients || event.contactInfo || "");
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "Add at least one event contact email." },
        { status: 400 }
      );
    }

    const subject =
      data.subject?.trim() || `Press opportunities for ${event.eventName}`;
    const emailBody =
      data.body?.trim() || buildEventOutreachEmailBody(event);
    const result = await sendOutreach({
      recipients,
      subject,
      body: emailBody,
      heading: "Press opportunity request",
      replyTo: event.client.replyToEmail,
    });

    return NextResponse.json({
      success: true,
      ...result,
      note: result.simulated
        ? `Demo mode: simulated event outreach to ${recipients.join(", ")}.`
        : `Event outreach accepted for delivery to ${recipients.join(", ")}.`,
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Event outreach error:", error);
    return NextResponse.json(
      { error: `Could not send event outreach: ${err.message || "Unknown internal error"}` },
      { status: 500 }
    );
  }
}

function parseRecipients(value: string): string[] {
  const recipients = value
    .split(/[\s,;]+/)
    .map((item) => item.replace(/[<>()]/g, "").trim().toLowerCase())
    .filter(Boolean)
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));

  return [...new Set(recipients)].slice(0, 25);
}

async function sendOutreach({
  recipients,
  subject,
  body,
  heading,
  replyTo,
}: {
  recipients: string[];
  subject: string;
  body: string;
  heading: string;
  replyTo?: string | null;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resend = resendApiKey ? new Resend(resendApiKey) : null;
  const demoMode = isDemoMode();

  if (!resend && !demoMode) {
    throwHttpError(
      "Email delivery is not configured. Add RESEND_API_KEY before sending.",
      503
    );
  }

  if (!resend) {
    return { simulated: true, providerMessageId: null };
  }

  const { renderToStaticMarkup } = await import("react-dom/server");
  const htmlBody = renderToStaticMarkup(OutreachEmail({ body, heading }));

  const sendResult = await resend.emails.send({
    from: process.env.EMAIL_FROM || "Authority Magazine <onboarding@resend.dev>",
    to: recipients,
    replyTo: replyTo || undefined,
    subject,
    text: body,
    html: htmlBody,
  });

  if (sendResult.error) {
    throwHttpError(
      `Email delivery failed: ${sendResult.error.message}`,
      sendResult.error.statusCode || 502
    );
  }

  return {
    simulated: false,
    providerMessageId: sendResult.data.id,
  };
}

function throwHttpError(message: string, status: number): never {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  throw error;
}
