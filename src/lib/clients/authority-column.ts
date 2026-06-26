export function normalizeAuthorityColumnUrl(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Unsupported protocol");
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const isAllowedHost =
      hostname === "medium.com" ||
      hostname.endsWith(".medium.com") ||
      hostname === "authoritymagazine.com" ||
      hostname.endsWith(".authoritymagazine.com");

    if (!isAllowedHost) {
      throw new Error("Unsupported host");
    }

    return url.toString();
  } catch {
    throw new Error(
      "Enter a valid Authority Magazine or Medium column URL, such as https://medium.com/@JimHamel."
    );
  }
}
