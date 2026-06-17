import { AUTOMATION_TEMPLATE_KEYS, AUTOMATION_WORKFLOWS } from "@/lib/automation/defaults";
import { ensureAutomationProfile, toJsonList } from "@/lib/automation/service";

export interface AutomationTestInput {
  subject: string;
  sender: string;
  body: string;
}

export interface AutomationTestResult {
  workflowType: string;
  action: "draft" | "skip" | "manual_review";
  replyTo: string | null;
  matchedTopic: string | null;
  matchedUrl: string | null;
  matchScore: number;
  confidence: "high" | "medium" | "low";
  templateKey: string | null;
  subjectPreview: string;
  bodyPreview: string;
  reasons: string[];
}

const PITCH_MARKERS = [
  "summary and confirmation of your pitch",
  "dear authority magazine editors",
  "consider me or my client for the following interview topic",
  "name and title of the interviewee",
  "your 200 word pitch",
  "what is the best email to follow up",
  "what is the name of the interview topic",
];

const MANUAL_REVIEW_PATTERNS = [
  "unsubscribe",
  "legal",
  "refund",
  "confidential",
  "angry",
  "complaint",
  "remove me",
  "cease",
];

export async function runAutomationTest(input: AutomationTestInput): Promise<AutomationTestResult> {
  const profile = await ensureAutomationProfile();
  const subject = String(input.subject || "").trim();
  const sender = String(input.sender || "").trim();
  const body = String(input.body || "").trim();
  const haystack = `${subject}\n${sender}\n${body}`.toLowerCase();
  const reasons: string[] = [];

  const configuredSkipPhrases = toJsonList(profile.skipPhrasesJson);
  const skipHit = [...configuredSkipPhrases, ...MANUAL_REVIEW_PATTERNS].find((phrase) =>
    phrase && haystack.includes(phrase.toLowerCase())
  );

  if (profile.globalKillSwitch) {
    reasons.push("Global kill switch is on.");
    return emptyResult(subject, sender, "manual_review", reasons);
  }

  if (skipHit) {
    reasons.push(`Matched manual-review phrase: ${skipHit}`);
  }

  const isCollab = /\b(haro|source of sources|sos|qwoted|featured|media request)\b/i.test(
    haystack
  );
  const pitchMarkerCount = PITCH_MARKERS.filter((marker) => haystack.includes(marker)).length;
  const isExtension = isExtensionRequest(subject, body);
  const replyTo = extractReplyEmail(sender, body);

  if (isExtension) {
    const template = findTemplate(profile.templates, AUTOMATION_TEMPLATE_KEYS.extension);
    reasons.push("Detected a deadline extension request.");
    return {
      workflowType: AUTOMATION_WORKFLOWS.pitch,
      action: skipHit ? "manual_review" : "draft",
      replyTo,
      matchedTopic: "Extension Request",
      matchedUrl: null,
      matchScore: 95,
      confidence: "high",
      templateKey: AUTOMATION_TEMPLATE_KEYS.extension,
      subjectPreview: renderTemplate(template?.subject || "Re: {original_subject}", {
        original_subject: stripReplyPrefix(subject),
      }),
      bodyPreview: renderTemplate(template?.body || "Sure! :-)", {
        original_subject: stripReplyPrefix(subject),
      }),
      reasons,
    };
  }

  if (isCollab) {
    const topic = extractSubjectTopic(subject, body) || "Collaboration pitch";
    const template = findTemplate(profile.templates, AUTOMATION_TEMPLATE_KEYS.collaborationAcceptance);
    reasons.push("Detected a collaboration/media-request workflow.");
    reasons.push("Full form matching still runs in the local bridge worker.");
    return {
      workflowType: AUTOMATION_WORKFLOWS.collaboration,
      action: skipHit ? "manual_review" : "draft",
      replyTo,
      matchedTopic: topic,
      matchedUrl: profile.formSheetUrl || null,
      matchScore: 70,
      confidence: "medium",
      templateKey: AUTOMATION_TEMPLATE_KEYS.collaborationAcceptance,
      subjectPreview: renderTemplate(template?.subject || "Re: {original_subject}", {
        original_subject: stripReplyPrefix(subject),
      }),
      bodyPreview: renderTemplate(template?.body || "", {
        original_subject: stripReplyPrefix(subject),
        topic_name: topic,
        form_url: "[matched form link]",
        signature: "Yitzi",
      }),
      reasons,
    };
  }

  if (pitchMarkerCount >= 2 || /pitch|interview topic|authority magazine/i.test(haystack)) {
    const extractedTopic = extractPitchTopic(body) || extractSubjectTopic(subject, body);
    const templateKey = extractedTopic
      ? AUTOMATION_TEMPLATE_KEYS.acceptance
      : AUTOMATION_TEMPLATE_KEYS.noMatch;
    const template = findTemplate(profile.templates, templateKey);
    const score = extractedTopic ? Math.max(profile.matchThreshold, 90) : 35;

    reasons.push(
      extractedTopic
        ? "Detected an Authority Magazine pitch form."
        : "Detected a pitch, but no clear topic was found."
    );
    reasons.push("Exact topic matching still runs in the local bridge worker.");

    return {
      workflowType: AUTOMATION_WORKFLOWS.pitch,
      action: skipHit ? "manual_review" : "draft",
      replyTo,
      matchedTopic: extractedTopic,
      matchedUrl: extractedTopic ? "[matched interview questions link]" : null,
      matchScore: score,
      confidence: extractedTopic ? "high" : "low",
      templateKey,
      subjectPreview: renderTemplate(template?.subject || "", {
        series_name: extractedTopic || "Selected Series",
      }),
      bodyPreview: renderTemplate(template?.body || "", {
        series_name: extractedTopic || "Selected Series",
        interview_link: extractedTopic ? "[matched interview questions link]" : "",
        signature: "Yitzi",
      }),
      reasons,
    };
  }

  reasons.push("No supported responder workflow was detected.");
  return emptyResult(subject, sender, "skip", reasons);
}

