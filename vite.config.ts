import { fileURLToPath, URL } from 'node:url'
import type { ServerResponse } from 'node:http'
import { defineConfig, Plugin, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import vuetify from 'vite-plugin-vuetify'
import { execSync } from "child_process";
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs';
import path from 'path';

const MEDIA_HOST_OK = (host: string) =>
  ['.e621.net', '.e926.net', '.e6ai.net'].some((s) => host.endsWith(s)) ||
  ['e621.net', 'e926.net', 'e6ai.net', 'inkbunny.net'].includes(host) ||
  host === 'ib.metapix.net' ||
  host.endsWith('.metapix.net');

const isInkbunnyMediaHost = (host: string) =>
  host === 'inkbunny.net' || host === 'ib.metapix.net' || host.endsWith('.metapix.net');

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
        // Follow redirects manually; re-validate host each hop (M27).
        const fetchAllowed = async (url: URL, hops = 0): Promise<Response> => {
          if (hops > 5) throw new Error('too many redirects');
          const remote = await fetch(url.toString(), {
            headers: {
              'User-Agent': 'm-e621-download-proxy/1.0',
              ...(isInkbunnyMediaHost(url.hostname.toLowerCase())
                ? { Referer: 'https://inkbunny.net' }
                : {}),
            },
            redirect: 'manual',
          });
          if ([301, 302, 303, 307, 308].includes(remote.status)) {
            const loc = remote.headers.get('location');
            if (!loc) throw new Error('redirect without Location');
            const next = new URL(loc, url);
            if (next.protocol !== 'https:' || !MEDIA_HOST_OK(next.hostname.toLowerCase())) {
              throw new Error('redirect target not allowed');
            }
            return fetchAllowed(next, hops + 1);
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
            res.end(Buffer.from(await remote.arrayBuffer()));
          })
          .catch((err) => {
            res.statusCode = 502;
            res.end(String(err));
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

  /** Forward select headers from the upstream response to the client. */
  function setResponseHeaders(res: ServerResponse, remote: Response) {
    const ct = remote.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'no-store');
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
        try {
          const remote = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'me621-furbooru-proxy/1.0' },
          });
          res.statusCode = remote.ok ? 200 : remote.status;
          setResponseHeaders(res, remote);
          res.end(Buffer.from(await remote.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message: String(err) }));
        }
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
        try {
          const remote = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'me621-furbooru-proxy/1.0' },
          });
          res.statusCode = remote.ok ? 200 : remote.status;
          setResponseHeaders(res, remote);
          res.end(Buffer.from(await remote.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message: String(err) }));
        }
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
        try {
          const remote = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'me621-furbooru-proxy/1.0' },
          });
          res.statusCode = remote.ok ? 200 : remote.status;
          setResponseHeaders(res, remote);
          res.end(Buffer.from(await remote.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message: String(err) }));
        }
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
        try {
          const remote = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'me621-furbooru-proxy/1.0' },
          });
          res.statusCode = remote.ok ? 200 : remote.status;
          setResponseHeaders(res, remote);
          res.end(Buffer.from(await remote.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message: String(err) }));
        }
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
        try {
          const remote = await fetch(url, {
            method: req.method,
            headers: { Accept: 'application/json', 'User-Agent': 'me621-furbooru-proxy/1.0' },
          });
          res.statusCode = remote.status;
          setResponseHeaders(res, remote);
          const body = await remote.arrayBuffer();
          res.end(body.byteLength ? Buffer.from(body) : '');
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message: String(err) }));
        }
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
        try {
          const remote = await fetch(url, {
            method: req.method,
            headers: { Accept: 'application/json', 'User-Agent': 'me621-furbooru-proxy/1.0' },
          });
          res.statusCode = remote.ok ? 200 : remote.status;
          setResponseHeaders(res, remote);
          res.end(Buffer.from(await remote.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message: String(err) }));
        }
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
        try {
          const remote = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'me621-furbooru-proxy/1.0',
            },
            body,
          });
          res.statusCode = remote.ok ? 200 : remote.status;
          setResponseHeaders(res, remote);
          res.end(Buffer.from(await remote.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message: String(err) }));
        }
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

