import { fileURLToPath, URL } from 'node:url'
import type { ServerResponse } from 'node:http'
import type { Plugin} from 'vite';
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import vuetify from 'vite-plugin-vuetify'
import { execFileSync, execSync } from "child_process";
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs';
import path from 'path';
import dns from 'node:dns';
import { furaffinityProxy } from './vite-furaffinity-proxy'
import { tailspaceProxy } from './vite-tailspace-proxy'
import { weasylProxy } from './vite-weasyl-proxy'
import { itakuProxy } from './vite-itaku-proxy'
import { sofurryProxy } from './vite-sofurry-proxy'

// Furbooru's Cloudflare IPv6 path 520s from some hosts; prefer IPv4.
dns.setDefaultResultOrder('ipv4first');

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Resolve python that can import curl_cffi (venv preferred). */
function furbooruPython(): string {
  const venvPy = path.join(ROOT_DIR, '.venv', 'bin', 'python');
  if (fs.existsSync(venvPy)) return venvPy;
  return 'python3';
}

/**
 * Upstream Furbooru via furbooru_cf.py (curl_cffi + Philomena bot challenge).
 * Plain Node fetch gets HTTP 501 "I'm not a robot" without `_philomena_key`.
 */
function furbooruUpstream(
  url: string,
  init: { method?: string; body?: Buffer | string } = {},
): { status: number; contentType: string; body: Buffer } {
  const script = path.join(ROOT_DIR, 'furbooru_cf.py');
  const payload = JSON.stringify({
    url,
    method: init.method || 'GET',
    body_b64: init.body
      ? Buffer.from(init.body).toString('base64')
      : undefined,
  });
  try {
    const out = execFileSync(furbooruPython(), [script], {
      input: payload,
      maxBuffer: 20 * 1024 * 1024,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out) as {
      status: number;
      content_type: string;
      body_b64: string;
    };
    return {
      status: parsed.status,
      contentType: parsed.content_type || 'application/json',
      body: Buffer.from(parsed.body_b64 || '', 'base64'),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 502,
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({ ok: false, message })),
    };
  }
}

const MEDIA_HOST_OK = (host: string) =>
  ['.e621.net', '.e926.net', '.e6ai.net', '.furaffinity.net', '.facdn.net'].some((s) => host.endsWith(s)) ||
  ['e621.net', 'e926.net', 'e6ai.net', 'inkbunny.net', 'furaffinity.net', 'www.furaffinity.net', 'facdn.net'].includes(host) ||
  host === 'ib.metapix.net' ||
  host.endsWith('.metapix.net') ||
  isWeasylMediaHost(host) ||
  isItakuMediaHost(host) ||
  isSofurryMediaHost(host) ||
  host === 'furrycdn.org' ||
  host.endsWith('.furrycdn.org');

const isInkbunnyMediaHost = (host: string) =>
  host === 'inkbunny.net' || host === 'ib.metapix.net' || host.endsWith('.metapix.net');

const isFurAffinityMediaHost = (host: string) =>
  host === 'furaffinity.net' || host === 'www.furaffinity.net' || host === 'facdn.net' ||
  host.endsWith('.furaffinity.net') || host.endsWith('.facdn.net');

const isWeasylMediaHost = (host: string) =>
  host === 'www.weasyl.com' || host === 'weasyl.com' || host === 'cdn.weasyl.com' || host === 'static.weasyl.com';

const isItakuMediaHost = (host: string) =>
  host === 'itaku.ee' || host === 'www.itaku.ee' || host.endsWith('.itaku.ee');

const isSofurryMediaHost = (host: string) =>
  host === 'sofurry.com' ||
  host === 'www.sofurry.com' ||
  host === 'cdn.sofurryfiles.com' ||
  host === 's3.sofurryfiles.com' ||
  host.endsWith('.sofurryfiles.com');

const isFluffleSourceHost = (host: string) =>
  MEDIA_HOST_OK(host) ||
  host === 'pics.tailspace.com' ||
  host === 'tailspace.com' ||
  host.endsWith('.tailspace.com');

