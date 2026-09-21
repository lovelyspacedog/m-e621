/**
 * Vite-dev News proxy matching serve.py:
 *   GET /api/news/rss?source=all|flayrah|dogpatch&feed=…
 *   GET /api/news/article/:source/:id
 *
 * Also accepts legacy /api/flayrah/* for old clients.
 */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveNewsRssUrl } from "./src/worker/news/feeds";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 m-e621-news-proxy/1.0";

const NEWS_ARTICLE_RE = /^\/api\/news\/article\/(flayrah|dogpatch)\/(\d+)$/;
const LEGACY_ARTICLE_RE = /^\/api\/flayrah\/article\/(\d+)$/;

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

async function fetchUpstream(
  target: string,
  accept: string,
): Promise<{ status: number; body: Buffer; contentType: string }> {
  const resp = await fetch(target, {
    headers: {
      Accept: accept,
      "User-Agent": UA,
    },
    redirect: "follow",
  });
  const body = Buffer.from(await resp.arrayBuffer());
  const contentType =
    resp.headers.get("content-type") ||
    (accept.includes("html")
      ? "text/html; charset=utf-8"
      : "application/rss+xml");
  return { status: resp.status, body, contentType };
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
      "application/rss+xml, application/xml, text/xml, */*",
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
  const target =
    source === "dogpatch"
      ? `https://dogpatch.press/?p=${id}`
      : `https://www.flayrah.com/node/${id}`;
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
        if (!isNewsRss && !isLegacyRss && !newsArticle && !legacyArticle) {
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