function tailspaceProxy(): Plugin {
  const TAILSPACE_BASE = 'https://tailspace.com';

  return {
    name: 'tailspace-proxy',
    configureServer(server) {
      // ── Posts: GET /api/tailspace/posts?page=N ───────────────────────────
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/tailspace/posts') || req.method !== 'GET') {
          next();
          return;
        }
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const params = new URLSearchParams(qs);
        const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
        const url = `${TAILSPACE_BASE}/api/get-browse-posts-paginated?page=${page}`;
        try {
          const remote = await fetch(url, {
            headers: {
              Accept: 'application/json',
              Referer: `${TAILSPACE_BASE}/`,
              'User-Agent': 'me621-tailspace-proxy/1.0',
            },
          });
          if (!remote.ok) {
            res.statusCode = remote.status;
            res.end(JSON.stringify({ ok: false, message: `upstream ${remote.status}` }));
            return;
          }
          const payload = await remote.json() as Record<string, unknown>;
          const data = (payload?.data && typeof payload.data === 'object'
            ? payload.data
            : payload) as Record<string, unknown>;
          const normalized = {
            posts: Array.isArray(data?.posts) ? data.posts : [],
            hasNextPage: Boolean(data?.hasNextPage),
          };
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(normalized));
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ ok: false, message: String(err) }));
        }
      });

      // ── Comics list: GET /api/tailspace/comics?... ────────────────────────
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/tailspace/comics') || req.method !== 'GET') {
          next();
          return;
        }
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const params = new URLSearchParams(qs);

        // Forward whitelisted params
        const fwd = new URLSearchParams();
        for (const key of ['page', 'search', 'sort', 'finishedOnly']) {
          const v = params.get(key);
          if (v !== null) fwd.set(key, v);
        }
        for (const v of params.getAll('c')) fwd.append('c', v);
        for (const v of params.getAll('tag')) fwd.append('tag', v);
        for (const v of params.getAll('excludeTag')) fwd.append('excludeTag', v);

        const fwdQs = fwd.toString();
        const url = `${TAILSPACE_BASE}/browse.data` + (fwdQs ? `?${fwdQs}` : '');
        try {
          const remote = await fetch(url, {
            headers: {
              Accept: 'text/x-turbo-stream, application/json, */*',
              Referer: `${TAILSPACE_BASE}/browse`,
              'User-Agent': 'me621-tailspace-proxy/1.0',
            },
          });
          if (!remote.ok) {
            res.statusCode = remote.status;
            res.end(JSON.stringify({ ok: false, message: `upstream ${remote.status}` }));
            return;
          }
          const raw = await remote.text();
          const data = parseTailspaceComics(raw);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(data));
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ ok: false, message: String(err) }));
        }
      });

      // ── Comic detail: GET /api/tailspace/comic?name=X ────────────────────
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = req.url?.split('?')[0] || '';
        if (pathOnly !== '/api/tailspace/comic' || req.method !== 'GET') {
          next();
          return;
        }
        const qs = req.url!.includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '';
        const name = (new URLSearchParams(qs).get('name') || '').trim();
        if (!name) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, message: 'name required' }));
          return;
        }
        const url = `${TAILSPACE_BASE}/c/${encodeURIComponent(name)}.data`;
        try {
          const remote = await fetch(url, {
            headers: {
              Accept: 'text/x-turbo-stream, application/json, */*',
              Referer: `${TAILSPACE_BASE}/`,
              'User-Agent': 'me621-tailspace-proxy/1.0',
            },
          });
          if (!remote.ok) {
            res.statusCode = remote.status;
            res.end(JSON.stringify({ ok: false, message: `upstream ${remote.status}` }));
            return;
          }
          const data = parseTailspaceComicDetail(await remote.text());
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(data));
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ ok: false, message: String(err) }));
        }
      });

      // ── Comments: GET /api/tailspace/comments?username=X&postId=N ────────
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/tailspace/comments') || req.method !== 'GET') {
          next();
          return;
        }
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const params = new URLSearchParams(qs);
        const username = (params.get('username') || '').trim();
        const postId = (params.get('postId') || '').trim();
        if (!username || !/^\d+$/.test(postId) || username.includes('/') || username.includes('..')) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, message: 'username and postId required' }));
          return;
        }
        const url = `${TAILSPACE_BASE}/artist/${encodeURIComponent(username)}/post/${postId}.data`;
        try {
          const remote = await fetch(url, {
            headers: {
              Accept: 'text/x-turbo-stream, application/json, */*',
              Referer: `${TAILSPACE_BASE}/`,
              'User-Agent': 'me621-tailspace-proxy/1.0',
            },
          });
          if (!remote.ok) {
            res.statusCode = remote.status;
            res.end(JSON.stringify({ ok: false, message: `upstream ${remote.status}` }));
            return;
          }
          const comments = parseTailspaceComments(await remote.text());
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ comments }));
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ ok: false, message: String(err) }));
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Tailspace turbo-stream parser (mirrors the Python implementation in serve.py)
// ---------------------------------------------------------------------------

