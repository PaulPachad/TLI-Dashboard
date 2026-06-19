export function buildInterviewImageSources(interview: {
  id: string;
  image1Url?: string | null;
  image2Url?: string | null;
}): string[] {
  const sources = [
    normalizeSheetImageUrl(interview.image1Url),
    normalizeSheetImageUrl(interview.image2Url),
    `/api/interviews/${interview.id}/article-image`,
  ].filter((value): value is string => Boolean(value));

  return [...new Set(sources)];
}

export function normalizeSheetImageUrl(value?: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    const driveId =
      url.searchParams.get("id") ||
      url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ||
      url.pathname.match(/\/d\/([^/]+)/)?.[1];

    if (
      driveId &&
      (url.hostname === "drive.google.com" ||
        url.hostname === "docs.google.com")
    ) {
      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
        driveId
      )}&sz=w800`;
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export function extractArticleImage(html: string): string | null {
  return extractArticleMetadata(html).imageUrl;
}

export function extractArticleTitle(html: string): string | null {
  return extractArticleMetadata(html).title;
}

export function extractArticleMetadata(html: string): {
  imageUrl: string | null;
  title: string | null;
} {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  let imageUrl: string | null = null;
  let title: string | null = null;

  for (const tag of metaTags) {
    const property = getHtmlAttribute(tag, "property");
    const name = getHtmlAttribute(tag, "name");
    const key = (property || name || "").toLowerCase();
    const content = getHtmlAttribute(tag, "content");

    if (
      !imageUrl &&
      content &&
      ["og:image", "twitter:image", "twitter:image:src"].includes(key) &&
      isPublicHttpUrl(content)
    ) {
      imageUrl = decodeHtml(content);
    }

    if (
      !title &&
      content &&
      ["og:title", "twitter:title"].includes(key)
    ) {
      title = cleanArticleTitle(content);
    }
  }

  if (!title) {
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]) {
      title = cleanArticleTitle(titleMatch[1]);
    }
  }

  return { imageUrl, title };
}

function getHtmlAttribute(tag: string, attribute: string): string | null {
  const match = tag.match(
    new RegExp(`${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")
  );
  return match?.[1] || match?.[2] || null;
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(decodeHtml(value));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ");
}

function cleanArticleTitle(value: string): string | null {
  const decoded = decodeHtml(value)
    .replace(/\s+/g, " ")
    .replace(/\s*[|–-]\s*(Authority Magazine|Medium)\s*$/i, "")
    .trim();

  return decoded || null;
}
