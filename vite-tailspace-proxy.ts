import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const TAILSPACE_BASE = 'https://tailspace.com';
const UA = 'me621-tailspace-proxy/1.0';
const SESSION_HEADER = 'x-tailspace-session';

function json(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Normalize pasted cookie / raw session value to `tailspace_session=…`. */
export function normalizeTailspaceSession(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/tailspace_session\s*=/i.test(s)) {
    const parts = s.split(/;\s*/);
    for (const part of parts) {
      const m = /^tailspace_session\s*=\s*(.*)$/i.exec(part.trim());
      if (m) return `tailspace_session=${m[1].trim()}`;
    }
  }
  if (s.includes('=') && !/^tailspace_session=/i.test(s)) {
    // Full cookie header without our session — keep as-is but prefer session if present later
    return s;
  }
  return `tailspace_session=${s}`;
}

function sessionFromReq(req: IncomingMessage): string {
  const h = req.headers[SESSION_HEADER];
  const raw = Array.isArray(h) ? h[0] : h;
  return raw ? normalizeTailspaceSession(String(raw)) : '';
}

function extractSetCookieSession(headers: Headers): string | null {
  const raw = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [];
  const lines = raw.length
    ? raw
    : (() => {
        const single = headers.get('set-cookie');
        return single ? [single] : [];
      })();
  for (const line of lines) {
    const first = line.split(';')[0] || '';
    const m = /^tailspace_session=(.*)$/i.exec(first.trim());
    if (m && m[1]) return `tailspace_session=${m[1]}`;
  }
  return null;
}

