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

interface EmailEvent {
  eventName: string;
}

interface EmailTopic {
  title: string;
  interviewQuestions?: string | null;
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

export function buildEventOutreachEmailBody(event: EmailEvent): string {
  return `Hi good morning, I hope that you are well.

I am the Editor In Chief of Authority Magazine, one of the largest Medium publications.

We'd love to send someone to cover your ${event.eventName} event for Authority Magazine.

Are there press opportunities for this event? We'd love to have a writer write about the event as well as interview some of the headliners and talent.

Thank you so much, and have a fantastic week.

Warmly,
Yitzi Weiner`;
}

export function buildTopicInvitationEmailBody(topic: EmailTopic): string {
  const interviewQuestions =
    topic.interviewQuestions?.trim() ||
    "The interview questions and upload link will be shared shortly.";

  return `Dear Friends

I sincerely hope that each of you and your loved ones is safe and healthy in mind and body. :-)

Thank you so much for your interest in participating in our interview series about ${topic.title}.

Authority Magazine and I would like to include you in our interview series in Authority Magazine. We would also like to try our best to include you in BuzzFeed.

The Authority Magazine pieces will be full interviews, and the BuzzFeed articles will be roundups of the best articles. The individuals who submit the best interviews that are chosen for BuzzFeed will be emailed in a separate email after we get the first set of interviews.

Here are the interview questions for the feature, as well as the link to upload your responses.

${interviewQuestions}

Below are some basic instructions to make this submission as smooth, efficient, and as pleasant as possible:

Where to send the interview back: When you have completed answering your interview, please upload the completed interview, bio, and pictures in the interviewer's upload portal linked at the bottom of the interview questions. The portal sends the responses directly to the writer, prevents any of the responses from getting overlooked, and allows you all to see the progress of the series so you know when to expect its publication. When you upload the materials, please keep your browser open until you see a confirmation message. Kindly, please don't email the interview back to me. :-)

Please write your answers in your own authentic voice. Kindly avoid using AI tools to generate your responses, as we are looking for genuine, personal reflections and insights. We are unable to publish interviews generated with AI.

Publishing Date: The approximate publishing date will be listed in the portal shortly after the interviews start coming in. Links to the live articles will be shared through the portal as well, so please bookmark that page.

Due Date: Please send this back before 21 days (3 weeks). If you need more time, send an email to support@authoritymag.co with the subject line "Extension Request."

Please remember to include:

At least 2 hi-res images (at least 1200 pixels wide) of the interviewee. Professional headshots produce the best results.

A short, 3-4 sentence, third person bio at the top of the interview that we will use as an introduction to the interview.

Optional: A short video of the interviewee sharing the "5 Things", similar to this: https://youtu.be/Cn7uZpog9kQ. The most interesting 5 Things videos in a series will also be included in a special, additional "Editor's List" article, like these: https://medium.com/authority-magazine/search?q=EDITOR%27S%20LIST.

Possible Follow-Up Interview: After you complete the written interview, we may schedule a follow-up call or Zoom to flesh this out.

Publishing and Syndication Order: The Authority Magazine article will go live first. The BuzzFeed roundups will be made at the end of the series. We will send you all of the links when the series is completed.

Troubleshooting: If you have any questions, you can likely find the answers in our FAQs here: https://docs.google.com/document/d/15edGVDP49fpfjE8i77lToLNupYyWCk74BffvFrrgkEI/edit#. If you still require assistance, you can be in touch with our team at kimberly@authoritymag.co.

Thank you, my friends, and I look forward to working with you.

Warmly,
Yitzi`;
}