const TS_SENTINELS: Record<number, unknown> = { [-5]: null, [-6]: true, [-7]: false };

function tsDecodePool(pool: unknown[]): unknown {
  const cache = new Map<number, unknown>();

  function decode(ref: unknown): unknown {
    if (typeof ref !== 'number') return ref;
    if (ref in TS_SENTINELS) return TS_SENTINELS[ref];
    if (ref < 0) return null;
    if (cache.has(ref)) return cache.get(ref);
    if (ref >= pool.length) return null;
    const result = decodeVal(pool[ref]);
    cache.set(ref, result);
    return result;
  }

  function decodeVal(val: unknown): unknown {
    if (Array.isArray(val)) {
      // Typed values: ["D", ms] is a Date literal — do NOT treat ms as a pool ref.
      if (val.length >= 2 && val[0] === 'D') {
        return typeof val[1] === 'number' ? val[1] : null;
      }
      return val.map((item) => (typeof item === 'number' ? decode(item) : decodeVal(item)));
    }
    if (val && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (/^_-?\d+$/.test(k)) {
          const keyIdx = parseInt(k.slice(1), 10);
          const actualKey = decode(keyIdx);
          const actualVal = typeof v === 'number' ? decode(v) : decodeVal(v);
          if (actualKey != null) out[String(actualKey)] = actualVal;
        } else {
          out[k] = typeof v === 'number' ? decode(v) : decodeVal(v);
        }
      }
      return out;
    }
    return val;
  }

  return decode(0);
}

function findComicsPayload(obj: unknown): Record<string, unknown> | null {
  if (obj && typeof obj === 'object') {
    if (!Array.isArray(obj) && 'comicsAndAds' in (obj as Record<string, unknown>)) {
      return obj as Record<string, unknown>;
    }
    for (const value of Object.values(obj as Record<string, unknown>)) {
      const found = findComicsPayload(value);
      if (found) return found;
    }
  }
  return null;
}

function findKey(obj: unknown, key: string): unknown {
  if (obj && typeof obj === 'object') {
    if (!Array.isArray(obj) && key in (obj as Record<string, unknown>)) {
      return (obj as Record<string, unknown>)[key];
    }
    for (const value of Object.values(obj as Record<string, unknown>)) {
      const found = findKey(value, key);
      if (found !== undefined && found !== null) return found;
    }
  }
  return null;
}

function parseTailspaceComics(text: string): { comics: unknown[]; numberOfPages: number; totalNumComics: number } {
  const trimmed = text.trim();

  // Try plain JSON (object)
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      const found = findComicsPayload(data);
      if (found) return extractComicsPayload(found);
    } catch { /* fall through */ }
  }

  // Try pool array — comicsAndAds is nested under routes/pages/browse/BrowsePage
  if (trimmed.startsWith('[')) {
    try {
      const pool = JSON.parse(trimmed) as unknown[];
      const decoded = tsDecodePool(pool);
      const found = findComicsPayload(decoded);
      if (found) return extractComicsPayload(found);
    } catch { /* fall through */ }
  }

  // Try line-by-line
  for (const line of trimmed.split('\n')) {
    const l = line.trim();
    if (!l.startsWith('{') && !l.startsWith('[')) continue;
    try {
      const chunk = JSON.parse(l) as unknown;
      const found = findComicsPayload(chunk);
      if (found) return extractComicsPayload(found);
    } catch { /* ignore */ }
  }

  throw new Error(`Cannot parse tailspace comics response: ${trimmed.slice(0, 200)}`);
}

function extractComicsPayload(data: Record<string, unknown>) {
  const rawList = (data['comicsAndAds'] as unknown[] | undefined) ?? [];
  // Ads use string ids + link; real comics have numeric id + name.
  const comics = rawList.filter((item): item is Record<string, unknown> => {
    if (typeof item !== 'object' || item === null) return false;
    const row = item as Record<string, unknown>;
    return typeof row.id === 'number' && !!row.name && !row.ad && !row.link;
  });
  return {
    comics,
    numberOfPages: Number(data['numberOfPages'] ?? 1),
    totalNumComics: Number(data['totalNumComics'] ?? comics.length),
  };
}

