import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { isDemoMode } from "@/lib/google-sheets";
import { buildTopicInvitationEmailBody } from "@/lib/email/copy";
import { OutreachEmail } from "@/lib/email/templates/outreach";

interface OutreachBody {
  recipients?: string;
  cc?: string;
  subject?: string;
  body?: string;
  isTest?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiAuth();
    const { id } = await params;
    const topic = await db.topic.findUnique({
      where: { id },
      include: {
        client: {
          select: { replyToEmail: true },
        },
      },
    });

    if (!topic) {
      return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    }
    if (user.role !== "ADMIN" && user.clientId !== topic.clientId) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const data: OutreachBody = await request.json();

    const subject =
      data.subject?.trim() || `Invitation to participate in Authority Magazine: ${topic.title}`;
    const emailBody =
      data.body?.trim() || buildTopicInvitationEmailBody(topic);

    if (data.isTest) {
      const testRecipient = user.email || topic.client.replyToEmail;
      if (!testRecipient) {
        return NextResponse.json(
          { error: "Could not find user email or client reply-to email for test delivery." },
          { status: 400 }
        );
      }
      const testSubject = subject.startsWith("[TEST PREVIEW]")
        ? subject
        : `[TEST PREVIEW] ${subject}`;

      const result = await sendOutreach({
        recipients: [testRecipient],
        subject: testSubject,
        body: emailBody,
        heading: "Interview series invitation (Preview Test)",
        replyTo: topic.client.replyToEmail,
      });

      return NextResponse.json({
        success: true,
        isTest: true,
        sentTo: testRecipient,
        ...result,
        note: result.simulated
          ? `Demo mode: simulated test invitation to ${testRecipient}.`
          : `Test invitation email sent to ${testRecipient}.`,
      });
    }

    const recipients = parseRecipients(data.recipients || "");
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "Add at least one recipient email." },
        { status: 400 }
      );
    }

    const ccList = data.cc ? parseRecipients(data.cc) : undefined;

    const result = await sendOutreach({
      recipients,
      cc: ccList && ccList.length > 0 ? ccList : undefined,
      subject,
      body: emailBody,
      heading: "Interview series invitation",
      replyTo: topic.client.replyToEmail,
    });

    return NextResponse.json({
      success: true,
      ...result,
      note: result.simulated
        ? `Demo mode: simulated topic invitation to ${recipients.join(", ")}.`
        : `Topic invitation accepted for delivery to ${recipients.join(", ")}.`,
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Topic outreach error:", error);
    return NextResponse.json(
      { error: `Could not send topic invitation: ${err.message || "Unknown internal error"}` },
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
  cc,
  subject,
  body,
  heading,
  replyTo,
}: {
  recipients: string[];
  cc?: string[];
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
    cc: cc && cc.length > 0 ? cc : undefined,
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