function e621MediaProxy(): Plugin {
  return {
    name: 'e621-media-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/download')) {
          next();
          return;
        }
        const raw = new URL(req.url, 'http://127.0.0.1').searchParams.get('url') || '';
        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          res.statusCode = 400;
          res.end('bad url');
          return;
        }
        if (target.protocol !== 'https:' || !MEDIA_HOST_OK(target.hostname.toLowerCase())) {
          res.statusCode = 400;
          res.end('host not allowed');
          return;
        }
        const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;
        const faCookies =
          new URL(req.url, 'http://127.0.0.1').searchParams.get('fa') ||
          [
            process.env.FA_COOKIE_A ? `a=${process.env.FA_COOKIE_A}` : '',
            process.env.FA_COOKIE_B ? `b=${process.env.FA_COOKIE_B}` : '',
          ].filter(Boolean).join('; ');
        // Follow redirects manually; re-validate host each hop (M27).
        const fetchAllowed = async (url: URL, hops = 0): Promise<Response> => {
          if (hops > 5) throw new Error('too many redirects');
          const host = url.hostname.toLowerCase();
          const remote = await fetch(url.toString(), {
            headers: {
              'User-Agent': 'm-e621-download-proxy/1.0',
              Accept: '*/*',
              ...(rangeHeader ? { Range: rangeHeader } : {}),
              ...(isInkbunnyMediaHost(host)
                ? { Referer: 'https://inkbunny.net' }
                : {}),
              ...(isFurAffinityMediaHost(host)
                ? {
                    Referer: 'https://www.furaffinity.net',
                    ...(faCookies ? { Cookie: faCookies } : {}),
                  }
                : {}),
            },
            redirect: 'manual',
          });
          if ([301, 302, 303, 307, 308].includes(remote.status)) {
            const loc = remote.headers.get('location');
            if (!loc) throw new Error('redirect without Location');
            const nextUrl = new URL(loc, url);
            if (nextUrl.protocol !== 'https:' || !MEDIA_HOST_OK(nextUrl.hostname.toLowerCase())) {
              throw new Error('redirect target not allowed');
            }
            return fetchAllowed(nextUrl, hops + 1);
          }
          return remote;
        };
        fetchAllowed(target)
          .then(async (remote) => {
            res.statusCode = remote.status;
            res.setHeader(
              'Content-Type',
              remote.headers.get('content-type') || 'application/octet-stream',
            );
            const contentLength = remote.headers.get('content-length');
            if (contentLength) res.setHeader('Content-Length', contentLength);
            const contentRange = remote.headers.get('content-range');
            if (contentRange) res.setHeader('Content-Range', contentRange);
            res.setHeader('Accept-Ranges', remote.headers.get('accept-ranges') || 'bytes');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.setHeader('Cache-Control', 'private, max-age=3600');
            if (!remote.body) {
              res.end();
              return;
            }
            const reader = remote.body.getReader();
            const pump = async (): Promise<void> => {
              const { done, value } = await reader.read();
              if (done) {
                res.end();
                return;
              }
              if (value) {
                const ok = res.write(Buffer.from(value));
                if (!ok) {
                  await new Promise<void>((resolve) => res.once('drain', resolve));
                }
              }
              return pump();
            };
            await pump();
          })
          .catch((err) => {
            if (!res.headersSent) {
              res.statusCode = 502;
              res.end(String(err));
            } else {
              res.destroy(err instanceof Error ? err : undefined);
            }
          });
      });
    },
  };
}

