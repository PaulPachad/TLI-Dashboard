import { remoteHtmlToText } from "./remote-html";
import { extractArticleMetadata } from "./interview-image";

const articleMetadataCache = new Map<
  string,
  { expiresAt: number; imageUrl: string | null; title: string | null }
>();

export function isAllowedArticleUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return (
    hostname === "medium.com" ||
    hostname.endsWith(".medium.com") ||
    hostname === "authoritymagazine.com" ||
    hostname.endsWith(".authoritymagazine.com")
  );
}

export async function fetchArticleMetadata(articleUrl?: string | null): Promise<{
  imageUrl: string | null;
  title: string | null;
}> {
  if (!articleUrl || articleUrl.includes("/unpublished/")) {
    return { imageUrl: null, title: null };
  }

  if (articleMetadataCache.has(articleUrl)) {
    const cached = articleMetadataCache.get(articleUrl)!;
    if (cached.expiresAt > Date.now()) {
      return { imageUrl: cached.imageUrl, title: cached.title };
    }
  }

  try {
    const html = await remoteHtmlToText(articleUrl, {
      isAllowedUrl: isAllowedArticleUrl,
    });

    if (!html) return { imageUrl: null, title: null };

    const metadata = extractArticleMetadata(html);
    articleMetadataCache.set(articleUrl, {
      ...metadata,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return metadata;
  } catch {
    return { imageUrl: null, title: null };
  }
}
