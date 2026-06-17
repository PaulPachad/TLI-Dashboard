export const AUTOMATION_PROFILE_NAME = "Authority Magazine Automation";

export const AUTOMATION_WORKFLOWS = {
  pitch: "PITCH_RESPONDER",
  collaboration: "COLLAB_RESPONDER",
} as const;

export const AUTOMATION_TEMPLATE_KEYS = {
  acceptance: "pitch_acceptance",
  noMatch: "pitch_no_match",
  multipleMatch: "pitch_multiple_match",
  extension: "pitch_extension",
  collaborationAcceptance: "collab_acceptance",
  collaborationNoMatch: "collab_no_match",
} as const;

export const DEFAULT_AUTOMATION_TEMPLATES = [
  {
    templateKey: AUTOMATION_TEMPLATE_KEYS.acceptance,
    name: "Pitch acceptance",
    subject: "Authority Magazine - {series_name} Interview Invitation",
    allowedVariables: ["series_name", "interview_link", "signature"],
    body: `Thank you so much for your pitch to Authority Magazine.

You have been accepted and we would like to move forward with an email interview.

Here is the link for the email interview questions for this series:

{series_name}
{interview_link}

Please complete the written interview, (please do not use AI to create your answers) and upload the interview, images and bio into the portal linked at the bottom of the interview when it is complete.

When you upload the material, please keep your browser open until you see a confirmation message.

The official deadline is 21 days.

After you upload the interview in the writer's portal, you will see a link to a spreadsheet queue with our estimated publishing dates.

All other details and frequently asked questions are addressed here: https://bit.ly/AuthorityMagFAQandInstructions

We look forward to seeing your interview submission!

Warmly,
{signature}`,
  },
  {
    templateKey: AUTOMATION_TEMPLATE_KEYS.noMatch,
    name: "Pitch no match",
    subject: "Authority Magazine - Please Select an Interview Series",
    allowedVariables: ["signature"],
    body: `Hi there!

Thank you for your interest in Authority Magazine.

Can you please choose one of our ongoing interview series topics from our list here:
https://medium.com/authority-magazine/ongoing-interview-series-in-authority-magazine-7d633a349753

Once you've selected a topic that fits your expertise, please reply with your preferred series and if chosen, we'll send you the interview questions.

Best regards,
{signature}`,
  },
  {
    templateKey: AUTOMATION_TEMPLATE_KEYS.multipleMatch,
    name: "Pitch multiple matches",
    subject: "Authority Magazine - Interview Invitation",
    allowedVariables: ["series_list", "signature"],
    body: `Thank you so much for your pitch to Authority Magazine.

You have been accepted and we would like to move forward with an email interview.

Based on your pitch, here are the interview series that may fit your expertise. Please choose the link that best matches:

{series_list}

Please complete the written interview, (please do not use AI to create your answers) and upload the interview, images and bio into the portal linked at the bottom of the interview when it is complete.

Warmly,
{signature}`,
  },
  {
    templateKey: AUTOMATION_TEMPLATE_KEYS.extension,
    name: "Deadline extension",
    subject: "Re: {original_subject}",
    allowedVariables: ["original_subject"],
    body: "Sure! :-)",
  },
  {
    templateKey: AUTOMATION_TEMPLATE_KEYS.collaborationAcceptance,
    name: "Collaboration form match",
    subject: "Re: {original_subject}",
    allowedVariables: ["original_subject", "topic_name", "form_url", "signature"],
    body: `Sure we'd love to include you in this series.

Can you add your basic info in the form here?

{topic_name}
{form_url}

After the pitches come in we will send you the interview questions.

I look forward!
{signature}`,
  },
  {
    templateKey: AUTOMATION_TEMPLATE_KEYS.collaborationNoMatch,
    name: "Collaboration no match",
    subject: "Re: {original_subject}",
    allowedVariables: ["original_subject", "signature"],
    body: `Thanks for reaching out.

Can you send a little more detail about the topic or series so we can send the correct submission form?

Warmly,
{signature}`,
  },
] as const;

export const DEFAULT_AUTOMATION_MAILBOXES = [
  {
    label: "Support Pitch Inbox",
    emailAddress: "support@authoritymag.co",
    workflowType: AUTOMATION_WORKFLOWS.pitch,
  },
  {
    label: "Collaboration Inbox",
    emailAddress: "articlecollaborationteam@gmail.com",
    workflowType: AUTOMATION_WORKFLOWS.collaboration,
  },
] as const;

export const DEFAULT_SUPPRESSIONS = [
  { kind: "phrase", value: "unsubscribe", reason: "Needs manual review" },
  { kind: "phrase", value: "legal", reason: "Legal language must not be automated" },
  { kind: "phrase", value: "refund", reason: "Payment issues need human review" },
  { kind: "phrase", value: "confidential", reason: "Sensitive content needs human review" },
] as const;
