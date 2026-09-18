/**
 * Vite-dev Weasyl proxy matching serve.py /api/weasyl/*.
 * Production uses serve.py's Python proxy with html.parser scraping;
 * this handles the same routes for `npm run dev`.
 */
import type { Plugin } from "vite";
import type { ServerResponse } from "node:http";

const WEASYL_API_BASE = "https://www.weasyl.com";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 me621-weasyl-proxy/1.0";

// ---------------------------------------------------------------------------
// HTML search scraper (mirrors _parse_weasyl_search_html in serve.py)
// ---------------------------------------------------------------------------

interface WeasylSearchHit {
  submitid: number;
  title: string;
  owner: string;
  owner_login: string;
  posted_at: string;
  rating: string;
  type: string;
  subtype: string;
  tags: string[];
  media: { thumbnail: Array<{ mediaid: null; url: string }> };
}

function parseWeasylSearchHtml(html: string): {
  submissions: WeasylSearchHit[];
  nextid: number | null;
} {
  const submissions: WeasylSearchHit[] = [];
  let nextid: number | null = null;

  // Extract nextid from pagination links
  const nextidMatches = Array.from(html.matchAll(/[?&]nextid=(\d+)/g));
  if (nextidMatches.length > 0) {
    const last = nextidMatches[nextidMatches.length - 1];
    const n = parseInt(last[1], 10);
    if (!isNaN(n)) nextid = n;
  }

  // Extract submission figure blocks
  // Weasyl search thumbnails are in <figure class="thumb ..."> blocks
  const figurePattern = /<figure[^>]*\bthumb\b[^>]*>([\s\S]*?)<\/figure>/gi;
  let figMatch: RegExpExecArray | null;
  while ((figMatch = figurePattern.exec(html)) !== null) {
    const block = figMatch[1];

    // Extract submission URL → submitid + owner_login
    const linkMatch = block.match(/href="\/~([^/]+)\/submissions\/(\d+)/);
    if (!linkMatch) continue;
    const ownerLogin = linkMatch[1];
    const submitid = parseInt(linkMatch[2], 10);
    if (isNaN(submitid)) continue;

    // Extract thumbnail URL
    const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
    const thumbUrl = imgMatch ? imgMatch[1] : "";

    // Extract title from img alt or link text
    const altMatch = block.match(/<img[^>]+alt="([^"]*)"[^>]*>/i);
    let title = altMatch ? altMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"') : "";
    if (!title) {
      const linkTextMatch = block.match(/>([^<]{1,120})<\/a>/);
      title = linkTextMatch ? linkTextMatch[1].trim() : "";
    }

    // Extract rating from class like "rating-general"
    const ratingMatch = block.match(/\brating-(\w+)\b/);
    const rating = ratingMatch ? ratingMatch[1] : "general";

    submissions.push({
      submitid,
      title,
      owner: ownerLogin,
      owner_login: ownerLogin,
      posted_at: "",
      rating,
      type: "submission",
      subtype: "visual",
      tags: [],
      media: {
        thumbnail: thumbUrl ? [{ mediaid: null, url: thumbUrl }] : [],
      },
    });
  }

  return { submissions, nextid };
}

// ---------------------------------------------------------------------------
// Proxy helpers
// ---------------------------------------------------------------------------

async function weasylApiRequest(
  url: string,
  apiKey?: string | null,
): Promise<{ body: Buffer; status: number; contentType: string }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": UA,
  };
  if (apiKey) headers["X-Weasyl-API-Key"] = apiKey;

  try {
    const resp = await fetch(url, { headers });
    const body = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get("content-type") || "application/json";
    return { body, status: resp.status, contentType };
  } catch (err) {
    const body = Buffer.from(JSON.stringify({ error: { name: String(err) } }));
    return { body, status: 502, contentType: "application/json" };
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  data: unknown,
): void {
  const body = Buffer.from(JSON.stringify(data));
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(body);
}