function e621VotesProxy(): Plugin {
  return {
    name: 'e621-votes-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/votes') || req.method !== 'POST') {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        let payload: { post_id?: number; score?: number };
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          res.statusCode = 400;
          res.end('invalid json');
          return;
        }
        const postId = payload.post_id;
        const score = payload.score;
        if (typeof postId !== 'number' || ![1, -1, 0].includes(score as number)) {
          res.statusCode = 400;
          res.end('post_id and score required');
          return;
        }
        const siteBase = String(req.headers['x-site-base'] || 'https://e621.net/');
        let base: URL;
        try {
          base = new URL(siteBase.endsWith('/') ? siteBase : `${siteBase}/`);
        } catch {
          res.statusCode = 400;
          res.end('invalid X-Site-Base');
          return;
        }
        if (!['e621.net', 'e926.net', 'e6ai.net'].includes(base.hostname.toLowerCase())) {
          res.statusCode = 400;
          res.end('host not allowed');
          return;
        }
        const auth = req.headers.authorization;
        if (!auth || !String(auth).toLowerCase().startsWith('basic ')) {
          res.statusCode = 401;
          res.end('missing basic auth');
          return;
        }
        try {
          const remote = await fetch(`${base.origin}/posts/${postId}/votes.json`, {
            method: 'POST',
            headers: {
              Authorization: String(auth),
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'm-e621-votes-proxy/1.0',
            },
            body: `score=${score}`,
          });
          res.statusCode = remote.status;
          res.setHeader(
            'Content-Type',
            remote.headers.get('content-type') || 'application/json',
          );
          res.end(Buffer.from(await remote.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.end(String(err));
        }
      });
    },
  };
}

function e621FavoritesProxy(): Plugin {
  return {
    name: 'e621-favorites-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/favorites')) { next(); return; }
        if (req.method !== 'POST' && req.method !== 'DELETE') { next(); return; }

        const siteBase = String(req.headers['x-site-base'] || 'https://e621.net/');
        let base: URL;
        try {
          base = new URL(siteBase.endsWith('/') ? siteBase : `${siteBase}/`);
        } catch {
          res.statusCode = 400; res.end('invalid X-Site-Base'); return;
        }
        if (!['e621.net', 'e926.net', 'e6ai.net'].includes(base.hostname.toLowerCase())) {
          res.statusCode = 400; res.end('host not allowed'); return;
        }
        const auth = req.headers.authorization;
        if (!auth || !String(auth).toLowerCase().startsWith('basic ')) {
          res.statusCode = 401; res.end('missing basic auth'); return;
        }

        // Determine if this is DELETE /api/favorites/:id
        const deleteMatch = req.url.match(/^\/api\/favorites\/(\d+)/);

        try {
          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            let payload: { post_id?: number } = {};
            try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
            catch { res.statusCode = 400; res.end('invalid json'); return; }
            if (typeof payload.post_id !== 'number') {
              res.statusCode = 400; res.end('post_id required'); return;
            }
            const remote = await fetch(`${base.origin}/favorites.json`, {
              method: 'POST',
              headers: {
                Authorization: String(auth),
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'm-e621-favorites-proxy/1.0',
              },
              body: new URLSearchParams({ post_id: String(payload.post_id) }).toString(),
            });
            res.statusCode = remote.status;
            res.setHeader('Content-Type', remote.headers.get('content-type') || 'application/json');
            res.end(Buffer.from(await remote.arrayBuffer()));
          } else if (req.method === 'DELETE' && deleteMatch) {
            const remote = await fetch(
              `${base.origin}/favorites/${deleteMatch[1]}.json`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: String(auth),
                  'User-Agent': 'm-e621-favorites-proxy/1.0',
                },
              },
            );
            res.statusCode = remote.status;
            res.setHeader('Content-Type', remote.headers.get('content-type') || 'application/json');
            res.end(Buffer.from(await remote.arrayBuffer()));
          } else {
            next();
          }
        } catch (err) {
          res.statusCode = 502;
          res.end(String(err));
        }
      });
    },
  };
}

