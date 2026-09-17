/**
 * Vite-dev Flayrah proxy matching serve.py GET /api/flayrah/rss.
 */
import type { Plugin } from "vite";
import type { ServerResponse } from "node:http";

const FLAYRAH_RSS = "https://www.flayrah.com/rss-full.xml";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 m-e621-flayrah-proxy/1.0";

function send(
  res: ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, max-age=120");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  send(res, status, Buffer.from(JSON.stringify(data)), "application/json");
}

export function flayrahProxy(): Plugin {
  return {
    name: "flayrah-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || "").split("?")[0];
        if (urlPath !== "/api/flayrah/rss") {
          next();
          return;
        }
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
          res.end();
          return;
        }
        if (req.method !== "GET") {
          sendJson(res, 405, { ok: false, message: "method not allowed" });
          return;
        }
        try {
          const resp = await fetch(FLAYRAH_RSS, {
            headers: {
              Accept: "application/rss+xml, application/xml, text/xml, */*",
              "User-Agent": UA,
            },
          });
          const body = Buffer.from(await resp.arrayBuffer());
          const contentType =
            resp.headers.get("content-type") || "application/rss+xml";
          send(res, resp.status, body, contentType);
        } catch (err) {
          sendJson(res, 502, {
            ok: false,
            message: `flayrah rss failed: ${err}`,
          });
        }
      });
    },
  };
}