function sendBuffer(
  res: ServerResponse,
  status: number,
  body: Buffer,
  _contentType: string,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(body);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function weasylProxy(): Plugin {
  return {
    name: "weasyl-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || "").split("?")[0];
        if (!urlPath.startsWith("/api/weasyl/")) {
          next();
          return;
        }

        const qs = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
        const params = new URLSearchParams(qs);
        const apiKey = params.get("key") || undefined;

        try {
          // ── GET /api/weasyl/frontpage ────────────────────────────────────
          if (urlPath === "/api/weasyl/frontpage") {
            const fwd = new URLSearchParams();
            for (const key of ["count", "since"]) {
              const v = params.get(key);
              if (v !== null) fwd.set(key, v);
            }
            const { body, status, contentType } = await weasylApiRequest(
              `${WEASYL_API_BASE}/api/submissions/frontpage?${fwd}`,
              apiKey,
            );
            sendBuffer(res, status, body, contentType);
            return;
          }

          // ── GET /api/weasyl/whoami ───────────────────────────────────────
          if (urlPath === "/api/weasyl/whoami") {
            if (!apiKey) {
              sendJson(res, 401, { error: { name: "Unauthorized" } });
              return;
            }
            const { body, status, contentType } = await weasylApiRequest(
              `${WEASYL_API_BASE}/api/whoami`,
              apiKey,
            );
            sendBuffer(res, status, body, contentType);
            return;
          }

          // ── GET /api/weasyl/submission/<id> ─────────────────────────────
          const subMatch = /^\/api\/weasyl\/submission\/(\d+)$/.exec(urlPath);
          if (subMatch) {
            const { body, status, contentType } = await weasylApiRequest(
              `${WEASYL_API_BASE}/api/submissions/${subMatch[1]}/view?anyway=1`,
              apiKey,
            );
            sendBuffer(res, status, body, contentType);
            return;
          }

          // ── GET /api/weasyl/gallery/<login> ─────────────────────────────
          const galleryMatch = /^\/api\/weasyl\/gallery\/([^/]+)$/.exec(urlPath);
          if (galleryMatch) {
            const fwd = new URLSearchParams();
            for (const key of ["count", "nextid", "backid", "folderid", "since"]) {
              const v = params.get(key);
              if (v !== null) fwd.set(key, v);
            }
            const { body, status, contentType } = await weasylApiRequest(
              `${WEASYL_API_BASE}/api/users/${galleryMatch[1]}/gallery?${fwd}`,
              apiKey,
            );
            sendBuffer(res, status, body, contentType);
            return;
          }

          // ── GET /api/weasyl/favorites/<login> ───────────────────────────
          const favesMatch = /^\/api\/weasyl\/favorites\/([^/]+)$/.exec(urlPath);
          if (favesMatch) {
            const fwd = new URLSearchParams();
            for (const key of ["count", "nextid", "backid"]) {
              const v = params.get(key);
              if (v !== null) fwd.set(key, v);
            }
            // Weasyl API 1.2 has no dedicated favorites endpoint; use gallery
            const { body, status, contentType } = await weasylApiRequest(
              `${WEASYL_API_BASE}/api/users/${favesMatch[1]}/gallery?${fwd}`,
              apiKey,
            );
            sendBuffer(res, status, body, contentType);
            return;
          }

          // ── GET /api/weasyl/user/<login> ─────────────────────────────────
          const userMatch = /^\/api\/weasyl\/user\/([^/]+)$/.exec(urlPath);
          if (userMatch) {
            const { body, status, contentType } = await weasylApiRequest(
              `${WEASYL_API_BASE}/api/users/${userMatch[1]}/view`,
              apiKey,
            );
            sendBuffer(res, status, body, contentType);
            return;
          }

          // ── GET /api/weasyl/search ───────────────────────────────────────
          if (urlPath === "/api/weasyl/search") {
            const q = params.get("q") || "";
            if (!q) {
              // Redirect to frontpage when no query
              const fwd = new URLSearchParams();
              const count = params.get("count");
              if (count) fwd.set("count", count);
              const { body, status, contentType } = await weasylApiRequest(
                `${WEASYL_API_BASE}/api/submissions/frontpage?${fwd}`,
                apiKey,
              );
              sendBuffer(res, status, body, contentType);
              return;
            }

            const scrapeParams = new URLSearchParams({ q, find: "submit" });
            const nextid = params.get("nextid");
            if (nextid) scrapeParams.set("nextid", nextid);
            const orderby = params.get("orderby");
            if (orderby === "popular") scrapeParams.set("orderby", "faves");

            const scrapeUrl = `${WEASYL_API_BASE}/search?${scrapeParams}`;
            const headers: Record<string, string> = {
              Accept: "text/html,application/xhtml+xml,*/*",
              "Accept-Language": "en-US,en;q=0.9",
              "User-Agent": UA,
            };
            if (apiKey) headers["X-Weasyl-API-Key"] = apiKey;

            const resp = await fetch(scrapeUrl, { headers });
            if (!resp.ok) {
              sendJson(res, resp.status, { ok: false, message: `Weasyl search returned ${resp.status}` });
              return;
            }
            const html = await resp.text();
            const result = parseWeasylSearchHtml(html);
            sendJson(res, 200, result);
            return;
          }

          // Unknown /api/weasyl/* path
          sendJson(res, 404, { ok: false, message: "not found" });
        } catch (err) {
          sendJson(res, 502, { ok: false, message: String(err) });
        }
      });
    },
  };
}