function e621CommentsProxy(): Plugin {
  return {
    name: 'e621-comments-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/comments') || req.method !== 'POST') {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        let payload: { post_id?: number; body?: string };
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          res.statusCode = 400;
          res.end('invalid json');
          return;
        }
        const postId = payload.post_id;
        const body = payload.body;
        if (typeof postId !== 'number' || typeof body !== 'string' || !body.trim()) {
          res.statusCode = 400;
          res.end('post_id and body required');
          return;
        }
        const siteBase = String(req.headers['x-site-base'] || 'https://e621.net/');
        let base: URL;
        try {
          base = new URL(siteBase.endsWith('/') ? siteBase : `${siteBase}/`);
        } catch {
          res.statusCode = 400;
          res.end('invalid X-Site-Base');
          return;
        }
        if (!['e621.net', 'e926.net', 'e6ai.net'].includes(base.hostname.toLowerCase())) {
          res.statusCode = 400;
          res.end('host not allowed');
          return;
        }
        const auth = req.headers.authorization;
        if (!auth || !String(auth).toLowerCase().startsWith('basic ')) {
          res.statusCode = 401;
          res.end('missing basic auth');
          return;
        }
        try {
          const form = new URLSearchParams({
            'comment[post_id]': String(postId),
            'comment[body]': body,
          });
          const remote = await fetch(`${base.origin}/comments.json`, {
            method: 'POST',
            headers: {
              Authorization: String(auth),
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'm-e621-comments-proxy/1.0',
            },
            body: form.toString(),
          });
          res.statusCode = remote.status;
          res.setHeader(
            'Content-Type',
            remote.headers.get('content-type') || 'application/json',
          );
          res.end(Buffer.from(await remote.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.end(String(err));
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Furbooru proxy
// ---------------------------------------------------------------------------

function furbooruProxy(): Plugin {
  const FURBOORU_BASE = 'https://furbooru.org';

  function respondUpstream(
    res: ServerResponse,
    remote: { status: number; contentType: string; body: Buffer },
  ) {
    res.statusCode = remote.status;
    res.setHeader('Content-Type', remote.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.end(remote.body);
  }

  return {
    name: 'furbooru-proxy',
    configureServer(server) {

      // ── Image search: GET /api/furbooru/images?q=...&page=...&per_page=... ──
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/furbooru/images') || req.method !== 'GET') {
          next();
          return;
        }
        // Exclude /api/furbooru/images/:id/* sub-paths
        const pathPart = (req.url.split('?')[0] ?? '').replace(/^\/api\/furbooru\/images/, '');
        if (pathPart && pathPart !== '/') {
          next();
          return;
        }
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const params = new URLSearchParams(qs);
        const fwd = new URLSearchParams();
        for (const key of ['q', 'page', 'per_page', 'key', 'sf', 'sd']) {
          const v = params.get(key);
          if (v !== null) fwd.set(key, v);
        }
        const url = `${FURBOORU_BASE}/api/v1/json/search/images?${fwd}`;
        respondUpstream(res, furbooruUpstream(url));
      });

      // ── Tag search: GET /api/furbooru/tags?q=...&per_page=... ──────────────
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/furbooru/tags') || req.method !== 'GET') {
          next();
          return;
        }
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const params = new URLSearchParams(qs);
        const fwd = new URLSearchParams();
        for (const key of ['q', 'per_page', 'key']) {
          const v = params.get(key);
          if (v !== null) fwd.set(key, v);
        }
        const url = `${FURBOORU_BASE}/api/v1/json/search/tags?${fwd}`;
        respondUpstream(res, furbooruUpstream(url));
      });

      // ── Comment search: GET /api/furbooru/comments?q=image_id:N&per_page=... ─
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/furbooru/comments') || req.method !== 'GET') {
          next();
          return;
        }
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const params = new URLSearchParams(qs);
        const fwd = new URLSearchParams();
        // Prefer explicit q=; fall back to image_id= for older clients
        const imageId = params.get('image_id');
        const q = params.get('q') || (imageId ? `image_id:${imageId}` : null);
        if (q) fwd.set('q', q);
        for (const key of ['per_page', 'key', 'page', 'sf', 'sd']) {
          const v = params.get(key);
          if (v !== null) fwd.set(key, v);
        }
        // Philomena path is /search/comments — /comments/search returns 400
        const url = `${FURBOORU_BASE}/api/v1/json/search/comments?${fwd}`;
        respondUpstream(res, furbooruUpstream(url));
      });

      // ── Current user: GET /api/furbooru/user?key=... ──────────────────────
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = (req.url ?? '').split('?')[0];
        if (pathOnly !== '/api/furbooru/user' || req.method !== 'GET') {
          next();
          return;
        }
        const qs = req.url!.includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '';
        const key = new URLSearchParams(qs).get('key') ?? '';
        if (!key) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message: 'key required' }));
          return;
        }
        const url = `${FURBOORU_BASE}/api/v1/json/filters/user?key=${encodeURIComponent(key)}`;
        respondUpstream(res, furbooruUpstream(url));
      });

      // ── Faves: POST/DELETE /api/furbooru/images/:id/faves?key=... ──────────
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = (req.url ?? '').split('?')[0];
        const favMatch = /^\/api\/furbooru\/images\/(\d+)\/faves$/.exec(pathOnly);
        if (!favMatch || (req.method !== 'POST' && req.method !== 'DELETE')) {
          next();
          return;
        }
        const imageId = favMatch[1];
        const qs = req.url!.includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '';
        const key = new URLSearchParams(qs).get('key') ?? '';
        const url = `${FURBOORU_BASE}/api/v1/json/images/${imageId}/faves?key=${encodeURIComponent(key)}`;
        respondUpstream(res, furbooruUpstream(url, { method: req.method }));
      });

      // ── Votes: POST/DELETE /api/furbooru/images/:id/votes?key=... ─────────
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = (req.url ?? '').split('?')[0];
        const voteMatch = /^\/api\/furbooru\/images\/(\d+)\/votes$/.exec(pathOnly);
        if (!voteMatch || (req.method !== 'POST' && req.method !== 'DELETE')) {
          next();
          return;
        }
        const imageId = voteMatch[1];
        const qs = req.url!.includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '';
        const params = new URLSearchParams(qs);
        const key = params.get('key') ?? '';
        const value = params.get('value') ?? 'up';
        const url =
          req.method === 'DELETE'
            ? `${FURBOORU_BASE}/api/v1/json/images/${imageId}/votes?key=${encodeURIComponent(key)}`
            : `${FURBOORU_BASE}/api/v1/json/images/${imageId}/votes?key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`;
        respondUpstream(res, furbooruUpstream(url, { method: req.method }));
      });

      // ── Create comment: POST /api/furbooru/comments?key=... ────────────────
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = (req.url ?? '').split('?')[0];
        if (pathOnly !== '/api/furbooru/comments' || req.method !== 'POST') {
          next();
          return;
        }
        const qs = req.url!.includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '';
        const key = new URLSearchParams(qs).get('key') ?? '';
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);
        const url = `${FURBOORU_BASE}/api/v1/json/comments?key=${encodeURIComponent(key)}`;
        respondUpstream(res, furbooruUpstream(url, { method: 'POST', body }));
      });
    },
  };
}

