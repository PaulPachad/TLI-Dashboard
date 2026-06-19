import { isPrivateOrLocalHostname } from "./remote-image";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 2;

export interface RemoteHtmlOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  isAllowedUrl?: (url: URL) => boolean;
}

export async function remoteHtmlToText(
  value?: string | null,
  options: RemoteHtmlOptions = {}
): Promise<string | null> {
  if (!value) return null;

  const url = parseRemoteHtmlUrl(value);
  if (!url) return null;

  return fetchRemoteHtml(url, options);
}

export function parseRemoteHtmlUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

async function fetchRemoteHtml(
  initialUrl: URL,
  options: RemoteHtmlOptions
): Promise<string | null> {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let url = initialUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    if (options.isAllowedUrl && !options.isAllowedUrl(url)) return null;
    if (await isPrivateOrLocalHostname(url.hostname)) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        redirect: "manual",
        cache: "no-store",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; TLI-Leverage-Dashboard/1.0; social-image)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        },
      });

      if (isRedirect(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === maxRedirects) return null;
        const nextUrl = parseRemoteHtmlUrl(new URL(location, url).toString());
        if (!nextUrl) return null;
        url = nextUrl;
        continue;
      }

      if (!response.ok) return null;

      const contentType = response.headers.get("content-type") || "";
      const normalizedContentType = contentType.toLowerCase();
      if (
        normalizedContentType &&
        !normalizedContentType.startsWith("text/html") &&
        !normalizedContentType.startsWith("application/xhtml+xml")
      ) {
        return null;
      }

      const contentLength = Number(response.headers.get("content-length") || "0");
      if (contentLength > maxBytes) return null;

      const buffer = await readResponseWithLimit(response, maxBytes);
      if (!buffer) return null;
      return buffer.toString("utf8");
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

async function readResponseWithLimit(
  response: Response,
  maxBytes: number
): Promise<Buffer | null> {
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}
