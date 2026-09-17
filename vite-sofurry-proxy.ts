/**
 * Vite-dev SoFurry proxy matching serve.py /api/sofurry/*.
 * Forwards session cookies from `X-Sofurry-Cookies` (or pasted cookie login).
 */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

const SOFURRY_BASE = "https://sofurry.com";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36 me621-sofurry-proxy/1.0";
const COOKIE_HEADER = "x-sofurry-cookies";

const MEDIA_HOSTS = new Set([
  "cdn.sofurryfiles.com",
  "s3.sofurryfiles.com",
  "sofurryfiles.com",
]);

function sendJson(res: ServerResponse, status: number, data: unknown, extra?: Record<string, string>): void {
  const body = Buffer.from(JSON.stringify(data));
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (extra) {
    for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  }
  res.end(body);
}

function sendBuffer(
  res: ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
  extra?: Record<string, string>,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (extra) {
    for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  }
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

function cookiesFromReq(req: IncomingMessage): string {
  const h = req.headers[COOKIE_HEADER];
  const raw = Array.isArray(h) ? h[0] : h;
  return raw ? String(raw).trim() : "";
}

function mergeSetCookies(existing: string, headers: Headers): string {
  const map = new Map<string, string>();
  for (const part of existing.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  const lines =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : (() => {
          const single = headers.get("set-cookie");
          return single ? [single] : [];
        })();
  for (const line of lines) {
    const first = (line.split(";")[0] || "").trim();
    const i = first.indexOf("=");
    if (i > 0) map.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function upstreamHeaders(
  cookie: string,
  accept: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const h: Record<string, string> = {
    Accept: accept,
    "User-Agent": UA,
    Referer: `${SOFURRY_BASE}/`,
    Origin: SOFURRY_BASE,
    ...extra,
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

function csrfFromCookie(cookie: string): string {
  const session = /(?:^|;\s*)_session=([^;]+)/i.exec(cookie);
  if (session?.[1]) {
    try {
      const raw = decodeURIComponent(session[1]);
      const payload = raw.split(".", 1)[0] || "";
      const pad = "=".repeat((4 - (payload.length % 4)) % 4);
      const data = JSON.parse(Buffer.from(payload + pad, "base64url").toString("utf8")) as {
        csrfToken?: string;
        csrf_token?: string;
      };
      const token = data.csrfToken || data.csrf_token || "";
      if (token) return token;
    } catch {
      /* fall through to Laravel XSRF */
    }
  }
  const m = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/i.exec(cookie);
  if (!m?.[1]) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

async function sofurryRequest(
  url: string,
  opts: {
    method?: string;
    cookie?: string;
    body?: Buffer | string | null;
    contentType?: string;
    accept?: string;
    extraHeaders?: Record<string, string>;
  } = {},
): Promise<{ body: Buffer; status: number; contentType: string; headers: Headers }> {
  const headers = upstreamHeaders(
    opts.cookie || "",
    opts.accept || "application/json, text/html;q=0.9,*/*;q=0.8",
    opts.extraHeaders || {},
  );
  if (opts.body != null && opts.contentType) {
    headers["Content-Type"] = opts.contentType;
  }
  const csrf = csrfFromCookie(opts.cookie || "");
  if (csrf && !headers["X-CSRF-Token"] && !headers["X-CSRF-TOKEN"]) {
    headers["X-CSRF-Token"] = csrf;
    headers["X-CSRF-TOKEN"] = csrf;
    if (/xsrf-token=/i.test(opts.cookie || "")) {
      headers["X-XSRF-TOKEN"] = csrf;
    }
  }
  try {
    const resp = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body == null ? undefined : opts.body,
      redirect: "manual",
    });
    // Follow one hop if needed (www ↔ apex)
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (loc) {
        const next = new URL(loc, url).toString();
        const cookie2 = mergeSetCookies(opts.cookie || "", resp.headers);
        return sofurryRequest(next, { ...opts, cookie: cookie2 });
      }
    }
    const body = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get("content-type") || "application/octet-stream";
    return { body, status: resp.status, contentType, headers: resp.headers };
  } catch (err) {
    const body = Buffer.from(JSON.stringify({ detail: String(err) }));
    return {
      body,
      status: 502,
      contentType: "application/json",
      headers: new Headers(),
    };
  }
}

async function loginWithPassword(
  email: string,
  password: string,
): Promise<{ ok: boolean; cookies?: string; username?: string; error?: string }> {
  // 1) GET login page for CSRF + XSRF cookie
  const page = await sofurryRequest(`${SOFURRY_BASE}/login`, {
    accept: "text/html",
  });
  let cookie = mergeSetCookies("", page.headers);
  const html = page.body.toString("utf8");
  const tokenMatch =
    /name="_token"\s+value="([^"]+)"/.exec(html) ||
    /name="csrf-token"\s+content="([^"]+)"/.exec(html);
  const token = tokenMatch?.[1] || csrfFromCookie(cookie);
  if (!token) {
    return { ok: false, error: "Could not obtain CSRF token from SoFurry login page" };
  }

  const form = new URLSearchParams();
  form.set("_token", token);
  form.set("email", email);
  form.set("password", password);
  form.set("remember", "on");

  const post = await sofurryRequest(`${SOFURRY_BASE}/login`, {
    method: "POST",
    cookie,
    body: form.toString(),
    contentType: "application/x-www-form-urlencoded",
    accept: "text/html, application/xhtml+xml",
    extraHeaders: {
      "X-CSRF-TOKEN": token,
      "X-CSRF-Token": token,
    },
  });
  cookie = mergeSetCookies(cookie, post.headers);

  // Success usually redirects away from /login with a session cookie.
  const hasSession = /(?:^|;\s*)(?:laravel_session|sofurry_session|_session)=/i.test(cookie);
  if (!hasSession && post.status === 200 && /name="password"/.test(post.body.toString("utf8"))) {
    return { ok: false, error: "Login failed — check email/password" };
  }

  // Resolve username via /api/profile
  const profile = await sofurryRequest(`${SOFURRY_BASE}/api/profile`, {
    cookie,
    accept: "application/json",
  });
  cookie = mergeSetCookies(cookie, profile.headers);
  if (profile.status === 401 || profile.status === 403) {
    return { ok: false, error: "Login did not establish a usable session" };
  }
  let username: string | undefined;
  try {
    const data = JSON.parse(profile.body.toString("utf8")) as {
      user?: { name?: string };
    };
    username = data.user?.name;
  } catch {
    /* ignore */
  }
  return { ok: true, cookies: cookie, username };
}

function isAllowedMediaUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (MEDIA_HOSTS.has(host) || host.endsWith(".sofurryfiles.com")) return true;
    if (host === "sofurry.com" || host === "www.sofurry.com") return true;
    return false;
  } catch {
    return false;
  }
}

export function sofurryProxy(): Plugin {
  return {
    name: "sofurry-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || "").split("?")[0] || "";
        if (!urlPath.startsWith("/api/sofurry/")) {
          next();
          return;
        }

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Sofurry-Cookies",
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
        const cookie = cookiesFromReq(req);

        try {
          // POST /api/sofurry/login  { email, password }
          if (urlPath === "/api/sofurry/login" && req.method === "POST") {
            const raw = await readBody(req);
            let email = "";
            let password = "";
            try {
              const j = JSON.parse(raw.toString("utf8")) as {
                email?: string;
                password?: string;
              };
              email = String(j.email || "").trim();
              password = String(j.password || "");
            } catch {
              sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
              return;
            }
            if (!email || !password) {
              sendJson(res, 400, { ok: false, error: "email and password required" });
              return;
            }
            const result = await loginWithPassword(email, password);
            sendJson(res, result.ok ? 200 : 401, result);
            return;
          }

          // POST /api/sofurry/login-cookies  { cookies }
          if (urlPath === "/api/sofurry/login-cookies" && req.method === "POST") {
            const raw = await readBody(req);
            let cookies = "";
            try {
              const j = JSON.parse(raw.toString("utf8")) as { cookies?: string };
              cookies = String(j.cookies || "").trim();
            } catch {
              sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
              return;
            }
            if (!cookies) {
              sendJson(res, 400, { ok: false, error: "cookies required" });
              return;
            }
            const profile = await sofurryRequest(`${SOFURRY_BASE}/api/profile`, {
              cookie: cookies,
              accept: "application/json",
            });
            if (profile.status === 401 || profile.status === 403) {
              sendJson(res, 401, { ok: false, error: "Cookies rejected by SoFurry" });
              return;
            }
            let username: string | undefined;
            try {
              const data = JSON.parse(profile.body.toString("utf8")) as {
                user?: { name?: string };
              };
              username = data.user?.name;
            } catch {
              /* ignore */
            }
            sendJson(res, 200, {
              ok: true,
              cookies: mergeSetCookies(cookies, profile.headers),
              username,
            });
            return;
          }

          // GET /api/sofurry/media-url?url=
          if (urlPath === "/api/sofurry/media-url" && req.method === "GET") {
            const target = params.get("url") || "";
            if (!isAllowedMediaUrl(target)) {
              sendJson(res, 400, { ok: false, error: "URL host not allowed" });
              return;
            }
            const { body, status, contentType } = await sofurryRequest(target, {
              cookie,
              accept: "*/*",
            });
            sendBuffer(res, status, body, contentType);
            return;
          }

          // GET /api/sofurry/media/*
          if (urlPath.startsWith("/api/sofurry/media/") && req.method === "GET") {
            const rel = urlPath.slice("/api/sofurry/media".length);
            // Prefer CDN for submission assets
            const candidates = [
              `https://cdn.sofurryfiles.com${rel}`,
              `https://s3.sofurryfiles.com${rel}`,
              `${SOFURRY_BASE}${rel}`,
            ];
            let lastStatus = 404;
            let lastBody: Buffer = Buffer.from("not found");
            let lastCt = "text/plain";
            for (const target of candidates) {
              const { body, status, contentType } = await sofurryRequest(target, {
                cookie,
                accept: "*/*",
              });
              if (status >= 200 && status < 300) {
                sendBuffer(res, status, body, contentType);
                return;
              }
              lastStatus = status;
              lastBody = Buffer.from(body);
              lastCt = contentType;
            }
            sendBuffer(res, lastStatus, lastBody, lastCt);
            return;
          }

          // Catch-all reverse proxy: /api/sofurry/<path> → https://sofurry.com/<path>
          const upstreamPath = urlPath.slice("/api/sofurry".length) || "/";
          if (!upstreamPath.startsWith("/")) {
            sendJson(res, 404, { ok: false, message: "not found" });
            return;
          }
          // Block proto-smuggling
          if (upstreamPath.includes("://") || upstreamPath.includes("..")) {
            sendJson(res, 400, { ok: false, message: "bad path" });
            return;
          }

          const method = req.method || "GET";
          let bodyBuf =
            method === "GET" || method === "HEAD" ? null : await readBody(req);
          const accept =
            upstreamPath.endsWith(".data") || upstreamPath.includes(".data?")
              ? "application/json, text/x-script, */*"
              : "application/json, text/html;q=0.8,*/*;q=0.5";
          const extra: Record<string, string> = {};
          if (upstreamPath.endsWith(".data") || req.headers["x-inertia"]) {
            extra["X-Inertia"] = "true";
            extra["X-Requested-With"] = "XMLHttpRequest";
          }
          // Soft Remix APIs need a fresh `_session` CSRF cookie before mutating.
          let upstreamCookie = cookie;
          if (method !== "GET" && method !== "HEAD" && upstreamCookie) {
            const refresh = await sofurryRequest(`${SOFURRY_BASE}/`, {
              cookie: upstreamCookie,
              accept: "text/html,application/xhtml+xml",
            });
            upstreamCookie = mergeSetCookies(upstreamCookie, refresh.headers);
          }
          const ct = req.headers["content-type"];
          const { body, status, contentType, headers } = await sofurryRequest(
            `${SOFURRY_BASE}${upstreamPath}${qs ? `?${qs}` : ""}`,
            {
              method,
              cookie: upstreamCookie,
              body: bodyBuf,
              contentType: typeof ct === "string" ? ct : undefined,
              accept,
              extraHeaders: extra,
            },
          );
          const rejected =
            cookie && status === 401
              ? { "X-Sofurry-Session-Rejected": "1" }
              : undefined;
          void headers;
          sendBuffer(res, status, body, contentType, rejected);
        } catch (err) {
          sendJson(res, 502, { ok: false, message: String(err) });
        }
      });
    },
  };
}