function inkbunnyProxy(): Plugin {
  const INKBUNNY_BASE = 'https://inkbunny.net';
  const POST_MAP: Record<string, string> = {
    '/api/inkbunny/login': 'api_login.php',
    '/api/inkbunny/logout': 'api_logout.php',
    '/api/inkbunny/ratings': 'api_userrating.php',
    '/api/inkbunny/search': 'api_search.php',
    '/api/inkbunny/submissions': 'api_submissions.php',
    '/api/inkbunny/watchlist': 'api_watchlist.php',
  };

  async function readBody(req: { [Symbol.asyncIterator](): AsyncIterator<unknown> }): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return Buffer.concat(chunks);
  }

  return {
    name: 'inkbunny-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || '').split('?')[0];
        if (!urlPath.startsWith('/api/inkbunny/')) {
          next();
          return;
        }

        const jsonError = (status: number, message: string) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message }));
        };

        try {
          if (urlPath === '/api/inkbunny/keywords') {
            if (req.method !== 'GET') {
              jsonError(405, 'method not allowed');
              return;
            }
            const qs = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
            const params = new URLSearchParams(qs);
            const fwd = new URLSearchParams();
            for (const key of ['keyword', 'ratingsmask', 'underscorespaces']) {
              const v = params.get(key);
              if (v !== null) fwd.set(key, v);
            }
            const remote = await fetch(`${INKBUNNY_BASE}/api_search_autosuggest.php?${fwd}`, {
              headers: {
                Accept: 'application/json',
                'User-Agent': 'me621-inkbunny-proxy/1.0',
              },
            });
            res.statusCode = remote.status;
            const ct = remote.headers.get('content-type');
            if (ct) res.setHeader('Content-Type', ct);
            res.setHeader('Cache-Control', 'no-store');
            res.end(Buffer.from(await remote.arrayBuffer()));
            return;
          }

          const php = POST_MAP[urlPath];
          if (!php) {
            jsonError(404, 'not found');
            return;
          }
          if (req.method !== 'POST') {
            jsonError(405, 'method not allowed');
            return;
          }
          const body = await readBody(req);
          const contentType =
            (req.headers['content-type'] as string | undefined) ||
            'application/x-www-form-urlencoded';
          const remote = await fetch(`${INKBUNNY_BASE}/${php}`, {
            method: 'POST',
            headers: {
              'Content-Type': contentType,
              Accept: 'application/json',
              'User-Agent': 'me621-inkbunny-proxy/1.0',
            },
            body,
          });
          res.statusCode = remote.status;
          const ct = remote.headers.get('content-type');
          if (ct) res.setHeader('Content-Type', ct);
          res.setHeader('Cache-Control', 'no-store');
          res.end(Buffer.from(await remote.arrayBuffer()));
        } catch (err) {
          jsonError(502, String(err));
        }
      });
    },
  };
}


