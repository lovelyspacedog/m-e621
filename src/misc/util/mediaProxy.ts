/**
 * Same-origin media proxy helpers.
 *
 * e621 CDN only allows CORS from e621.net and lacks CORP. Under
 * Cross-Origin-Embedder-Policy: credentialless, Firefox/Zen often fail to
 * play cross-origin <video> (ORB / Range / moov-at-end). Routing through
 * /api/download makes the media first-party so playback works.
 */

/** Rewrite a remote CDN URL through /api/download (idempotent). */
export function proxyDownloadUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/api/download")) return url;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  try {
    const parsed = new URL(url, typeof location !== "undefined" ? location.origin : "https://local");
    if (typeof location !== "undefined" && parsed.origin === location.origin) {
      return parsed.pathname + parsed.search;
    }
  } catch {
    // fall through
  }
  return `/api/download?url=${encodeURIComponent(url)}`;
}

/**
 * Recover the upstream https URL from a same-origin `/api/download?url=…`
 * rewrite (FA / Inkbunny / Weasyl). Leaves absolute http(s) URLs alone.
 */
export function unwrapProxyDownloadUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  try {
    const parsed = new URL(url, "https://local.invalid");
    if (!parsed.pathname.startsWith("/api/download")) return null;
    const upstream = parsed.searchParams.get("url");
    if (!upstream || !/^https?:\/\//i.test(upstream)) return null;
    return upstream;
  } catch {
    return null;
  }
}
