/**
 * Vite-dev News proxy matching serve.py:
 *   GET /api/news/rss?source=all|flayrah|dogpatch|infurnation|fwg&feed=…
 *   GET /api/news/article/:source/:id
 *   GET /api/news/custom/rss?url=
 *   GET /api/news/custom/article?url=
 *   GET /api/news/custom/media?url=&allow=
 *
 * Also accepts legacy /api/flayrah/* for old clients.
 */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import dns from "node:dns/promises";
import { isIP } from "node:net";
import { resolveNewsRssUrl } from "./src/worker/news/feeds";
import {
  isNewsSource,
  newsArticleUpstreamUrl,
} from "./src/worker/news/registry";
import { NEWS_RSS_TIMEOUT_MS } from "./src/worker/news/timeouts";
import {
  CUSTOM_NEWS_ARTICLE_TIMEOUT_MS,
  CUSTOM_NEWS_HTML_MAX_BYTES,
  CUSTOM_NEWS_MAX_REDIRECTS,
  CUSTOM_NEWS_MEDIA_MAX_BYTES,
  CUSTOM_NEWS_MEDIA_TIMEOUT_MS,
  CUSTOM_NEWS_RSS_MAX_BYTES,
  contentTypeLooksLikeHtml,
  contentTypeLooksLikeImage,
  contentTypeLooksLikeXml,
  isBlockedHostname,
  isBlockedIpLiteral,
  mediaHostAllowed,
  validatePublicHttpsUrl,
} from "./src/worker/news/customUrl";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 m-e621-news-proxy/1.0";

const NEWS_ARTICLE_RE =
  /^\/api\/news\/article\/(flayrah|dogpatch|infurnation|fwg)\/(\d+)$/;
const LEGACY_ARTICLE_RE = /^\/api\/flayrah\/article\/(\d+)$/;

/** Match serve.py CUSTOM_NEWS_RATE_BURST (30 / 60s per peer). */
const CUSTOM_NEWS_RATE_BURST = 30;
const CUSTOM_NEWS_RATE_WINDOW_MS = 60_000;
const customNewsRateByIp = new Map<string, number[]>();

function customNewsClientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress || "unknown";
}

function customNewsRateOk(req: IncomingMessage): boolean {
  const ip = customNewsClientIp(req);
  const now = Date.now();
  const stamps = (customNewsRateByIp.get(ip) || []).filter(
    (t) => now - t < CUSTOM_NEWS_RATE_WINDOW_MS,
  );
  if (stamps.length >= CUSTOM_NEWS_RATE_BURST) {
    customNewsRateByIp.set(ip, stamps);
    return false;
  }
  stamps.push(now);
  customNewsRateByIp.set(ip, stamps);
  return true;
}

function send(
  res: ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
  maxAge: number,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", `private, max-age=${maxAge}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  send(res, status, Buffer.from(JSON.stringify(data)), "application/json", 0);
}

function corsOptions(res: ServerResponse): void {
  res.statusCode = 204;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  res.end();
}

async function assertPublicHostname(hostname: string): Promise<void> {
  if (isBlockedHostname(hostname)) throw new Error("host not allowed");
  if (isIP(hostname)) {
    if (isBlockedIpLiteral(hostname)) throw new Error("host not allowed");
    return;
  }
  let records: string[] = [];
  try {
    records = await dns.resolve4(hostname);
  } catch {
    try {
      records = await dns.resolve6(hostname);
    } catch {
      throw new Error("dns lookup failed");
    }
  }
  if (!records.length) throw new Error("dns lookup failed");
  for (const ip of records) {
    if (isBlockedIpLiteral(ip)) throw new Error("host not allowed");
  }
}