function fluffleProxy(): Plugin {
  const FLUFFLE_API = 'https://api.fluffle.xyz/exact-search-by-file';
  const FLUFFLE_UA = 'm-e621/1.0 (by lovelyspacedog on GitHub)';

  const guessFilename = (url: string, contentType: string): { filename: string; mime: string } => {
    const pathLower = new URL(url).pathname.toLowerCase();
    const ctype = (contentType || '').split(';')[0].trim().toLowerCase();
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const) {
      if (pathLower.endsWith('.' + ext)) {
        const nameExt = ext === 'jpeg' ? 'jpg' : ext;
        const mime =
          nameExt === 'jpg'
            ? 'image/jpeg'
            : nameExt === 'png'
              ? 'image/png'
              : nameExt === 'webp'
                ? 'image/webp'
                : 'image/gif';
        return { filename: `image.${nameExt}`, mime };
      }
    }
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    if (ctype in map) {
      const ext = map[ctype];
      return { filename: `image.${ext}`, mime: ctype === 'image/jpg' ? 'image/jpeg' : ctype };
    }
    return { filename: 'image.jpg', mime: 'image/jpeg' };
  };

  const encodeMultipart = (
    fileBytes: Buffer,
    filename: string,
    mime: string,
    limit: number,
  ): { body: Buffer; contentType: string } => {
    const boundary = `----m-e621-fluffle-${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const crlf = '\r\n';
    const head =
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="limit"${crlf}${crlf}` +
      `${limit}${crlf}` +
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"${crlf}` +
      `Content-Type: ${mime}${crlf}${crlf}`;
    const tail = `${crlf}--${boundary}--${crlf}`;
    return {
      body: Buffer.concat([Buffer.from(head, 'utf8'), fileBytes, Buffer.from(tail, 'utf8')]),
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  };

  const fetchAllowed = async (url: URL, hops = 0): Promise<Response> => {
    if (hops > 5) throw new Error('too many redirects');
    const host = url.hostname.toLowerCase();
    const faCookies = [
      process.env.FA_COOKIE_A ? `a=${process.env.FA_COOKIE_A}` : '',
      process.env.FA_COOKIE_B ? `b=${process.env.FA_COOKIE_B}` : '',
    ]
      .filter(Boolean)
      .join('; ');
    const remote = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'm-e621-fluffle-proxy/1.0',
        Accept: 'image/*,*/*',
        ...(isInkbunnyMediaHost(host) ? { Referer: 'https://inkbunny.net' } : {}),
        ...(isFurAffinityMediaHost(host)
          ? {
              Referer: 'https://www.furaffinity.net',
              ...(faCookies ? { Cookie: faCookies } : {}),
            }
          : {}),
      },
      redirect: 'manual',
    });
    if ([301, 302, 303, 307, 308].includes(remote.status)) {
      const loc = remote.headers.get('location');
      if (!loc) throw new Error('redirect without Location');
      const nextUrl = new URL(loc, url);
      if (nextUrl.protocol !== 'https:' || !isFluffleSourceHost(nextUrl.hostname.toLowerCase())) {
        throw new Error('redirect target not allowed');
      }
      return fetchAllowed(nextUrl, hops + 1);
    }
    return remote;
  };

  return {
    name: 'fluffle-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || '').split('?')[0];
        if (urlPath !== '/api/fluffle/exact-search' || req.method !== 'POST') {
          next();
          return;
        }

        const jsonError = (code: number, message: string) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ ok: false, message }));
        };

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          let payload: { url?: string; limit?: number };
          try {
            payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          } catch {
            jsonError(400, 'invalid json');
            return;
          }
          const rawUrl = (payload.url || '').trim();
          let limit = Number(payload.limit ?? 8);
          if (!Number.isFinite(limit)) limit = 8;
          limit = Math.max(8, Math.min(32, Math.floor(limit)));

          let target: URL;
          try {
            target = new URL(rawUrl);
          } catch {
            jsonError(400, 'bad url');
            return;
          }
          if (target.protocol !== 'https:' || !isFluffleSourceHost(target.hostname.toLowerCase())) {
            jsonError(400, 'url not allowed');
            return;
          }

          const remote = await fetchAllowed(target);
          if (!remote.ok) {
            jsonError(502, `failed to fetch image (${remote.status})`);
            return;
          }
          const fileBytes = Buffer.from(await remote.arrayBuffer());
          if (!fileBytes.length) {
            jsonError(502, 'empty image');
            return;
          }
          if (fileBytes.length > 4 * 1024 * 1024) {
            jsonError(400, 'image too large (max 4 MiB)');
            return;
          }
          const { filename, mime } = guessFilename(
            target.toString(),
            remote.headers.get('content-type') || '',
          );
          const { body, contentType } = encodeMultipart(fileBytes, filename, mime, limit);

          const fluffleResp = await fetch(FLUFFLE_API, {
            method: 'POST',
            headers: {
              'User-Agent': FLUFFLE_UA,
              Accept: 'application/json',
              'Content-Type': contentType,
            },
            body,
          });
          const out = Buffer.from(await fluffleResp.arrayBuffer());
          res.statusCode = fluffleResp.status;
          res.setHeader(
            'Content-Type',
            fluffleResp.headers.get('content-type') || 'application/json',
          );
          res.setHeader('Cache-Control', 'no-store');
          res.end(out);
        } catch (err) {
          jsonError(502, String(err));
        }
      });
    },
  };
}


