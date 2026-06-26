// ==============================================================================
// POST /api/interviews/[id]/action — Handle dashboard card actions
// ==============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { isDemoMode } from "@/lib/google-sheets";
import {
  generateLinkedInVariations,
  normalizeLinkedInPostUrl,
} from "@/lib/linkedin/generator";
import { LiveLinkEmail } from "@/lib/email/templates/live-link";
import { ZoomInviteEmail } from "@/lib/email/templates/zoom-invite";
import {
  buildLiveLinkEmailBody,
  buildZoomInviteEmailBody,
} from "@/lib/email/copy";
import { Resend } from "resend";
import { fetchArticleMetadata } from "@/lib/images/interview-image-server";
import { ReactElement } from "react";

// Helper function to render react email templates dynamically to avoid next.js build/bundler issues with react-dom/server
async function renderEmail(element: ReactElement): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(element);
}

interface ActionData {
  intervieweeEmail?: string;
  publicistName?: string;
  publicistEmail?: string;
  subject?: string;
  body?: string;
  postText?: string;
  linkedinPostUrl?: string;
}

interface ActionBody {
  actionType: "add_contact" | "send_live_email" | "generate_linkedin" | "copy_linkedin" | "mark_shared" | "send_zoom_invite" | "generate_social_image";
  data?: ActionData;
}