async function fetchUpstream(
  target: string,
  accept: string,
  timeoutMs?: number,
): Promise<{ status: number; body: Buffer; contentType: string }> {
  const resp = await fetch(target, {
    headers: {
      Accept: accept,
      "User-Agent": UA,
    },
    redirect: "follow",
    signal:
      timeoutMs != null ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const body = Buffer.from(await resp.arrayBuffer());
  const contentType =
    resp.headers.get("content-type") ||
    (accept.includes("html")
      ? "text/html; charset=utf-8"
      : "application/rss+xml");
  return { status: resp.status, body, contentType };
}

/**
 * Manual-redirect fetch with per-hop URL + DNS checks and a byte cap.
 */
async function fetchPublicHttps(opts: {
  url: string;
  accept: string;
  timeoutMs: number;
  maxBytes: number;
}): Promise<{ status: number; body: Buffer; contentType: string; finalUrl: string }> {
  let current = opts.url;
  for (let hop = 0; hop <= CUSTOM_NEWS_MAX_REDIRECTS; hop++) {
    const checked = validatePublicHttpsUrl(current);
    if (!checked.ok) throw new Error(checked.error);
    await assertPublicHostname(checked.hostname);

    const resp = await fetch(checked.href, {
      headers: {
        Accept: opts.accept,
        "User-Agent": UA,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs),
    });

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) throw new Error("redirect without location");
      current = new URL(loc, checked.href).href;
      continue;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      const empty = Buffer.alloc(0);
      return {
        status: resp.status,
        body: empty,
        contentType: resp.headers.get("content-type") || "application/octet-stream",
        finalUrl: checked.href,
      };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > opts.maxBytes) {
        reader.cancel().catch(() => undefined);
        throw new Error("response too large");
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return {
      status: resp.status,
      body,
      contentType:
        resp.headers.get("content-type") || "application/octet-stream",
      finalUrl: checked.href,
    };
  }
  throw new Error("too many redirects");
}

async function proxyRss(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const rawUrl = req.url || "/api/news/rss";
  const u = new URL(rawUrl, "http://localhost");
  const source = (u.searchParams.get("source") || "flayrah").trim().toLowerCase();
  const feed = (u.searchParams.get("feed") || "full").trim().toLowerCase();
  const pageRaw = u.searchParams.get("page") || "1";
  const page = parseInt(pageRaw, 10);
  const target = resolveNewsRssUrl(source, feed, page);

  if (!target) {
    sendJson(res, 400, {
      ok: false,
      message: `unknown news source/feed: ${source}/${feed}`,
    });
    return;
  }
  try {
    const resp = await fetchUpstream(
      target,
      "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      NEWS_RSS_TIMEOUT_MS,
    );
    send(res, resp.status, resp.body, resp.contentType, 300);
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      message: `news rss failed: ${err}`,
    });
  }
}

async function proxyArticle(
  res: ServerResponse,
  source: string,
  rawId: string,
): Promise<void> {
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    sendJson(res, 400, { ok: false, message: "invalid article id" });
    return;
  }
  if (!isNewsSource(source)) {
    sendJson(res, 400, { ok: false, message: `unknown news source: ${source}` });
    return;
  }
  const target = newsArticleUpstreamUrl(source, id);
  if (!target) {
    sendJson(res, 400, { ok: false, message: "invalid article id" });
    return;
  }
  try {
    const resp = await fetchUpstream(
      target,
      "text/html,application/xhtml+xml,*/*",
    );
    send(res, resp.status, resp.body, resp.contentType, 600);
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      message: `news article failed: ${err}`,
    });
  }
}

async function proxyCustomRss(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const u = new URL(req.url || "/", "http://localhost");
  const checked = validatePublicHttpsUrl(u.searchParams.get("url"));
  if (!checked.ok) {
    sendJson(res, 400, { ok: false, message: checked.error });
    return;
  }
  try {
    const resp = await fetchPublicHttps({
      url: checked.href,
      accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      timeoutMs: NEWS_RSS_TIMEOUT_MS,
      maxBytes: CUSTOM_NEWS_RSS_MAX_BYTES,
    });
    if (!contentTypeLooksLikeXml(resp.contentType) && resp.status === 200) {
      // Some hosts serve RSS as octet-stream; still allow if body looks like XML.
      const head = resp.body.subarray(0, 200).toString("utf8");
      if (!/<(\?xml|rss|feed)\b/i.test(head)) {
        sendJson(res, 415, { ok: false, message: "not an RSS/Atom feed" });
        return;
      }
    }
    send(res, resp.status, resp.body, resp.contentType, 300);
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      message: `custom news rss failed: ${err instanceof Error ? err.message : err}`,
    });
  }
}

