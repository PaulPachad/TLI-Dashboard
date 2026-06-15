interface EmailClientProfile {
  name: string;
  signature?: string | null;
  linkedinUrl?: string | null;
  schedulingLink?: string | null;
  defaultSignoff?: string | null;
}

interface EmailInterview {
  intervieweeName: string;
  articleUrl: string;
}

export function buildLiveLinkEmailBody(
  interview: EmailInterview,
  client: EmailClientProfile
): string {
  const socialSection = client.linkedinUrl
    ? `\n\nMy social handle is below. I would be grateful if you tagged me when you share the article.\n\nLinkedIn: ${client.linkedinUrl}`
    : "\n\nI would be grateful if you tagged me when you share the article.";

  return `Hi ${interview.intervieweeName},

This is ${client.name}. I hope you are doing great.

Thank you so much for your interview. I really enjoyed your insights.

Here is the live link for the article:

${interview.articleUrl}

I'm excited to share this with our audience. Would you share it with yours?${socialSection}

If you have already shared it, thank you so much!

Have a fantastic day!

${formatSignature(client)}`;
}

export function buildZoomInviteEmailBody(
  interview: Pick<EmailInterview, "intervieweeName">,
  client: EmailClientProfile
): string {
  const schedulingText = client.schedulingLink
    ? `Do any of the available times here work for you?\n\n${client.schedulingLink}`
    : "Please reply with a few times that work well for you.";

  return `Dear ${interview.intervieweeName},

Thank you so much for participating in the interview series with me. Your answers were fantastic.

I would love to follow up on some of your answers and flesh out a few more details. Can we schedule a follow-up Zoom interview? I plan to include the video with the final article so it has a multimedia element.

${schedulingText}

I look forward to continuing our conversation!

${formatSignature(client)}`;
}

function formatSignature(client: EmailClientProfile): string {
  const signoff = client.defaultSignoff?.trim() || "Warmly";
  const signature = client.signature?.trim() || client.name;
  return `${signoff},\n${signature}`;
}
