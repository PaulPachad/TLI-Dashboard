import { lookup } from "dns/promises";
import net from "net";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 2;
const CACHE_TTL_MS = 10 * 60 * 1000;

const imageCache = new Map<string, { expiresAt: number; dataUrl: string | null }>();

export interface RemoteImageOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
}

export async function remoteImageUrlToDataUrl(
  value?: string | null,
  options: RemoteImageOptions = {}
): Promise<string | null> {
  if (!value) return null;

  const url = parseRemoteImageUrl(value);
  if (!url) return null;

  const cacheKey = url.toString();
  const cached = imageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.dataUrl;
  }

  const dataUrl = await fetchRemoteImage(url, options);
  imageCache.set(cacheKey, {
    dataUrl,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return dataUrl;
}

export function parseRemoteImageUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export async function isPrivateOrLocalHostname(hostname: string): Promise<boolean> {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "metadata.google.internal"
  ) {
    return true;
  }

  const directIpVersion = net.isIP(normalized);
  if (directIpVersion) {
    return isPrivateIpAddress(normalized);
  }

  try {
    const addresses = await lookup(normalized, { all: true, verbatim: true });
    return addresses.some((address) => isPrivateIpAddress(address.address));
  } catch {
    return false;
  }
}

export function isPrivateIpAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 ||
      a === 0
    );
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedIpv4) return isPrivateIpAddress(mappedIpv4[1]);

    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return true;
}

async function fetchRemoteImage(
  initialUrl: URL,
  options: RemoteImageOptions
): Promise<string | null> {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let url = initialUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    if (await isPrivateOrLocalHostname(url.hostname)) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "Authority-Magazine-Social-Image/1.0",
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8",
        },
      });

      if (isRedirect(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === maxRedirects) return null;
        const nextUrl = parseRemoteImageUrl(new URL(location, url).toString());
        if (!nextUrl) return null;
        url = nextUrl;
        continue;
      }

      if (!response.ok) return null;

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) return null;

      const contentLength = Number(response.headers.get("content-length") || "0");
      if (contentLength > maxBytes) return null;

      const buffer = await readResponseWithLimit(response, maxBytes);
      if (!buffer) return null;

      return `data:${contentType.split(";")[0]};base64,${buffer.toString("base64")}`;
    } catch (error) {
      console.warn("Could not load profile photo for social image.", error);
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
