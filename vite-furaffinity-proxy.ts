/**
 * Vite-dev FurAffinity proxy matching serve.py /api/furaffinity/*.
 * Production uses fa_proxy.py + faapi; this scrape is for npm run dev.
 * HTML parsers live in src/worker/furaffinity/htmlParse.ts (contract-tested).
 */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  FA_ROOT,
  decodeHtml,
  parseFaTimestamp,
  parseFigures,
  parseJournals,
  parseLoggedIn,
  parseSubmission,
  stripTags,
  tidyText,
} from "./src/worker/furaffinity/htmlParse";

const UA = "faapi/3.12.7 m-e621-furaffinity-proxy";
const DELAY_MS = 1100;

let lastGet = 0;
let chain: Promise<void> = Promise.resolve();

const runSerialized = async <T>(fn: () => Promise<T>): Promise<T> => {
  const prev = chain;
  let release!: () => void;
  chain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  const wait = DELAY_MS - (Date.now() - lastGet);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  try {
    lastGet = Date.now();
    return await fn();
  } finally {
    release();
  }
};

type Cookie = { name: string; value: string };

const parseCookieString = (raw?: string | null): Cookie[] => {
  if (!raw) return [];
  const out: Cookie[] = [];
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.includes("=")) continue;
    const [name, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim();
    if (name?.trim() && value) out.push({ name: name.trim(), value });
  }
  return out;
};

const cookieHeader = (cookies: Cookie[]) =>
  cookies.map((c) => `${c.name}=${c.value}`).join("; ");

const envCookies = (): Cookie[] => {
  const cookies: Cookie[] = [];
  const a = process.env.FA_COOKIE_A?.trim();
  const b = process.env.FA_COOKIE_B?.trim();
  if (a) cookies.push({ name: "a", value: a });
  if (b) cookies.push({ name: "b", value: b });
  return cookies;
};

let guestCookies: Cookie[] | null = null;

const setCookies = (headers: Headers): string[] => {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
};

const json = (res: ServerResponse, status: number, payload: unknown) => {
  const body = Buffer.from(JSON.stringify(payload));
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", String(body.length));
  res.end(body);
};

const readBody = async (req: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
};

const faRequestUrl = (pathOrUrl: string): string => {
  const raw = (pathOrUrl || "").trim();
  if (!raw) throw new Error("empty FA request path");
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host !== "furaffinity.net" && host !== "www.furaffinity.net") {
      throw new Error("FurAffinity request target not allowed");
    }
    return `${FA_ROOT}${parsed.pathname}${parsed.search}`;
  }
  return `${FA_ROOT}/${raw.replace(/^\//, "")}`;
};

const faFetch = async (
  path: string,
  cookies: Cookie[],
  init: RequestInit = {},
): Promise<Response> => {
  const url = faRequestUrl(path);
  const headers = new Headers(init.headers);
  headers.set("User-Agent", UA);
  if (cookies.length) headers.set("Cookie", cookieHeader(cookies));
  return fetch(url, { ...init, headers });
};

const guestSession = async (): Promise<Cookie[]> => {
  if (guestCookies?.length) return guestCookies;
  const remote = await faFetch("/", [], { redirect: "follow" });
  const set = setCookies(remote.headers);
  const cookies: Cookie[] = [];
  for (const line of set) {
    const first = line.split(";")[0];
    const [name, ...rest] = first.split("=");
    const value = rest.join("=");
    if (name === "a" || name === "b") cookies.push({ name, value });
  }
  if (!cookies.length) throw new Error("Could not establish a guest FurAffinity session");
  guestCookies = cookies;
  return cookies;
};

const resolveCookiesWithSource = async (
  payload: Record<string, unknown>,
): Promise<{ cookies: Cookie[]; source: "profile" | "env" | "guest" }> => {
  const fromBody = parseCookieString(typeof payload.cookies === "string" ? payload.cookies : "");
  if (fromBody.length) return { cookies: fromBody, source: "profile" };
  const env = envCookies();
  if (env.length) return { cookies: env, source: "env" };
  return { cookies: await guestSession(), source: "guest" };
};

const parseWatchlist = (html: string) => {
  const results: Array<{ name: string; status: string }> = [];
  const re = /class="watch-list-items"[\s\S]*?href="\/user\/([^"/]+)\/?"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    results.push({ name: match[1], status: "" });
  }
  return results;
};