function rufflePlugin(): Plugin {
  const ruffleDir = path.resolve(process.cwd(), 'node_modules/@ruffle-rs/ruffle');

  return {
    name: 'ruffle-plugin',

    // Dev: serve /ruffle/* directly from node_modules
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/ruffle/')) {
          next();
          return;
        }
        const filename = req.url.slice('/ruffle/'.length).split('?')[0];
        // Reject path traversal or subdirectory requests
        if (!filename || filename.includes('/') || filename.includes('..')) {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }
        const filePath = path.join(ruffleDir, filename);
        if (!fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const ext = path.extname(filename).toLowerCase();
        const mime =
          ext === '.wasm'
            ? 'application/wasm'
            : ext === '.js'
              ? 'application/javascript'
              : 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.end(fs.readFileSync(filePath));
      });
    },

    // Build: copy Ruffle files into dist/ruffle/
    closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist/ruffle');
      try {
        fs.mkdirSync(outDir, { recursive: true });
        const files = fs.readdirSync(ruffleDir).filter(
          (f: string) => f.endsWith('.js') || f.endsWith('.wasm'),
        );
        for (const file of files) {
          fs.copyFileSync(path.join(ruffleDir, file), path.join(outDir, file));
        }
        console.log(`[ruffle] Copied ${files.length} file(s) to dist/ruffle/`);
      } catch {
        // Ignore — dist may not exist for non-build invocations
      }
    },
  };
}

