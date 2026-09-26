/**
 * Vite-dev u18chan proxy:
 *   GET  /api/u18chan/catalog?board=ifur
 *   GET  /api/u18chan/thread?board=fur&id=123&index=ifur
 *   GET  /api/u18chan/media?url=https://u18chan.com/uploads/...
 *   POST /api/u18chan/post  JSON body → multipart upstream
 *
 * Cub boards (/icub/, /cub/) are hard-blocked.
 */
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  U18CHAN_BASE,
  U18CHAN_INDICES,
  isBlockedU18chanBoard,
  u18chanIndexBySlug,
} from "./src/misc/util/u18chanBoards";
import {
  parseCatalog,
  parseThread,
} from "./src/worker/u18chan/htmlParse";

const UA = "me621-u18chan-proxy/1.0";
const ALLOWED_LIVE = new Set(U18CHAN_INDICES.map((b) => b.live));
const ALLOWED_INDEX = new Set(U18CHAN_INDICES.map((b) => b.index));

function json(
  res: ServerResponse,
  status: number,
  payload: unknown,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(payload));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function assertBoardAllowed(board: string): void {
  const b = board.toLowerCase();
  if (isBlockedU18chanBoard(b)) {
    throw new Error("board not allowed");
  }
  if (!ALLOWED_INDEX.has(b as never) && !ALLOWED_LIVE.has(b)) {
    throw new Error(`unknown board: ${board}`);
  }
}

async function fetchUpstream(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/json,*/*",
      Referer: `${U18CHAN_BASE}/`,
      ...(init?.headers || {}),
    },
  });
}

function corsOptions(res: ServerResponse): void {
  res.statusCode = 204;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Accept, Content-Type",
  );
  res.end();
}

async function handleMedia(
  urlParam: string,
  res: ServerResponse,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlParam);
  } catch {
    json(res, 400, { error: "bad media url" });
    return;
  }
  if (!parsed.hostname.endsWith("u18chan.com")) {
    json(res, 400, { error: "host not allowed" });
    return;
  }
  if (parsed.pathname.includes("/cub/") || parsed.pathname.includes("/icub/")) {
    json(res, 403, { error: "board not allowed" });
    return;
  }
  const remote = await fetchUpstream(parsed.href);
  if (!remote.ok) {
    json(res, remote.status, { error: `upstream ${remote.status}` });
    return;
  }
  const buf = Buffer.from(await remote.arrayBuffer());
  res.statusCode = 200;
  res.setHeader(
    "Content-Type",
    remote.headers.get("content-type") || "application/octet-stream",
  );
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(buf);
}

async function handlePost(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: {
    liveBoard?: string;
    topicId?: number;
    name?: string;
    email?: string;
    subject?: string;
    comment?: string;
    password?: string;
    spoiler?: boolean;
    fileName?: string;
    fileBase64?: string;
    fileMime?: string;
  };
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    json(res, 400, { error: "invalid JSON" });
    return;
  }
  const liveBoard = (body.liveBoard || "").toLowerCase();
  assertBoardAllowed(liveBoard);
  if (!ALLOWED_LIVE.has(liveBoard)) {
    json(res, 400, { error: "posting only allowed on live boards" });
    return;
  }
  const topicId = body.topicId && body.topicId > 0 ? body.topicId : 0;
  const boundary = `----me621u18${Date.now().toString(16)}`;
  const parts: Buffer[] = [];
  const addField = (name: string, value: string) => {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  };
  addField("topicid", String(topicId));
  addField("editid", "0");
  addField("st", "");
  addField("name", body.name || "");
  addField("email", body.email || "");
  addField("subject", body.subject || "");
  addField("comment", body.comment || "");
  addField("password", body.password || "password");
  if (body.spoiler) addField("isSpoiler", "on");
  if (body.fileBase64 && body.fileName) {
    const b64 = body.fileBase64.replace(/^data:[^;]+;base64,/, "");
    const fileBuf = Buffer.from(b64, "base64");
    const mime = body.fileMime || "application/octet-stream";
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file1"; filename="${body.fileName}"\r\nContent-Type: ${mime}\r\n\r\n`,
      ),
    );
    parts.push(fileBuf);
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const payload = Buffer.concat(parts);
  const postUrl = `${U18CHAN_BASE}/board/u18chan/${liveBoard}/post/`;
  const remote = await fetchUpstream(postUrl, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(payload.length),
    },
    body: payload,
    redirect: "manual",
  });
  const loc = remote.headers.get("location") || undefined;
  if (remote.status >= 300 && remote.status < 400) {
    json(res, 200, { ok: true, redirect: loc });
    return;
  }
  const text = await remote.text();
  if (!remote.ok) {
    const snippet = stripTags(text).slice(0, 200);
    json(res, 502, {
      ok: false,
      error: snippet || `upstream post ${remote.status}`,
    });
    return;
  }
  json(res, 200, { ok: true, redirect: loc });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/u18chan")) return false;
  if (req.method === "OPTIONS") {
    corsOptions(res);
    return true;
  }
  try {
    if (url.pathname === "/api/u18chan/catalog" && req.method === "GET") {
      const board = (url.searchParams.get("board") || "").toLowerCase();
      assertBoardAllowed(board);
      if (!u18chanIndexBySlug(board)) {
        json(res, 400, { error: "not an index board" });
        return true;
      }
      const remote = await fetchUpstream(`${U18CHAN_BASE}/${board}/`);
      if (!remote.ok) {
        json(res, 502, { error: `upstream ${remote.status}` });
        return true;
      }
      const html = await remote.text();
      json(res, 200, { threads: parseCatalog(html) });
      return true;
    }
    if (url.pathname === "/api/u18chan/thread" && req.method === "GET") {
      const board = (url.searchParams.get("board") || "").toLowerCase();
      const id = Number(url.searchParams.get("id") || "0");
      const index = (url.searchParams.get("index") || board).toLowerCase();
      assertBoardAllowed(board);
      if (isBlockedU18chanBoard(board) || !id) {
        json(res, 400, { error: "bad thread request" });
        return true;
      }
      const remote = await fetchUpstream(
        `${U18CHAN_BASE}/${board}/topic/${id}`,
      );
      if (!remote.ok) {
        json(res, 502, { error: `upstream ${remote.status}` });
        return true;
      }
      const html = await remote.text();
      json(res, 200, parseThread(html, board, id, index));
      return true;
    }
    if (url.pathname === "/api/u18chan/media" && req.method === "GET") {
      const mediaUrl = url.searchParams.get("url") || "";
      await handleMedia(mediaUrl, res);
      return true;
    }
    if (url.pathname === "/api/u18chan/post" && req.method === "POST") {
      await handlePost(req, res);
      return true;
    }
    json(res, 404, { error: "not found" });
    return true;
  } catch (e) {
    json(res, 500, {
      error: e instanceof Error ? e.message : "u18chan proxy error",
    });
    return true;
  }
}

export function u18chanProxy(): Plugin {
  return {
    name: "u18chan-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/u18chan")) return next();
        const host = req.headers.host || "localhost";
        const url = new URL(req.url, `http://${host}`);
        void handle(req, res, url).then((handled) => {
          if (!handled) next();
        });
      });
    },
  };
}
