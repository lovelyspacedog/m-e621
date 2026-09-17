/**
 * Vite-dev Flayrah proxy matching serve.py:
 *   GET /api/flayrah/rss?feed=…
 *   GET /api/flayrah/article/:id
 */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

const FLAYRAH_FEEDS: Record<string, string> = {
  full: "https://www.flayrah.com/rss-full.xml",
  reviews: "https://www.flayrah.com/taxonomy/term/37/0/feed",
  opinion: "https://www.flayrah.com/taxonomy/term/36/0/feed",
  media: "https://www.flayrah.com/taxonomy/term/41/0/feed",
  conventions: "https://www.flayrah.com/taxonomy/term/30/0/feed",
  games: "https://www.flayrah.com/taxonomy/term/60/0/feed",
  "science-fiction": "https://www.flayrah.com/taxonomy/term/32/0/feed",
  art: "https://www.flayrah.com/taxonomy/term/49/0/feed",
  "wikifur-news": "https://www.flayrah.com/taxonomy/term/51/0/feed",
};

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 m-e621-flayrah-proxy/1.0";

const ARTICLE_RE = /^\/api\/flayrah\/article\/(\d+)$/;

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

async function proxyRss(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawUrl = req.url || "/api/flayrah/rss";
  const u = new URL(rawUrl, "http://localhost");
  const feed = (u.searchParams.get("feed") || "full").trim().toLowerCase();
  const target = FLAYRAH_FEEDS[feed];
  if (!target) {
    sendJson(res, 400, { ok: false, message: `unknown flayrah feed: ${feed}` });
    return;
  }
  try {
    const resp = await fetch(target, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent": UA,
      },
    });
    const body = Buffer.from(await resp.arrayBuffer());
    const contentType =
      resp.headers.get("content-type") || "application/rss+xml";
    send(res, resp.status, body, contentType, 300);
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      message: `flayrah rss failed: ${err}`,
    });
  }
}

async function proxyArticle(
  res: ServerResponse,
  nodeId: string,
): Promise<void> {
  const id = parseInt(nodeId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    sendJson(res, 400, { ok: false, message: "invalid article id" });
    return;
  }
  try {
    const resp = await fetch(`https://www.flayrah.com/node/${id}`, {
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*",
        "User-Agent": UA,
      },
    });
    const body = Buffer.from(await resp.arrayBuffer());
    const contentType =
      resp.headers.get("content-type") || "text/html; charset=utf-8";
    send(res, resp.status, body, contentType, 600);
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      message: `flayrah article failed: ${err}`,
    });
  }
}

export function flayrahProxy(): Plugin {
  return {
    name: "flayrah-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || "").split("?")[0];
        const articleMatch = ARTICLE_RE.exec(urlPath || "");
        const isRss = urlPath === "/api/flayrah/rss";
        if (!isRss && !articleMatch) {
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
        if (isRss) {
          await proxyRss(req, res);
          return;
        }
        if (articleMatch) {
          await proxyArticle(res, articleMatch[1]);
        }
      });
    },
  };
}
