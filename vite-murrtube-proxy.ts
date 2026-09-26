/**
 * Vite-dev Murrtube proxy (mirrors serve.py):
 *   GET /api/murrtube/inertia?path=
 *   GET /api/murrtube/media?url=
 */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import { URL } from "node:url";

const ORIGIN = "https://murrtube.net";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 PawDeck-murrtube-proxy/1.0";

let sessionCookie = "";

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "private, max-age=0");
  res.end(JSON.stringify(data));
}

function sendBuffer(
  res: ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.end(body);
}

function mergeSetCookie(existing: string, setCookie: string[] | undefined): string {
  if (!setCookie?.length) return existing;
  const map = new Map<string, string>();
  for (const part of existing.split(";").map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i), part.slice(i + 1));
  }
  for (const line of setCookie) {
    const first = line.split(";")[0] || "";
    const i = first.indexOf("=");
    if (i > 0) map.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function httpsRequest(
  href: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer | null;
  } = {},
): Promise<{ status: number; headers: IncomingMessage["headers"]; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const u = new URL(href);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: opts.method || "GET",
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          ...(opts.headers || {}),
        },
      },
      (resp) => {
        const chunks: Buffer[] = [];
        resp.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        resp.on("end", () =>
          resolve({
            status: resp.statusCode || 502,
            headers: resp.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function takeSetCookie(headers: IncomingMessage["headers"]): string[] {
  const raw = headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

async function ensureAgeUnlocked(): Promise<void> {
  const home = await httpsRequest(ORIGIN + "/", {
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  sessionCookie = mergeSetCookie(sessionCookie, takeSetCookie(home.headers));
  const html = home.body.toString("utf8");
  if (!html.includes("18 or older") && html.includes("data-page=")) return;
  const token = html.match(/name="authenticity_token" value="([^"]+)"/)?.[1];
  if (!token) return;
  const body = Buffer.from(
    `authenticity_token=${encodeURIComponent(token)}`,
  );
  const accept = await httpsRequest(ORIGIN + "/accept_age_check", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: sessionCookie,
      Referer: ORIGIN + "/",
    },
    body,
  });
  // Node does not follow redirects — keep age_check from the 302, then land.
  sessionCookie = mergeSetCookie(sessionCookie, takeSetCookie(accept.headers));
  const loc = accept.headers.location;
  if (accept.status >= 300 && accept.status < 400 && typeof loc === "string") {
    const landUrl = new URL(loc, ORIGIN).href;
    const land = await httpsRequest(landUrl, {
      headers: { Cookie: sessionCookie, Referer: ORIGIN + "/" },
    });
    sessionCookie = mergeSetCookie(sessionCookie, takeSetCookie(land.headers));
  }
}

function extractDataPage(html: string): unknown {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) throw new Error("no data-page");
  const decoded = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return JSON.parse(decoded);
}

function isAllowedMedia(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return h === "storage.murrtube.net" || h.endsWith(".murrtube.net");
  } catch {
    return false;
  }
}

function rewriteM3u8(body: string, playlistUrl: string): string {
  const base = new URL(playlistUrl);
  return body
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return line;
      try {
        const abs = new URL(t, base).href;
        if (!isAllowedMedia(abs)) return line;
        return `/api/murrtube/media?url=${encodeURIComponent(abs)}`;
      } catch {
        return line;
      }
    })
    .join("\n");
}

export function murrtubeProxy(): Plugin {
  return {
    name: "murrtube-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/murrtube")) {
          next();
          return;
        }
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          res.end();
          return;
        }
        try {
          const u = new URL(req.url, "http://127.0.0.1");
          if (u.pathname === "/api/murrtube/inertia") {
            await ensureAgeUnlocked();
            let path = u.searchParams.get("path") || "/";
            if (!path.startsWith("/")) path = `/${path}`;
            if (path.includes("://") || path.includes("..")) {
              sendJson(res, 400, { ok: false, message: "bad path" });
              return;
            }
            const upstream = await httpsRequest(ORIGIN + path, {
              headers: {
                Cookie: sessionCookie,
                Accept: "text/html",
                Referer: ORIGIN + "/",
              },
            });
            sessionCookie = mergeSetCookie(
              sessionCookie,
              takeSetCookie(upstream.headers),
            );
            const html = upstream.body.toString("utf8");
            if (html.includes("18 or older")) {
              await ensureAgeUnlocked();
              const retry = await httpsRequest(ORIGIN + path, {
                headers: { Cookie: sessionCookie, Accept: "text/html" },
              });
              const page = extractDataPage(retry.body.toString("utf8"));
              sendJson(res, 200, page);
              return;
            }
            sendJson(res, 200, extractDataPage(html));
            return;
          }
          if (u.pathname === "/api/murrtube/media") {
            const target = u.searchParams.get("url") || "";
            if (!isAllowedMedia(target)) {
              sendJson(res, 400, { ok: false, message: "host not allowed" });
              return;
            }
            const upstream = await httpsRequest(target, {
              headers: { Referer: ORIGIN + "/" },
            });
            const ct =
              (upstream.headers["content-type"] as string) ||
              "application/octet-stream";
            if (/\.m3u8(\?|$)/i.test(target) || ct.includes("mpegurl")) {
              sendBuffer(
                res,
                upstream.status,
                Buffer.from(rewriteM3u8(upstream.body.toString("utf8"), target)),
                "application/vnd.apple.mpegurl",
              );
              return;
            }
            sendBuffer(res, upstream.status, upstream.body, ct);
            return;
          }
          sendJson(res, 404, { ok: false, message: "not found" });
        } catch (err) {
          sendJson(res, 502, { ok: false, message: String(err) });
        }
      });
    },
  };
}