function emptyResult(
  subject: string,
  sender: string,
  action: "skip" | "manual_review",
  reasons: string[]
): AutomationTestResult {
  return {
    workflowType: "UNKNOWN",
    action,
    replyTo: extractReplyEmail(sender, ""),
    matchedTopic: null,
    matchedUrl: null,
    matchScore: 0,
    confidence: "low",
    templateKey: null,
    subjectPreview: subject,
    bodyPreview: "",
    reasons,
  };
}

function findTemplate(
  templates: Array<{ templateKey: string; subject: string | null; body: string }>,
  key: string
) {
  return templates.find((template) => template.templateKey === key);
}

function isExtensionRequest(subject: string, body: string) {
  const snippet = `${subject}\n${body.slice(0, 1000)}`;
  if (/thank\s*(you|s)?\s+for\s+(the|an)?\s*exten[st]ion/i.test(snippet)) return false;
  return (
    /\bdeadline\s+exten[st]ion\b/i.test(snippet) ||
    /\bneed\s+(an\s+)?exten[st]ion\b/i.test(snippet) ||
    /\brequest(ing)?\s+(an\s+)?exten[st]ion\b/i.test(snippet) ||
    /\bexten[st]ion\b.{0,60}\bdeadline\b/i.test(snippet) ||
    /\bdeadline\b.{0,60}\bexten[st]ion\b/i.test(snippet)
  );
}

function extractReplyEmail(sender: string, body: string) {
  const bodyMatch = body.match(
    /(?:best email to follow up with you|email to follow up|follow up email|reply to)\s*[:\-]?\s*([^\s<>]+@[^\s<>]+\.[^\s<>]+)/i
  );
  if (bodyMatch) return bodyMatch[1].trim().toLowerCase();
  const angleMatch = sender.match(/<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/);
  if (angleMatch) return angleMatch[1].trim().toLowerCase();
  const senderMatch = sender.match(/([^\s<>]+@[^\s<>]+\.[^\s<>]+)/);
  return senderMatch ? senderMatch[1].trim().toLowerCase() : null;
}

function extractPitchTopic(body: string) {
  const patterns = [
    /what is the name of the interview topic\s*[:\-]?\s*(.+)/i,
    /interview topic\s*[:\-]?\s*(.+)/i,
    /topic\s*[:\-]?\s*(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match?.[1]) {
      return cleanLine(match[1]);
    }
  }
  return null;
}

function extractSubjectTopic(subject: string, body: string) {
  const subjectClean = stripReplyPrefix(subject);
  if (subjectClean && subjectClean.length > 8) return subjectClean.slice(0, 160);
  const firstBodyLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 8);
  return firstBodyLine ? firstBodyLine.slice(0, 160) : null;
}

function cleanLine(value: string) {
  return value
    .split(/\r?\n/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function stripReplyPrefix(subject: string) {
  return subject.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "").trim();
}

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    return values[key] ?? `{${key}}`;
  });
}
