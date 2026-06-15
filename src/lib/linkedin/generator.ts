interface LinkedInInterview {
  intervieweeName: string;
  intervieweeCompany?: string | null;
  topic?: string | null;
  articleUrl: string;
}

const DEFAULT_HASHTAGS =
  "#AuthorityMagazine #ThoughtLeadership #Leadership #Interview";

export function generateLinkedInVariations(
  interview: LinkedInInterview,
  hashtags = DEFAULT_HASHTAGS
): string[] {
  const company = interview.intervieweeCompany
    ? ` (${interview.intervieweeCompany})`
    : "";
  const companyOf = interview.intervieweeCompany
    ? ` of ${interview.intervieweeCompany}`
    : "";
  const topic = interview.topic ? ` on ${interview.topic}` : "";

  return [
    `"[Insert favorite pull quote or key insight from the interview here]"\n\nThank you @${interview.intervieweeName} for this brilliant interview! It was a pleasure discussing "${interview.topic || 'your journey'}" with you.\n\nRead the full interview on Authority Magazine:\n${interview.articleUrl}\n\n${hashtags}`,
    `Thrilled to share my interview with ${interview.intervieweeName}${company}! We discussed key leadership lessons and industry insights. Check out the full conversation on Authority Magazine:\n\n${interview.articleUrl}\n\n${hashtags}`,
    `${interview.intervieweeName} shared thoughtful insights${topic} in our latest Authority Magazine conversation. One theme that stayed with me: meaningful leadership starts with curiosity.\n\nRead the full interview:\n${interview.articleUrl}\n\n${hashtags}`,
    `Great conversations create lasting connections. I appreciated the chance to interview ${interview.intervieweeName}${companyOf} for Authority Magazine.\n\nExplore the conversation here:\n${interview.articleUrl}\n\n${hashtags}`,
  ];
}

export function normalizeLinkedInPostUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid LinkedIn post URL.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com"))
  ) {
    throw new Error("Enter a LinkedIn URL from linkedin.com.");
  }

  return url.toString();
}
