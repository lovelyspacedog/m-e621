/**
 * Public-HTTPS URL checks for custom News RSS / article / media fetches.
 * Pure (no Node APIs) so the browser client can reuse the same rules.
 * Vite proxy / serve.py also re-check after DNS.
 */

export const CUSTOM_NEWS_RSS_MAX_BYTES = 2 * 1024 * 1024;
export const CUSTOM_NEWS_HTML_MAX_BYTES = Math.floor(1.5 * 1024 * 1024);
export const CUSTOM_NEWS_MEDIA_MAX_BYTES = 4 * 1024 * 1024;
export const CUSTOM_NEWS_ARTICLE_TIMEOUT_MS = 15_000;
export const CUSTOM_NEWS_MEDIA_TIMEOUT_MS = 10_000;
export const CUSTOM_NEWS_MAX_REDIRECTS = 3;
export const CUSTOM_NEWS_FEED_CAP = 8;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function isBlockedIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(":")) return false;
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("ff")) return true; // multicast
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return false;
}

/** True when a literal IP must not be fetched. */
export function isBlockedIpLiteral(ip: string): boolean {
  const raw = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (isIpv4Literal(raw)) return isBlockedIpv4(raw);
  if (raw.includes(":")) return isBlockedIpv6(raw);
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (isIpv4Literal(h) || h.includes(":")) return isBlockedIpLiteral(h);
  return false;
}

/**
 * Parse and reject non-public https URLs (no DNS).
 * Returns a normalized href or an error message.
 */
export function validatePublicHttpsUrl(
  raw: unknown,
): { ok: true; href: string; hostname: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "url required" };
  }
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "invalid url" };
  }
  if (u.protocol !== "https:") {
    return { ok: false, error: "https only" };
  }
  if (u.username || u.password) {
    return { ok: false, error: "credentials not allowed" };
  }
  if (u.port && u.port !== "443") {
    return { ok: false, error: "port not allowed" };
  }
  if (isBlockedHostname(u.hostname)) {
    return { ok: false, error: "host not allowed" };
  }
  return { ok: true, href: u.href, hostname: u.hostname.toLowerCase() };
}

export function contentTypeLooksLikeXml(ct: string): boolean {
  const c = ct.toLowerCase();
  return (
    c.includes("xml") ||
    c.includes("rss") ||
    c.includes("atom") ||
    c.includes("text/plain")
  );
}

export function contentTypeLooksLikeHtml(ct: string): boolean {
  const c = ct.toLowerCase();
  return c.includes("html") || c.includes("xhtml") || c.includes("text/plain");
}

export function contentTypeLooksLikeImage(ct: string): boolean {
  return ct.toLowerCase().startsWith("image/");
}

/** Media host must match one of the allowed hostnames (exact). */
export function mediaHostAllowed(
  mediaHost: string,
  allowedHosts: string[],
): boolean {
  const h = mediaHost.toLowerCase();
  return allowedHosts.some((a) => a.toLowerCase() === h);
}