function generateSitemap(env: Record<string, string>): Plugin {
  return {
    name: 'generate-sitemap',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir || 'dist';
      const date = new Date().toISOString().split('T')[0];
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${env.VITE_APP_DOMAIN}/</loc>
    <lastmod>${date}</lastmod>
  </url>
</urlset>`;

      fs.writeFileSync(path.resolve(outDir, 'sitemap.xml'), sitemap);
    }
  };
}


function gitLogPretty(ref: string, n: number): string {
  try {
    return execSync(`git log -n ${n} --pretty=format:";;;;;%H;%aI;%an;%B" ${ref}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/** Merge HEAD + upstream Material e621 logs so the landing page can show both columns. */
function buildGitCommitInfo(): string {
  const seen = new Set<string>();
  const chunks: string[] = [];
  for (const ref of ["HEAD", "upstream/master", "upstream/main"]) {
    const raw = gitLogPretty(ref, 40);
    if (!raw) continue;
    for (const part of raw.split(";;;;;").filter(Boolean)) {
      const hash = part.split(";", 1)[0]?.trim();
      if (!hash || seen.has(hash)) continue;
      seen.add(hash);
      chunks.push(`;;;;;${part}`);
    }
  }
  return chunks.join("");
}

const VITE_GIT_COMMIT_INFO = buildGitCommitInfo();

const VITE_GIT_BRANCH = execSync("git branch --show-current")
  .toString()
  .trim();

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.FA_COOKIE_A && !process.env.FA_COOKIE_A) process.env.FA_COOKIE_A = env.FA_COOKIE_A;
  if (env.FA_COOKIE_B && !process.env.FA_COOKIE_B) process.env.FA_COOKIE_B = env.FA_COOKIE_B;
  return {
    define: {
      "import.meta.env.VITE_GIT_COMMIT_INFO": JSON.stringify(VITE_GIT_COMMIT_INFO),
      "import.meta.env.VITE_GIT_BRANCH": JSON.stringify(VITE_GIT_BRANCH),
    },
    plugins: [
      e621MediaProxy(),
      e621VotesProxy(),
      e621CommentsProxy(),
      e621FavoritesProxy(),
      tailspaceProxy(),
      furbooruProxy(),
      inkbunnyProxy(),
      furaffinityProxy(),
      weasylProxy(),
      itakuProxy(),
      sofurryProxy(),
      fluffleProxy(),
      rufflePlugin(),
      generateSitemap(env),
      vue(),
      vuetify(),
      vueDevTools(),
      VitePWA({
        registerType: 'prompt',
        workbox: {
          // Ruffle WASM files are large and loaded on-demand — exclude from precache
          globIgnores: ['ruffle/**'],
          // Main bundle exceeds Workbox's 2 MiB default after multi-site growth
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api\//],
        },
        manifest: {
          id: "/#/posts",
          name: "m-e621",
          short_name: "m-e621", // maximum of 12 characters recommended by chromium devs
          start_url: "/#/posts",
          scope: "/",
          display: "fullscreen",
          background_color: "#000000",
          theme_color: "#000000",
          description:
            "m-e621 is a personal multi-site fork of Material e621 — a modern web client for e621.net and related sites.",
          orientation: "any",
          lang: "en",
          icons: [
            {
              "src": "pwa-64x64.png",
              "sizes": "64x64",
              "type": "image/png"
            },
            {
              "src": "pwa-192x192.png",
              "sizes": "192x192",
              "type": "image/png"
            },
            {
              "src": "pwa-512x512.png",
              "sizes": "512x512",
              "type": "image/png"
            },
            {
              "src": "maskable-icon-512x512.png",
              "sizes": "512x512",
              "type": "image/png",
              "purpose": "maskable"
            }
          ]
        }
      })

    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "credentialless",
      },
    },
    build: {
      rollupOptions: {
        output: {
          format: 'iife',
        },
      },
    },
  }
})