function upstreamHeaders(cookie: string, accept: string, referer = `${TAILSPACE_BASE}/`): Record<string, string> {
  const h: Record<string, string> = {
    Accept: accept,
    Referer: referer,
    Origin: TAILSPACE_BASE,
    'User-Agent': UA,
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

async function remixAction(
  path: string,
  fields: Record<string, string>,
  cookie = '',
): Promise<{ status: number; text: string; setCookie: string | null }> {
  const body = new URLSearchParams(fields).toString();
  const remote = await fetch(`${TAILSPACE_BASE}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      ...upstreamHeaders(cookie, 'text/x-script'),
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body,
  });
  const text = await remote.text();
  return {
    status: remote.status,
    text,
    setCookie: extractSetCookieSession(remote.headers),
  };
}

function decodeRemix(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Single-fetch may be multi-line; take first JSON array/object
  for (const line of trimmed.split('\n')) {
    const l = line.trim();
    if (!l.startsWith('[') && !l.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(l) as unknown;
      if (Array.isArray(parsed)) return tsDecodePool(parsed);
      return parsed;
    } catch { /* ignore */ }
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return tsDecodePool(parsed);
    return parsed;
  } catch {
    return null;
  }
}

function actionPayload(decoded: unknown): Record<string, unknown> {
  if (!decoded || typeof decoded !== 'object') return {};
  const root = decoded as Record<string, unknown>;
  // Often { data: { success, error, … } } or flat
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) {
    return root.data as Record<string, unknown>;
  }
  return root;
}

function extractUser(decoded: unknown): { username: string; userId: number | null } | null {
  const user = findKey(decoded, 'user');
  if (!user || typeof user !== 'object') return null;
  const row = user as Record<string, unknown>;
  const username = String(row.username || row.userName || '').trim();
  if (!username) return null;
  const userId =
    typeof row.userId === 'number'
      ? row.userId
      : typeof row.id === 'number'
        ? row.id
        : null;
  return { username, userId };
}

async function fetchMe(cookie: string): Promise<{ username: string; userId: number | null } | null> {
  const remote = await fetch(`${TAILSPACE_BASE}/browse-feed.data`, {
    headers: upstreamHeaders(cookie, 'text/x-script', `${TAILSPACE_BASE}/browse-feed`),
  });
  const text = await remote.text();
  const decoded = decodeRemix(text);
  // Redirect to login means invalid session
  if (text.includes('"redirect"') && text.includes('/login')) return null;
  const user = extractUser(decoded);
  if (user) return user;
  // Logged-in browse-feed sets isLoggedIn true even if user nested oddly
  const loggedIn = findKey(decoded, 'isLoggedIn');
  const username = findKey(decoded, 'username');
  if (loggedIn === true && typeof username === 'string' && username.trim()) {
    return { username: username.trim(), userId: null };
  }
  return null;
}

export function tailspaceProxy(): Plugin {
  return {
    name: 'tailspace-proxy',
    configureServer(server) {
      // Auth + mutations (POST)
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = (req.url || '').split('?')[0];
        if (!pathOnly.startsWith('/api/tailspace/') || req.method !== 'POST') {
          next();
          return;
        }
        try {
          const raw = await readBody(req);
          let payload: Record<string, unknown> = {};
          if (raw.length) {
            try {
              payload = JSON.parse(raw.toString('utf8') || '{}') as Record<string, unknown>;
            } catch {
              json(res, 400, { ok: false, message: 'invalid json' });
              return;
            }
          }
          const cookieFromBody =
            typeof payload.cookies === 'string' ? normalizeTailspaceSession(payload.cookies) : '';
          const cookie = cookieFromBody || sessionFromReq(req);

          if (pathOnly === '/api/tailspace/login') {
            const username = String(payload.username || '').trim();
            const password = String(payload.password || '');
            if (!username || !password) {
              json(res, 400, { ok: false, message: 'username and password required' });
              return;
            }
            const result = await remixAction(
              '/login.data',
              {
                username,
                password,
                redirect: typeof payload.redirect === 'string' ? payload.redirect : '',
              },
            );
            const decoded = decodeRemix(result.text);
            const data = actionPayload(decoded);
            if (data.success === false || data.error) {
              json(res, 401, {
                ok: false,
                message: String(data.error || 'Login failed'),
              });
              return;
            }
            const session = result.setCookie;
            if (!session) {
              json(res, 401, {
                ok: false,
                message: 'Login did not return a session cookie (captcha or blocked?)',
              });
              return;
            }
            const me = await fetchMe(session);
            if (!me) {
              json(res, 401, { ok: false, message: 'Session could not be verified' });
              return;
            }
            json(res, 200, {
              ok: true,
              username: me.username,
              userId: me.userId,
              cookies: session,
            });
            return;
          }

          if (pathOnly === '/api/tailspace/login-cookies') {
            const session = normalizeTailspaceSession(
              String(payload.cookies || payload.cookie || payload.session || ''),
            );
            if (!session) {
              json(res, 400, { ok: false, message: 'cookies required' });
              return;
            }
            const me = await fetchMe(session);
            if (!me) {
              json(res, 401, { ok: false, message: 'Invalid or expired Tailspace session cookie' });
              return;
            }
            json(res, 200, {
              ok: true,
              username: me.username,
              userId: me.userId,
              cookies: session,
            });
            return;
          }

          if (pathOnly === '/api/tailspace/me') {
            if (!cookie) {
              json(res, 401, { ok: false, message: 'not logged in' });
              return;
            }
            const me = await fetchMe(cookie);
            if (!me) {
              json(res, 401, { ok: false, message: 'Invalid or expired Tailspace session' });
              return;
            }
            json(res, 200, { ok: true, ...me, cookies: cookie });
            return;
          }

          if (pathOnly === '/api/tailspace/logout') {
            if (cookie) {
              await remixAction('/logout.data', {}, cookie);
            }
            json(res, 200, { ok: true });
            return;
          }

          if (!cookie) {
            json(res, 401, { ok: false, message: 'Tailspace login required' });
            return;
          }

          if (pathOnly === '/api/tailspace/like') {
            const postId = String(payload.postId ?? '');
            if (!/^\d+$/.test(postId)) {
              json(res, 400, { ok: false, message: 'postId required' });
              return;
            }
            const result = await remixAction('/api/post-toggle-like.data', { postId }, cookie);
            const data = actionPayload(decodeRemix(result.text));
            if (data.error) {
              json(res, 400, { ok: false, message: String(data.error) });
              return;
            }
            json(res, 200, {
              ok: true,
              liked: Boolean(data.liked),
              likeCount: Number(data.likeCount ?? 0),
            });
            return;
          }

          if (pathOnly === '/api/tailspace/star') {
            const comicId = String(payload.comicId ?? '');
            const stars = String(payload.stars ?? '');
            if (!/^\d+$/.test(comicId) || !/^\d+$/.test(stars)) {
              json(res, 400, { ok: false, message: 'comicId and stars required' });
              return;
            }
            const result = await remixAction(
              '/api/update-your-stars.data',
              { comicId, stars },
              cookie,
            );
            const data = actionPayload(decodeRemix(result.text));
            if (data.error) {
              json(res, 400, { ok: false, message: String(data.error) });
              return;
            }
            json(res, 200, { ok: true, stars: Number(stars), data });
            return;
          }

          if (pathOnly === '/api/tailspace/comment') {
            const comment = String(payload.comment || '').trim();
            const postId = payload.postId != null ? String(payload.postId) : '';
            const comicId = payload.comicId != null ? String(payload.comicId) : '';
            if (!comment) {
              json(res, 400, { ok: false, message: 'comment required' });
              return;
            }
            let result;
            if (/^\d+$/.test(postId)) {
              result = await remixAction(
                '/api/post-add-comment.data',
                { postId, comment },
                cookie,
              );
            } else if (/^\d+$/.test(comicId)) {
              result = await remixAction(
                '/api/add-comment.data',
                { comicId, comment },
                cookie,
              );
            } else {
              json(res, 400, { ok: false, message: 'postId or comicId required' });
              return;
            }
            const data = actionPayload(decodeRemix(result.text));
            if (data.error || data.success === false) {
              json(res, 400, { ok: false, message: String(data.error || 'Comment failed') });
              return;
            }
            json(res, 200, { ok: true, data });
            return;
          }

          if (pathOnly === '/api/tailspace/follow') {
            const creatorUserId = String(payload.creatorUserId ?? '');
            const action = String(payload.action || '').toLowerCase();
            if (!/^\d+$/.test(creatorUserId) || (action !== 'follow' && action !== 'unfollow')) {
              json(res, 400, { ok: false, message: 'creatorUserId and action=follow|unfollow required' });
              return;
            }
            const result = await remixAction(
              '/api/follow-artist.data',
              { creatorUserId, action },
              cookie,
            );
            const data = actionPayload(decodeRemix(result.text));
            if (data.error || data.success === false) {
              json(res, 400, { ok: false, message: String(data.error || 'Follow failed') });
              return;
            }
            json(res, 200, { ok: true, following: action === 'follow', data });
            return;
          }

          json(res, 404, { ok: false, message: 'not found' });
        } catch (err) {
          json(res, 502, { ok: false, message: String(err) });
        }
      });

      // ── Feed (following): GET /api/tailspace/feed?page=N ─────────────────
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/tailspace/feed') || req.method !== 'GET') {
          next();
          return;
        }
        const cookie = sessionFromReq(req);
        if (!cookie) {
          json(res, 401, { ok: false, message: 'Tailspace login required' });
          return;
        }
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const page = Math.max(1, parseInt(new URLSearchParams(qs).get('page') || '1', 10) || 1);
        try {
          const remote = await fetch(
            `${TAILSPACE_BASE}/api/get-feed-paginated?page=${page}`,
            { headers: upstreamHeaders(cookie, 'application/json, text/x-script') },
          );
          const text = await remote.text();
          if (!remote.ok) {
            json(res, remote.status, { ok: false, message: `upstream ${remote.status}` });
            return;
          }
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(text) as Record<string, unknown>;
          } catch {
            const decoded = decodeRemix(text);
            payload = (decoded && typeof decoded === 'object'
              ? (decoded as Record<string, unknown>)
              : {}) as Record<string, unknown>;
          }
          const data = (payload?.data && typeof payload.data === 'object'
            ? payload.data
            : payload) as Record<string, unknown>;
          json(res, 200, {
            posts: Array.isArray(data?.posts) ? data.posts : [],
            hasNextPage: Boolean(data?.hasNextPage ?? data?.hasMorePosts),
          });
        } catch (err) {
          json(res, 502, { ok: false, message: String(err) });
        }
      });

      // ── Posts: GET /api/tailspace/posts?page=N ───────────────────────────
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/tailspace/posts') || req.method !== 'GET') {
          next();
          return;
        }
        const cookie = sessionFromReq(req);
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const params = new URLSearchParams(qs);
        const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
        const url = `${TAILSPACE_BASE}/api/get-browse-posts-paginated?page=${page}`;
        try {
          const remote = await fetch(url, {
            headers: upstreamHeaders(cookie, 'application/json'),
          });
          if (!remote.ok) {
            json(res, remote.status, { ok: false, message: `upstream ${remote.status}` });
            return;
          }
          const payload = await remote.json() as Record<string, unknown>;
          const data = (payload?.data && typeof payload.data === 'object'
            ? payload.data
            : payload) as Record<string, unknown>;
          json(res, 200, {
            posts: Array.isArray(data?.posts) ? data.posts : [],
            hasNextPage: Boolean(data?.hasNextPage),
          });
        } catch (err) {
          json(res, 502, { ok: false, message: String(err) });
        }
      });

      // ── Comics list: GET /api/tailspace/comics?... ────────────────────────
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/tailspace/comics') || req.method !== 'GET') {
          next();
          return;
        }
        const cookie = sessionFromReq(req);
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const params = new URLSearchParams(qs);
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
            headers: upstreamHeaders(cookie, 'text/x-turbo-stream, application/json, */*', `${TAILSPACE_BASE}/browse`),
          });
          if (!remote.ok) {
            json(res, remote.status, { ok: false, message: `upstream ${remote.status}` });
            return;
          }
          json(res, 200, parseTailspaceComics(await remote.text()));
        } catch (err) {
          json(res, 502, { ok: false, message: String(err) });
        }
      });

      // ── Comic detail: GET /api/tailspace/comic?name=X ────────────────────
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = req.url?.split('?')[0] || '';
        if (pathOnly !== '/api/tailspace/comic' || req.method !== 'GET') {
          next();
          return;
        }
        const cookie = sessionFromReq(req);
        const qs = req.url!.includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '';
        const name = (new URLSearchParams(qs).get('name') || '').trim();
        if (!name) {
          json(res, 400, { ok: false, message: 'name required' });
          return;
        }
        const url = `${TAILSPACE_BASE}/c/${encodeURIComponent(name)}.data`;
        try {
          const remote = await fetch(url, {
            headers: upstreamHeaders(cookie, 'text/x-turbo-stream, application/json, */*'),
          });
          if (!remote.ok) {
            json(res, remote.status, { ok: false, message: `upstream ${remote.status}` });
            return;
          }
          json(res, 200, parseTailspaceComicDetail(await remote.text()));
        } catch (err) {
          json(res, 502, { ok: false, message: String(err) });
        }
      });

      // ── Comments: GET /api/tailspace/comments?username=X&postId=N ────────
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/tailspace/comments') || req.method !== 'GET') {
          next();
          return;
        }
        const cookie = sessionFromReq(req);
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const params = new URLSearchParams(qs);
        const username = (params.get('username') || '').trim();
        const postId = (params.get('postId') || '').trim();
        if (!username || !/^\d+$/.test(postId) || username.includes('/') || username.includes('..')) {
          json(res, 400, { ok: false, message: 'username and postId required' });
          return;
        }
        const url = `${TAILSPACE_BASE}/artist/${encodeURIComponent(username)}/post/${postId}.data`;
        try {
          const remote = await fetch(url, {
            headers: upstreamHeaders(cookie, 'text/x-turbo-stream, application/json, */*'),
          });
          if (!remote.ok) {
            json(res, remote.status, { ok: false, message: `upstream ${remote.status}` });
            return;
          }
          json(res, 200, { comments: parseTailspaceComments(await remote.text()) });
        } catch (err) {
          json(res, 502, { ok: false, message: String(err) });
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
  const decoded = Array.isArray(data) ? tsDecodePool(data) : data;
  const routeYourStars = findKey(decoded, 'yourStars');
  const routeBookmarked = findKey(decoded, 'isBookmarked') ?? findKey(decoded, 'bookmarked');
  const yourStars =
    typeof comic.yourStars === 'number'
      ? comic.yourStars
      : typeof routeYourStars === 'number'
        ? routeYourStars
        : null;
  const bookmarked = Boolean(
    comic.isBookmarked ?? comic.bookmarked ?? routeBookmarked ?? false,
  );

  return {
    id: comic.id,
    name: comic.name,
    category: comic.category ?? null,
    state: comic.state ?? null,
    numberOfPages: Number(comic.numberOfPages || pages.length),
    description: comic.description ?? null,
    avgStars: comic.avgStars ?? null,
    yourStars,
    bookmarked,
    commentCount: comments.length,
    thumbnailVersion: comic.thumbnailVersion ?? 0,
    artistName: artist.name || artist.creatorUsername || '',
    artistDisplayName: artist.name || artist.creatorUsername || '',
    creatorUserId:
      typeof artist.creatorUserId === 'number' ? artist.creatorUserId : null,
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