async function proxyCustomArticle(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const u = new URL(req.url || "/", "http://localhost");
  const checked = validatePublicHttpsUrl(u.searchParams.get("url"));
  if (!checked.ok) {
    sendJson(res, 400, { ok: false, message: checked.error });
    return;
  }
  try {
    const resp = await fetchPublicHttps({
      url: checked.href,
      accept: "text/html,application/xhtml+xml,*/*",
      timeoutMs: CUSTOM_NEWS_ARTICLE_TIMEOUT_MS,
      maxBytes: CUSTOM_NEWS_HTML_MAX_BYTES,
    });
    if (
      resp.status === 200 &&
      !contentTypeLooksLikeHtml(resp.contentType)
    ) {
      sendJson(res, 415, { ok: false, message: "not an HTML page" });
      return;
    }
    send(res, resp.status, resp.body, resp.contentType, 600);
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      message: `custom news article failed: ${err instanceof Error ? err.message : err}`,
    });
  }
}

async function proxyCustomMedia(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const u = new URL(req.url || "/", "http://localhost");
  const checked = validatePublicHttpsUrl(u.searchParams.get("url"));
  if (!checked.ok) {
    sendJson(res, 400, { ok: false, message: checked.error });
    return;
  }
  const allowed = u.searchParams
    .getAll("allow")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length || !mediaHostAllowed(checked.hostname, allowed)) {
    sendJson(res, 400, { ok: false, message: "media host not allowed" });
    return;
  }
  try {
    const resp = await fetchPublicHttps({
      url: checked.href,
      accept: "image/*,*/*;q=0.8",
      timeoutMs: CUSTOM_NEWS_MEDIA_TIMEOUT_MS,
      maxBytes: CUSTOM_NEWS_MEDIA_MAX_BYTES,
    });
    if (
      resp.status === 200 &&
      !contentTypeLooksLikeImage(resp.contentType)
    ) {
      sendJson(res, 415, { ok: false, message: "not an image" });
      return;
    }
    send(res, resp.status, resp.body, resp.contentType, 3600);
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      message: `custom news media failed: ${err instanceof Error ? err.message : err}`,
    });
  }
}

export function newsProxy(): Plugin {
  return {
    name: "news-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || "").split("?")[0];
        const newsArticle = NEWS_ARTICLE_RE.exec(urlPath || "");
        const legacyArticle = LEGACY_ARTICLE_RE.exec(urlPath || "");
        const isNewsRss = urlPath === "/api/news/rss";
        const isLegacyRss = urlPath === "/api/flayrah/rss";
        const isCustomRss = urlPath === "/api/news/custom/rss";
        const isCustomArticle = urlPath === "/api/news/custom/article";
        const isCustomMedia = urlPath === "/api/news/custom/media";
        if (
          !isNewsRss &&
          !isLegacyRss &&
          !newsArticle &&
          !legacyArticle &&
          !isCustomRss &&
          !isCustomArticle &&
          !isCustomMedia
        ) {
          next();
          return;
        }
        if (req.method === "OPTIONS") {
          corsOptions(res);
          return;
        }
        if (req.method !== "GET") {
          sendJson(res, 405, { ok: false, message: "method not allowed" });
          return;
        }
        if (isCustomRss || isCustomArticle || isCustomMedia) {
          if (!customNewsRateOk(req)) {
            sendJson(res, 429, { ok: false, message: "rate limited" });
            return;
          }
        }
        if (isCustomRss) {
          await proxyCustomRss(req, res);
          return;
        }
        if (isCustomArticle) {
          await proxyCustomArticle(req, res);
          return;
        }
        if (isCustomMedia) {
          await proxyCustomMedia(req, res);
          return;
        }
        if (isNewsRss || isLegacyRss) {
          await proxyRss(req, res);
          return;
        }
        if (newsArticle) {
          await proxyArticle(res, newsArticle[1], newsArticle[2]);
          return;
        }
        if (legacyArticle) {
          await proxyArticle(res, "flayrah", legacyArticle[1]);
        }
      });
    },
  };
}

/** @deprecated */
export const flayrahProxy = newsProxy;
