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

export type DownloadProxyFailureKind = "blocked" | "network" | "upstream" | "unknown";

export type DownloadProxyFailure = {
  kind: DownloadProxyFailureKind;
  message: string;
  status: number;
};

/** Classify `/api/download` failure for snackbars (dev Vite + serve.py). */
export function describeDownloadProxyFailure(
  status: number,
  bodyText?: string | null,
): DownloadProxyFailure {
  const raw = (bodyText || "").trim();
  let messageFromBody: string | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { message?: unknown; ok?: unknown };
      if (typeof parsed?.message === "string" && parsed.message.trim()) {
        messageFromBody = parsed.message.trim();
      }
    } catch {
      messageFromBody = raw.slice(0, 200);
    }
  }
  const lower = (messageFromBody || "").toLowerCase();
  if (
    status === 400 ||
    /not allowed|host not allowed|url not allowed|redirect target/.test(lower)
  ) {
    return {
      kind: "blocked",
      status,
      message: "Media proxy blocked host (not allowlisted)",
    };
  }
  if (status >= 500 || status === 0) {
    return {
      kind: "network",
      status,
      message: messageFromBody
        ? `Media proxy network error: ${messageFromBody}`
        : "Media proxy network error",
    };
  }
  if (status === 401 || status === 403) {
    return {
      kind: "upstream",
      status,
      message:
        messageFromBody ||
        "Media proxy denied (auth/cookies may be required)",
    };
  }
  return {
    kind: "upstream",
    status,
    message: messageFromBody
      ? `Download failed (${status}): ${messageFromBody}`
      : `Download failed (${status})`,
  };
}

/** Fetch `/api/download` (or any URL); one retry on 5xx; throw classified Error. */
export async function fetchViaDownloadProxy(
  fetchUrl: string,
  init?: RequestInit,
): Promise<Response> {
  const attempt = async () => fetch(fetchUrl, init);
  let response = await attempt();
  if (response.status >= 500) {
    try {
      response = await attempt();
    } catch {
      /* keep first response if retry throws */
    }
  }
  if (response.ok || (response.status >= 200 && response.status < 300)) {
    return response;
  }
  let bodyText = "";
  try {
    bodyText = await response.clone().text();
  } catch {
    /* ignore */
  }
  const described = describeDownloadProxyFailure(response.status, bodyText);
  throw new Error(described.message);
}
