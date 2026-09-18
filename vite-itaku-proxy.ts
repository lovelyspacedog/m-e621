/**
 * Vite-dev Itaku proxy matching serve.py /api/itaku/*.
 * Forwards Authorization: Token from `key` query param.
 */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

const ITAKU_API_BASE = "https://itaku.ee/api";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 me621-itaku-proxy/1.0";

function sendJson(res: ServerResponse, status: number, data: unknown): void {
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
  contentType: string,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType || "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function itakuRequest(
  url: string,
  opts: {
    method?: string;
    apiKey?: string | null;
    body?: Buffer | null;
  } = {},
): Promise<{ body: Buffer; status: number; contentType: string }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": UA,
  };
  if (opts.apiKey) {
    headers.Authorization = `Token ${opts.apiKey}`;
  }
  if (opts.body && opts.body.length) {
    headers["Content-Type"] = "application/json";
  }
  try {
    const method = opts.method || "GET";
    const resp = await fetch(url, {
      method,
      headers,
      ...(method !== "GET" &&
      method !== "HEAD" &&
      opts.body &&
      opts.body.length
        ? { body: opts.body }
        : {}),
    });
    const body = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get("content-type") || "application/json";
    return { body, status: resp.status, contentType };
  } catch (err) {
    const body = Buffer.from(JSON.stringify({ detail: String(err) }));
    return { body, status: 502, contentType: "application/json" };
  }
}

function forwardQuery(params: URLSearchParams, drop: Set<string> = new Set(["key"])): string {
  const fwd = new URLSearchParams();
  for (const [k, v] of params.entries()) {
    if (drop.has(k)) continue;
    fwd.append(k, v);
  }
  return fwd.toString();
}

export function itakuProxy(): Plugin {
  return {
    name: "itaku-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || "").split("?")[0];
        if (!urlPath.startsWith("/api/itaku/")) {
          next();
          return;
        }

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type",
          );
          res.setHeader(
            "Access-Control-Allow-Methods",
            "GET, POST, DELETE, OPTIONS",
          );
          res.end();
          return;
        }

        const qs = req.url?.includes("?")
          ? req.url.slice(req.url.indexOf("?") + 1)
          : "";
        const params = new URLSearchParams(qs);
        const apiKey = (params.get("key") || "").trim() || undefined;
        const fwdQs = forwardQuery(params);

        try {
          // GET /api/itaku/auth/user
          if (urlPath === "/api/itaku/auth/user" && req.method === "GET") {
            if (!apiKey) {
              sendJson(res, 401, { detail: "Authentication credentials were not provided." });
              return;
            }
            const { body, status, contentType } = await itakuRequest(
              `${ITAKU_API_BASE}/auth/user/`,
              { apiKey },
            );
            sendBuffer(res, status, body, contentType);
            return;
          }

          // GET /api/itaku/feed
          if (urlPath === "/api/itaku/feed" && req.method === "GET") {
            const url = `${ITAKU_API_BASE}/feed/${fwdQs ? `?${fwdQs}` : ""}`;
            const { body, status, contentType } = await itakuRequest(url, { apiKey });
            sendBuffer(res, status, body, contentType);
            return;
          }

          // GET /api/itaku/stars → user_starred_imgs
          if (urlPath === "/api/itaku/stars" && req.method === "GET") {
            const url = `${ITAKU_API_BASE}/galleries/images/user_starred_imgs/${fwdQs ? `?${fwdQs}` : ""}`;
            const { body, status, contentType } = await itakuRequest(url, { apiKey });
            sendBuffer(res, status, body, contentType);
            return;
          }

          // GET /api/itaku/tags
          if (urlPath === "/api/itaku/tags" && req.method === "GET") {
            const url = `${ITAKU_API_BASE}/tags/${fwdQs ? `?${fwdQs}` : ""}`;
            const { body, status, contentType } = await itakuRequest(url, { apiKey });
            sendBuffer(res, status, body, contentType);
            return;
          }

          // GET /api/itaku/users/:username
          const userMatch = /^\/api\/itaku\/users\/([^/]+)$/.exec(urlPath);
          if (userMatch && req.method === "GET") {
            const url = `${ITAKU_API_BASE}/user_profiles/${decodeURIComponent(userMatch[1])}/`;
            const { body, status, contentType } = await itakuRequest(url, { apiKey });
            sendBuffer(res, status, body, contentType);
            return;
          }

          // GET /api/itaku/posts/:id
          const postMatch = /^\/api\/itaku\/posts\/(\d+)$/.exec(urlPath);
          if (postMatch && req.method === "GET") {
            const url = `${ITAKU_API_BASE}/posts/${postMatch[1]}/`;
            const { body, status, contentType } = await itakuRequest(url, { apiKey });
            sendBuffer(res, status, body, contentType);
            return;
          }

          // GET /api/itaku/images/:id/comments
          const commentsMatch = /^\/api\/itaku\/images\/(\d+)\/comments$/.exec(
            urlPath,
          );
          if (commentsMatch && req.method === "GET") {
            const qs = fwdQs ? `?${fwdQs}` : "";
            const { body, status, contentType } = await itakuRequest(
              `${ITAKU_API_BASE}/galleries/images/${commentsMatch[1]}/comments/${qs}`,
              { apiKey },
            );
            sendBuffer(res, status, body, contentType);
            return;
          }

          // POST /api/itaku/images/:id/comment
          const commentMatch = /^\/api\/itaku\/images\/(\d+)\/comment$/.exec(
            urlPath,
          );
          if (commentMatch && req.method === "POST") {
            if (!apiKey) {
              sendJson(res, 401, {
                detail: "Authentication credentials were not provided.",
              });
              return;
            }
            const bodyBuf = await readBody(req);
            const { body, status, contentType } = await itakuRequest(
              `${ITAKU_API_BASE}/galleries/images/${commentMatch[1]}/comment/`,
              { method: "POST", apiKey, body: bodyBuf },
            );
            sendBuffer(res, status, body, contentType);
            return;
          }

          // POST/DELETE /api/itaku/images/:id/like
          const likeMatch = /^\/api\/itaku\/images\/(\d+)\/like$/.exec(urlPath);
          if (likeMatch && (req.method === "POST" || req.method === "DELETE")) {
            if (!apiKey) {
              sendJson(res, 401, { detail: "Authentication credentials were not provided." });
              return;
            }
            const bodyBuf =
              req.method === "POST" ? await readBody(req) : null;
            const { body, status, contentType } = await itakuRequest(
              `${ITAKU_API_BASE}/galleries/images/${likeMatch[1]}/like/`,
              { method: req.method, apiKey, body: bodyBuf },
            );
            sendBuffer(res, status, body, contentType);
            return;
          }

          // GET /api/itaku/images/:id
          const imageMatch = /^\/api\/itaku\/images\/(\d+)$/.exec(urlPath);
          if (imageMatch && req.method === "GET") {
            const url = `${ITAKU_API_BASE}/galleries/images/${imageMatch[1]}/`;
            const { body, status, contentType } = await itakuRequest(url, { apiKey });
            sendBuffer(res, status, body, contentType);
            return;
          }

          // GET /api/itaku/images (list/search)
          if (urlPath === "/api/itaku/images" && req.method === "GET") {
            const url = `${ITAKU_API_BASE}/galleries/images/${fwdQs ? `?${fwdQs}` : ""}`;
            const { body, status, contentType } = await itakuRequest(url, { apiKey });
            sendBuffer(res, status, body, contentType);
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