async function handleAction(action: string, payload: Record<string, unknown>) {
  if (action === "login") {
    const username = String(payload.username || "");
    const password = String(payload.password || "");
    if (!username || !password) {
      return { status: 400, body: { ok: false, message: "username and password required" } };
    }
    const jar: Cookie[] = [];
    const loginPage = await faFetch("login/", jar);
    for (const line of setCookies(loginPage.headers)) {
      const first = line.split(";")[0];
      const [name, ...rest] = first.split("=");
      if (name === "a" || name === "b") jar.push({ name, value: rest.join("=") });
    }
    const form = new URLSearchParams({
      action: "login",
      name: username,
      pass: password,
      retard_protection: "1",
    });
    const posted = await faFetch("login/", jar, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      redirect: "follow",
    });
    for (const line of setCookies(posted.headers)) {
      const first = line.split(";")[0];
      const [name, ...rest] = first.split("=");
      if (name === "a" || name === "b") {
        const idx = jar.findIndex((c) => c.name === name);
        const cookie = { name, value: rest.join("=") };
        if (idx >= 0) jar[idx] = cookie;
        else jar.push(cookie);
      }
    }
    if (!jar.some((c) => c.name === "b")) {
      return { status: 401, body: { ok: false, message: "FurAffinity login failed (check username/password)" } };
    }
    const home = await faFetch("/", jar);
    const meName = parseLoggedIn(await home.text()) || username;
    return {
      status: 200,
      body: { username: meName, cookies: cookieHeader(jar).replace(/; /g, ";") },
    };
  }

  const { cookies, source: cookieSource } = await resolveCookiesWithSource(payload);

  if (action === "me") {
    const html = await (await faFetch("/", cookies)).text();
    const username = parseLoggedIn(html);
    if (!username) return { status: 401, body: { ok: false, message: "Not logged in to FurAffinity" } };
    return {
      status: 200,
      body: {
        username,
        env: envCookies().length > 0,
        cookieSource,
      },
    };
  }

  if (action === "browse" || action === "frontpage") {
    const page = Math.max(1, Number(payload.page) || 1);
    const html = await (await faFetch(action === "frontpage" ? "/" : `browse/${page}/`, cookies)).text();
    const parsed = parseFigures(html);
    return {
      status: 200,
      body: { results: parsed.results, next: parsed.hasNext ? page + 1 : null, page },
    };
  }

  // Logged-in watchstream (new submissions from watched artists).
  if (action === "submissions") {
    const page = Math.max(1, Number(payload.page) || 1);
    const path = page <= 1 ? "msg/submissions/" : `msg/submissions/${page}/`;
    const html = await (await faFetch(path, cookies)).text();
    if (/just a moment/i.test(html) || /cf-browser-verification/i.test(html)) {
      return { status: 503, body: { ok: false, message: "FurAffinity Cloudflare challenge" } };
    }
    if (/log\s*in/i.test(html) && !parseLoggedIn(html)) {
      return { status: 401, body: { ok: false, message: "Log in to FurAffinity to view your following feed" } };
    }
    const parsed = parseFigures(html);
    return {
      status: 200,
      body: { results: parsed.results, next: parsed.hasNext ? page + 1 : null, page },
    };
  }

  if (action === "search") {
    const page = Math.max(1, Number(payload.page) || 1);
    const form = new URLSearchParams();
    form.set("q", String(payload.q || ""));
    form.set("page", String(page));
    form.set("perpage", "72");
    form.set("order-by", String(payload.order_by || "date"));
    form.set("order-direction", String(payload.order_direction || "desc"));
    form.set("range", "all");
    form.set("mode", "extended");
    form.set("do_search", "Search");
    const ratings = Array.isArray(payload.ratings) ? payload.ratings : ["general", "mature", "adult"];
    for (const rating of ratings) form.set(`rating-${rating}`, "on");
    const types = Array.isArray(payload.types) && payload.types.length
      ? payload.types.map((t: unknown) => String(t).toLowerCase())
      : ["art", "music", "flash", "story", "photo", "poetry"];
    for (const kind of types) form.set(`type-${kind}`, "on");
    const html = await (
      await faFetch("search/", cookies, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      })
    ).text();
    const parsed = parseFigures(html);
    return {
      status: 200,
      body: { results: parsed.results, next: parsed.hasNext ? page + 1 : null, page },
    };
  }

  if (action === "gallery" || action === "scraps" || action === "favorites" || action === "journals") {
    const username = String(payload.username || "");
    if (!username) return { status: 400, body: { ok: false, message: "username required" } };
    const page = payload.page ?? 1;
    const path =
      action === "favorites"
        ? `favorites/${encodeURIComponent(username)}/${page === 1 || page === "1" || !page ? "" : page}`
        : `${action}/${encodeURIComponent(username)}/${page || 1}/`;
    const html = await (await faFetch(path, cookies)).text();
    if (action === "journals") {
      const parsed = parseJournals(html);
      return {
        status: 200,
        body: { results: parsed.results, next: parsed.hasNext ? Number(page || 1) + 1 : null, page },
      };
    }
    const parsed = parseFigures(html);
    const next =
      action === "favorites"
        ? (html.match(/action="\/favorites\/[^"]+\/([^"]+)\/next"/)?.[1] ?? null)
        : parsed.hasNext
          ? Number(page || 1) + 1
          : null;
    return { status: 200, body: { results: parsed.results, next, page } };
  }

  if (action === "submission") {
    const id = Number(payload.id || 0);
    if (!id) return { status: 400, body: { ok: false, message: "id required" } };
    const html = await (await faFetch(`view/${id}/`, cookies)).text();
    return { status: 200, body: parseSubmission(html, id) };
  }

  if (action === "journal") {
    const id = Number(payload.id || 0);
    if (!id) return { status: 400, body: { ok: false, message: "id required" } };
    const html = await (await faFetch(`journal/${id}/`, cookies)).text();
    const title = /<h3[^>]*>([^<]+)<\/h3>/.exec(html)?.[1] || "";
    const content =
      /class="[^"]*journal-content[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ||
      /class="[^"]*journal-body[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ||
      "";
    const author = /href="\/user\/([^"/]+)\/?"/.exec(html)?.[1] || "";
    const commentsN = Number(
      /Comments[\s\S]{0,80}?>(\d[\d,]*)/.exec(html)?.[1]?.replace(/,/g, "") || 0,
    );
    const comments: Array<Record<string, unknown>> = [];
    const cre =
      /id="cid:(\d+)"[\s\S]*?class="[^"]*comment_username[^"]*"[^>]*>([^<]+)[\s\S]*?class="[^"]*comment_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cre.exec(html))) {
      comments.push({
        id: Number(cm[1]),
        created_at: parseFaTimestamp(cm[0]),
        post_id: id,
        creator_id: 0,
        body: stripTags(cm[3] || ""),
        score: 0,
        updated_at: parseFaTimestamp(cm[0]),
        updater_id: 0,
        do_not_bump_post: false,
        is_hidden: false,
        is_sticky: false,
        creator_name: decodeHtml(cm[2] || ""),
        updater_name: decodeHtml(cm[2] || ""),
      });
    }
    return {
      status: 200,
      body: {
        id,
        title: tidyText(decodeHtml(title)),
        author: { name: decodeHtml(author) },
        rating: "general",
        type: "text",
        thumbnail_url: "",
        kind: "journal",
        date: parseFaTimestamp(html),
        description: stripTags(content),
        comment_count: commentsN || comments.length,
        comments,
        details: true,
      },
    };
  }

  if (action === "watchlist") {
    let username = String(payload.username || "");
    if (!username) {
      const home = await (await faFetch("/", cookies)).text();
      username = parseLoggedIn(home) || "";
    }
    if (!username) return { status: 400, body: { ok: false, message: "username required" } };
    const page = Math.max(1, Number(payload.page) || 1);
    const html = await (await faFetch(`watchlist/by/${encodeURIComponent(username)}?page=${page}`, cookies)).text();
    return { status: 200, body: { results: parseWatchlist(html), next: null } };
  }

  if (action === "favorite" || action === "unfavorite") {
    const id = Number(payload.id || 0);
    if (!id) return { status: 400, body: { ok: false, message: "id required" } };
    const html = await (await faFetch(`view/${id}/`, cookies)).text();
    const sub = parseSubmission(html, id);
    const want = action === "favorite";
    if (sub.favorite === want) return { status: 200, body: { ok: true, favorite: sub.favorite } };
    const link = sub.favorite_toggle_link;
    if (!link) return { status: 401, body: { ok: false, message: "No favorite toggle link (login required?)" } };
    await faFetch(link.replace(FA_ROOT + "/", ""), cookies);
    return { status: 200, body: { ok: true, favorite: want } };
  }

  if (action === "comment") {
    const id = Number(payload.id || 0);
    const body = String(payload.body || "").trim();
    if (!id || !body) return { status: 400, body: { ok: false, message: "id and body required" } };
    const kind = String(payload.kind || "submission").toLowerCase();
    const path = kind === "journal" ? `journal/${id}/` : `view/${id}/`;
    const html = await (await faFetch(path, cookies)).text();
    const formM = /<form[^>]*>([\s\S]*?<textarea[^>]*name=["']reply["'][\s\S]*?)<\/form>/i.exec(html);
    if (!formM) return { status: 502, body: { ok: false, message: "Could not find FurAffinity comment form" } };
    const data = new URLSearchParams();
    const hidden = formM[1].matchAll(/<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi);
    for (const h of hidden) data.set(h[1], h[2]);
    data.set("reply", body);
    const actionUrl =
      /<form[^>]*action=["']([^"']+)["']/i.exec(formM[0])?.[1] || path;
    await faFetch(actionUrl.replace(/^https?:\/\/[^/]+\//i, ""), cookies, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: data.toString(),
    });
    return { status: 200, body: { ok: true } };
  }

  return { status: 404, body: { ok: false, message: "not found" } };
}

export function furaffinityProxy(): Plugin {
  return {
    name: "furaffinity-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || "").split("?")[0];
        if (!urlPath.startsWith("/api/furaffinity/")) {
          next();
          return;
        }
        if (req.method !== "POST") {
          json(res, 405, { ok: false, message: "method not allowed" });
          return;
        }
        const action = urlPath.slice("/api/furaffinity/".length).replace(/\/$/, "");
        try {
          const raw = await readBody(req);
          const payload = JSON.parse(raw.toString("utf8") || "{}") as Record<string, unknown>;
          const result = await runSerialized(() => handleAction(action, payload));
          json(res, result.status, result.body);
        } catch (err) {
          json(res, 502, { ok: false, message: String(err) });
        }
      });
    },
  };
}