const actionInterviewSelect = {
  id: true,
  clientId: true,
  intervieweeName: true,
  intervieweeCompany: true,
  intervieweeTitle: true,
  intervieweeEmail: true,
  publicistName: true,
  publicistEmail: true,
  topic: true,
  articleUrl: true,
  image1Url: true,
  image2Url: true,
  client: {
    select: {
      name: true,
      email: true,
      signature: true,
      linkedinUrl: true,
      schedulingLink: true,
      defaultSignoff: true,
      defaultHashtags: true,
      replyToEmail: true,
    },
  },
  actions: {
    select: { actionType: true, status: true },
  },
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiAuth();
    const { id } = await params;

    const interview = await db.interview.findUnique({
      where: { id },
      select: actionInterviewSelect,
    });

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found." },
        { status: 404 }
      );
    }

    if (user.role !== "ADMIN" && user.clientId !== interview.clientId) {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403 }
      );
    }

    const articleMetadata = await fetchArticleMetadata(interview.articleUrl);

    const recipient = interview.intervieweeEmail || interview.publicistEmail || "";
    const cc =
      interview.intervieweeEmail &&
      interview.publicistEmail &&
      interview.publicistEmail !== interview.intervieweeEmail
        ? interview.publicistEmail
        : "";

    // Generate live email defaults
    const liveEmailSubject = "Your interview in Authority Magazine is live!";
    const liveEmailBody = buildLiveLinkEmailBody(
      interview,
      interview.client
    );

    // Generate Zoom invite defaults
    const zoomInviteSubject =
      "Follow-up Zoom interview for your Authority Magazine feature";
    const zoomInviteBody = buildZoomInviteEmailBody(
      interview,
      interview.client
    );

    // Generate LinkedIn defaults
    const linkedinVariations = generateLinkedInVariations(
      interview,
      interview.client.defaultHashtags || undefined
    );

    return NextResponse.json({
      interview,
      recipient,
      liveEmail: {
        to: recipient,
        cc,
        subject: liveEmailSubject,
        body: liveEmailBody,
      },
      zoomInvite: {
        to: recipient,
        cc,
        subject: zoomInviteSubject,
        body: zoomInviteBody,
      },
      linkedin: {
        postText: linkedinVariations[0],
        variations: linkedinVariations,
      },
      articleTitle: articleMetadata.title,
      demoMode: isDemoMode(),
      emailConfigured: Boolean(process.env.RESEND_API_KEY),
      schedulingConfigured: Boolean(interview.client.schedulingLink),
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error fetching action defaults:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiAuth();
    const { id } = await params;

    // Fetch the interview details
    const interview = await db.interview.findUnique({
      where: { id },
      select: actionInterviewSelect,
    });

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found." },
        { status: 404 }
      );
    }

    // Ensure the client has access to this interview (unless they are admin)
    if (user.role !== "ADMIN" && user.clientId !== interview.clientId) {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403 }
      );
    }

    const body: ActionBody = await request.json();
    const { actionType, data } = body;
    const hasSuccessfulAction = (type: string) =>
      interview.actions.some(
        (action) =>
          action.actionType === type && action.status === "SUCCESS"
      );

    // Initialize Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    const resend = resendApiKey ? new Resend(resendApiKey) : null;
    const emailFrom =
      process.env.EMAIL_FROM || "TLI Dashboard <onboarding@resend.dev>";
    const demoMode = isDemoMode();

    switch (actionType) {
      case "add_contact": {
        const intervieweeEmail = data?.intervieweeEmail?.trim().toLowerCase();
        const publicistName = data?.publicistName?.trim();
        const publicistEmail = data?.publicistEmail?.trim().toLowerCase();

        if (
          !intervieweeEmail &&
          !publicistEmail &&
          !interview.intervieweeEmail &&
          !interview.publicistEmail
        ) {
          return NextResponse.json(
            { error: "Add an interviewee or publicist email address." },
            { status: 400 }
          );
        }

        const updated = await db.interview.update({
          where: { id },
          data: {
            intervieweeEmail: intervieweeEmail || interview.intervieweeEmail,
            publicistName: publicistName || interview.publicistName,
            publicistEmail: publicistEmail || interview.publicistEmail,
          },
          select: {
            id: true,
            intervieweeEmail: true,
            publicistName: true,
            publicistEmail: true,
          },
        });

        // Record a Timeline Action for updating contact details
        await db.action.create({
          data: {
            clientId: interview.clientId,
            interviewId: id,
            actionType: "CONTACT_INFO_UPDATED",
            status: "SUCCESS",
            note: `Updated contact info. Interviewee Email: ${intervieweeEmail || "N/A"}, PR: ${publicistName || "N/A"}`,
            createdByUserId: user.id,
          },
        });

        return NextResponse.json({ success: true, interview: updated });
      }

      case "send_live_email": {
        const recipient = interview.intervieweeEmail || interview.publicistEmail;
        const ccEmails: string[] = [];
        if (
          interview.intervieweeEmail &&
          interview.publicistEmail &&
          interview.publicistEmail !== interview.intervieweeEmail
        ) {
          ccEmails.push(interview.publicistEmail);
        }
        if (
          interview.client.email &&
          interview.client.email !== recipient &&
          !ccEmails.includes(interview.client.email)
        ) {
          ccEmails.push(interview.client.email);
        }
        const cc = ccEmails.length > 0 ? ccEmails.join(", ") : null;
        if (!recipient) {
          return NextResponse.json(
            { error: "No recipient email address available. Please add contact info first." },
            { status: 400 }
          );
        }
        const liveEmailRateLimit = await checkEmailRateLimit(
          interview.clientId,
          id,
          "LIVE_EMAIL_SENT"
        );
        if (liveEmailRateLimit) return liveEmailRateLimit;

        const emailSubject = data?.subject || "Your interview in Authority Magazine is live!";
        const emailBody =
          data?.body || buildLiveLinkEmailBody(interview, interview.client);

        if (!resend && !demoMode) {
          return NextResponse.json(
            {
              error:
                "Email delivery is not configured. Add RESEND_API_KEY before sending.",
            },
            { status: 503 }
          );
        }

        let providerMessageId: string | null = null;
        let simulated = false;
        let note = "";

        if (!resend) {
          simulated = true;
          note = `Demo mode: simulated live-link email to ${recipient}. No email was delivered.`;
        } else {
          try {
            const htmlContent = await renderEmail(LiveLinkEmail({ body: emailBody }));
            const sendResult = await resend.emails.send({
              from: emailFrom,
              to: recipient,
              cc: cc || undefined,
              replyTo: interview.client.replyToEmail || undefined,
              subject: emailSubject,
              text: emailBody,
              html: htmlContent,
            });

            if (sendResult.error) {
              await recordFailedEmailAction({
                interviewId: id,
                clientId: interview.clientId,
                userId: user.id,
                actionType: "LIVE_EMAIL_SENT",
                recipient,
                cc,
                subject: emailSubject,
                body: emailBody,
                message: sendResult.error.message,
              });
              return NextResponse.json(
                { error: `Email delivery failed: ${sendResult.error.message}` },
                { status: sendResult.error.statusCode || 502 }
              );
            }

            providerMessageId = sendResult.data.id;
            note = `Email accepted for delivery to ${recipient} by Resend.`;
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : "Unknown delivery error";
            await recordFailedEmailAction({
              interviewId: id,
              clientId: interview.clientId,
              userId: user.id,
              actionType: "LIVE_EMAIL_SENT",
              recipient,
              cc,
              subject: emailSubject,
              body: emailBody,
              message,
            });
            return NextResponse.json(
              { error: `Email delivery failed: ${message}` },
              { status: 502 }
            );
          }
        }

        await db.action.create({
          data: {
            clientId: interview.clientId,
            interviewId: id,
            actionType: "LIVE_EMAIL_SENT",
            status: "SUCCESS",
            recipient,
            cc,
            subject: emailSubject,
            body: emailBody,
            note,
            metadataJson: JSON.stringify({ simulated, providerMessageId }),
            createdByUserId: user.id,
          },
        });

        return NextResponse.json({ success: true, simulated, note });
      }

      case "generate_linkedin": {
        const postText =
          data?.postText?.trim() ||
          generateLinkedInVariations(
            interview,
            interview.client.defaultHashtags || undefined
          )[0];

        // Create action in DB
        await db.action.create({
          data: {
            clientId: interview.clientId,
            interviewId: id,
            actionType: "LINKEDIN_POST_GENERATED",
            status: "SUCCESS",
            generatedText: postText,
            note: "Generated LinkedIn post template",
            createdByUserId: user.id,
          },
        });

        return NextResponse.json({ success: true, postText });
      }

      case "copy_linkedin": {
        if (!hasSuccessfulAction("LINKEDIN_POST_GENERATED")) {
          return NextResponse.json(
            { error: "Generate a LinkedIn post before copying it." },
            { status: 409 }
          );
        }
        await db.action.create({
          data: {
            clientId: interview.clientId,
            interviewId: id,
            actionType: "LINKEDIN_POST_COPIED",
            status: "SUCCESS",
            note: "Copied LinkedIn post text to clipboard",
            createdByUserId: user.id,
          },
        });
        return NextResponse.json({ success: true });
      }

      case "generate_social_image": {
        await db.action.create({
          data: {
            clientId: interview.clientId,
            interviewId: id,
            actionType: "SOCIAL_IMAGE_GENERATED",
            status: "SUCCESS",
            note: "Generated and downloaded social media image",
            createdByUserId: user.id,
          },
        });
        return NextResponse.json({ success: true });
      }

      case "mark_shared": {
        if (
          !hasSuccessfulAction("LIVE_EMAIL_SENT") ||
          !hasSuccessfulAction("LINKEDIN_POST_GENERATED")
        ) {
          return NextResponse.json(
            {
              error:
                "Complete the live email and LinkedIn post steps before marking this interview shared.",
            },
            { status: 409 }
          );
        }
        let linkedinPostUrl = "";
        try {
          linkedinPostUrl = normalizeLinkedInPostUrl(
            data?.linkedinPostUrl || ""
          );
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Enter a valid LinkedIn post URL.",
            },
            { status: 400 }
          );
        }

        const [existingSharedAction, existingUrlAction] = await Promise.all([
          db.action.findFirst({
            where: {
              interviewId: id,
              actionType: "MARKED_SHARED",
              status: "SUCCESS",
            },
          }),
          linkedinPostUrl
            ? db.action.findFirst({
                where: {
                  interviewId: id,
                  actionType: "LINKEDIN_URL_ADDED",
                  linkedinPostUrl,
                  status: "SUCCESS",
                },
              })
            : Promise.resolve(null),
        ]);

        await db.$transaction(async (tx) => {
          if (linkedinPostUrl && !existingUrlAction) {
            await tx.action.create({
              data: {
                clientId: interview.clientId,
                interviewId: id,
                actionType: "LINKEDIN_URL_ADDED",
                status: "SUCCESS",
                linkedinPostUrl,
                note: "Added the published LinkedIn post URL",
                createdByUserId: user.id,
              },
            });
          }

          if (!existingSharedAction) {
            await tx.action.create({
              data: {
                clientId: interview.clientId,
                interviewId: id,
                actionType: "MARKED_SHARED",
                status: "SUCCESS",
                note: "Marked interview as shared on social media",
                createdByUserId: user.id,
              },
            });
          }
        });

        let note = existingSharedAction
          ? "This interview was already marked as shared."
          : "Interview marked as shared.";
        if (linkedinPostUrl && !existingUrlAction) {
          note += " LinkedIn post URL saved.";
        } else if (linkedinPostUrl && existingUrlAction) {
          note += " That LinkedIn post URL was already saved.";
        }

        return NextResponse.json({
          success: true,
          note,
        });
      }

      case "send_zoom_invite": {
        const recipient = interview.intervieweeEmail || interview.publicistEmail;
        const ccEmails: string[] = [];
        if (
          interview.intervieweeEmail &&
          interview.publicistEmail &&
          interview.publicistEmail !== interview.intervieweeEmail
        ) {
          ccEmails.push(interview.publicistEmail);
        }
        if (
          interview.client.email &&
          interview.client.email !== recipient &&
          !ccEmails.includes(interview.client.email)
        ) {
          ccEmails.push(interview.client.email);
        }
        const cc = ccEmails.length > 0 ? ccEmails.join(", ") : null;
        if (!recipient) {
          return NextResponse.json(
            { error: "No recipient email address available." },
            { status: 400 }
          );
        }
        const zoomRateLimit = await checkEmailRateLimit(
          interview.clientId,
          id,
          "ZOOM_INVITE_SENT"
        );
        if (zoomRateLimit) return zoomRateLimit;

        const emailSubject =
          data?.subject ||
          "Follow-up Zoom interview for your Authority Magazine feature";
        const emailBody =
          data?.body || buildZoomInviteEmailBody(interview, interview.client);

        if (!resend && !demoMode) {
          return NextResponse.json(
            {
              error:
                "Email delivery is not configured. Add RESEND_API_KEY before sending.",
            },
            { status: 503 }
          );
        }

        let providerMessageId: string | null = null;
        let simulated = false;
        let note = "";

        if (!resend) {
          simulated = true;
          note = `Demo mode: simulated Zoom invitation to ${recipient}. No email was delivered.`;
        } else {
          try {
            const htmlContent = await renderEmail(ZoomInviteEmail({ body: emailBody }));
            const sendResult = await resend.emails.send({
              from: emailFrom,
              to: recipient,
              cc: cc || undefined,
              replyTo: interview.client.replyToEmail || undefined,
              subject: emailSubject,
              text: emailBody,
              html: htmlContent,
            });

            if (sendResult.error) {
              await recordFailedEmailAction({
                interviewId: id,
                clientId: interview.clientId,
                userId: user.id,
                actionType: "ZOOM_INVITE_SENT",
                recipient,
                cc,
                subject: emailSubject,
                body: emailBody,
                message: sendResult.error.message,
              });
              return NextResponse.json(
                { error: `Email delivery failed: ${sendResult.error.message}` },
                { status: sendResult.error.statusCode || 502 }
              );
            }

            providerMessageId = sendResult.data.id;
            note = `Zoom invitation accepted for delivery to ${recipient} by Resend.`;
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : "Unknown delivery error";
            await recordFailedEmailAction({
              interviewId: id,
              clientId: interview.clientId,
              userId: user.id,
              actionType: "ZOOM_INVITE_SENT",
              recipient,
              cc,
              subject: emailSubject,
              body: emailBody,
              message,
            });
            return NextResponse.json(
              { error: `Email delivery failed: ${message}` },
              { status: 502 }
            );
          }
        }

        await db.action.create({
          data: {
            clientId: interview.clientId,
            interviewId: id,
            actionType: "ZOOM_INVITE_SENT",
            status: "SUCCESS",
            recipient,
            cc,
            subject: emailSubject,
            body: emailBody,
            note,
            metadataJson: JSON.stringify({ simulated, providerMessageId }),
            createdByUserId: user.id,
          },
        });

        return NextResponse.json({ success: true, simulated, note });
      }

      default: {
        return NextResponse.json(
          { error: `Action type ${actionType} is not supported.` },
          { status: 400 }
        );
      }
    }
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error executing interview action:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred executing the action." },
      { status: 500 }
    );
  }
}