function findComicDetail(obj: unknown): Record<string, unknown> | null {
  if (obj && typeof obj === 'object') {
    if (!Array.isArray(obj)) {
      const row = obj as Record<string, unknown>;
      const pages = row.pages;
      if (
        Array.isArray(pages) &&
        typeof row.id === 'number' &&
        typeof row.name === 'string' &&
        pages.length > 0 &&
        typeof pages[0] === 'object' &&
        pages[0] !== null &&
        'token' in (pages[0] as object)
      ) {
        return row;
      }
    }
    for (const value of Object.values(obj as Record<string, unknown>)) {
      const found = findComicDetail(value);
      if (found) return found;
    }
  }
  return null;
}

function parseTailspaceComicDetail(text: string) {
  const data = JSON.parse(text.trim()) as unknown;
  let comic: Record<string, unknown> | null = null;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    comic = findComicDetail(data);
  } else if (Array.isArray(data)) {
    comic = findComicDetail(tsDecodePool(data));
  }
  if (!comic) throw new Error('comic pages not found in response');
  const pages = ((comic.pages as unknown[]) || [])
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null && !!(p as Record<string, unknown>).token)
    .map((p) => {
      let fileType = p.fileType;
      if (!fileType || fileType === true || fileType === false) fileType = 'jpg';
      return {
        token: p.token,
        pageNumber: Number(p.pageNumber || 0),
        fileType: String(fileType),
        isAnimated: Boolean(p.isAnimated),
        widthPx: p.widthPx ?? null,
        heightPx: p.heightPx ?? null,
        description: p.description ?? null,
        thumbHash: p.thumbHash ?? null,
      };
    })
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const artist = (comic.artist && typeof comic.artist === 'object'
    ? (comic.artist as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const prev = comic.previousComic && typeof comic.previousComic === 'object'
    ? (comic.previousComic as Record<string, unknown>)
    : null;
  const next = comic.nextComic && typeof comic.nextComic === 'object'
    ? (comic.nextComic as Record<string, unknown>)
    : null;
  const comments = Array.isArray(comic.comments)
    ? normalizeComments(comic.comments)
    : [];
  return {
    id: comic.id,
    name: comic.name,
    category: comic.category ?? null,
    state: comic.state ?? null,
    numberOfPages: Number(comic.numberOfPages || pages.length),
    description: comic.description ?? null,
    avgStars: comic.avgStars ?? null,
    commentCount: comments.length,
    thumbnailVersion: comic.thumbnailVersion ?? 0,
    artistName: artist.name || artist.creatorUsername || '',
    artistDisplayName: artist.name || artist.creatorUsername || '',
    pages,
    comments,
    previousComic: prev ? { id: prev.id, name: prev.name } : null,
    nextComic: next ? { id: next.id, name: next.name } : null,
  };
}

function normalizeComments(comments: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const item of comments) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    if (!row.id || row.isHidden) continue;
    let ts = row.timestamp;
    if (Array.isArray(ts) && ts.length >= 2 && ts[0] === 'D') ts = ts[1];
    out.push({
      id: row.id,
      userId: row.userId,
      username: row.username || 'unknown',
      profilePictureToken: row.profilePictureToken ?? null,
      comment: row.comment || '',
      replyToCommentId: row.replyToCommentId ?? null,
      timestamp: ts ?? null,
      isHidden: Boolean(row.isHidden),
    });
  }
  // Newest first (null timestamps last; tie-break by id).
  out.sort((a, b) => {
    const at = typeof a.timestamp === 'number' ? a.timestamp : null;
    const bt = typeof b.timestamp === 'number' ? b.timestamp : null;
    if (at == null && bt == null) return Number(b.id || 0) - Number(a.id || 0);
    if (at == null) return 1;
    if (bt == null) return -1;
    if (bt !== at) return bt - at;
    return Number(b.id || 0) - Number(a.id || 0);
  });
  return out;
}

function parseTailspaceComments(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  const data = JSON.parse(trimmed) as unknown;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const direct = (data as Record<string, unknown>).comments;
    if (Array.isArray(direct)) return normalizeComments(direct);
  }
  if (Array.isArray(data)) {
    const decoded = tsDecodePool(data);
    const found = findKey(decoded, 'comments');
    if (Array.isArray(found)) return normalizeComments(found);
  }
  return [];
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


const VITE_GIT_COMMIT_INFO = execSync(
  'git log -n 60 --pretty=format:";;;;;%H;%aI;%an;%B"',
)
  .toString()
  .trim();

const VITE_GIT_BRANCH = execSync("git branch --show-current")
  .toString()
  .trim();

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
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
