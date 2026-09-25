/**
 * Vite-dev Badpups proxy (mirrors serve.py):
 *   GET /api/badpups/html?path=
 */
import type { Plugin } from "vite";
import type { ServerResponse } from "node:http";
import https from "node:https";
import { URL } from "node:url";

const ORIGIN = "https://badpups.com";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 PawDeck-badpups-proxy/1.0";

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "private, max-age=60");
  res.end(JSON.stringify(data));
}

function httpsGet(href: string): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const u = new URL(href);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          Referer: ORIGIN + "/",
        },
      },
      (resp) => {
        const chunks: Buffer[] = [];
        resp.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        resp.on("end", () =>
          resolve({ status: resp.statusCode || 502, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function sanitizePath(raw: string): string | null {
  let path = raw || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.includes("://") || path.includes("..")) return null;
  return path;
}

export function badpupsProxy(): Plugin {
  return {
    name: "badpups-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/badpups")) {
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
          if (u.pathname !== "/api/badpups/html") {
            sendJson(res, 404, { ok: false, message: "not found" });
            return;
          }
          const path = sanitizePath(u.searchParams.get("path") || "/");
          if (!path) {
            sendJson(res, 400, { ok: false, message: "bad path" });
            return;
          }
          const upstream = await httpsGet(ORIGIN + path);
          if (upstream.status >= 400) {
            sendJson(res, upstream.status, {
              ok: false,
              message: `upstream ${upstream.status}`,
            });
            return;
          }
          sendJson(res, 200, { html: upstream.body.toString("utf8") });
        } catch (err) {
          sendJson(res, 502, { ok: false, message: String(err) });
        }
      });
    },
  };
}