interface FailedEmailAction {
  interviewId: string;
  clientId: string;
  userId: string;
  actionType: "LIVE_EMAIL_SENT" | "ZOOM_INVITE_SENT";
  recipient: string;
  cc?: string | null;
  subject: string;
  body: string;
  message: string;
}

async function recordFailedEmailAction(action: FailedEmailAction) {
  await db.action.create({
    data: {
      clientId: action.clientId,
      interviewId: action.interviewId,
      actionType: action.actionType,
      status: "FAILED",
      recipient: action.recipient,
      cc: action.cc || null,
      subject: action.subject,
      body: action.body,
      note: `Delivery failed: ${action.message}`,
      createdByUserId: action.userId,
    },
  });
}

async function checkEmailRateLimit(
  clientId: string,
  interviewId: string,
  actionType: "LIVE_EMAIL_SENT" | "ZOOM_INVITE_SENT"
) {
  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const [recentDuplicate, recentClientEmailCount] = await Promise.all([
    db.action.findFirst({
      where: {
        interviewId,
        actionType,
        status: "SUCCESS",
        createdAt: { gte: oneMinuteAgo },
      },
    }),
    db.action.count({
      where: {
        clientId,
        actionType: { in: ["LIVE_EMAIL_SENT", "ZOOM_INVITE_SENT"] },
        status: "SUCCESS",
        createdAt: { gte: oneMinuteAgo },
      },
    }),
  ]);

  if (recentDuplicate) {
    return NextResponse.json(
      { error: "This email action was already completed in the last minute." },
      { status: 429 }
    );
  }

  if (recentClientEmailCount >= 10) {
    return NextResponse.json(
      { error: "Email safety limit reached. Wait a minute and try again." },
      { status: 429 }
    );
  }

  return null;
}
