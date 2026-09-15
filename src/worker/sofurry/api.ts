/**
 * SoFurry API client.
 *
 * Auth: Laravel session cookies via form POST /login (email + password + CSRF).
 * Lists: /api/profile (galleries + likes JSON) and /browse.data (Inertia deferred pack).
 * Detail: /s/{id}.data for artwork/stories; story body via signed .txt contentUrl.
 *
 * Client sends cookies as `X-Sofurry-Cookies`; the proxy forwards Cookie.
 */
import type { Post, Tag } from "@/worker/api/returnTypes";

const SOFURRY_ORIGIN = "https://www.sofurry.com";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const softIdByNumeric = new Map<number, string>();

function rememberSoftId(softId: string, numericId: number) {
  if (softId && numericId) softIdByNumeric.set(numericId, softId);
}

export function softIdForNumeric(id: number): string | null {
  return softIdByNumeric.get(id) || null;
}

let activeCookies: string | null = null;
const sessionClearedListeners = new Set<() => void>();

export function setActiveSofurryCookies(cookies: string | null | undefined) {
  const v = (cookies || "").trim();
  activeCookies = v || null;
}

export function currentSofurryCookies(): string | null {
  return activeCookies;
}

export function isSofurryLoggedIn(): boolean {
  return !!activeCookies;
}

export function onSofurrySessionCleared(cb: () => void): () => void {
  sessionClearedListeners.add(cb);
  return () => sessionClearedListeners.delete(cb);
}

function notifySessionCleared() {
  activeCookies = null;
  for (const cb of sessionClearedListeners) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

function noteSessionRejected(response: Response) {
  if (response.headers.get("X-Sofurry-Session-Rejected") === "1") {
    notifySessionCleared();
  }
}

function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/sofurry`;
}

async function sofurryFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (activeCookies) headers.set("X-Sofurry-Cookies", activeCookies);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const response = await fetch(`${proxyBase()}${path}`, { ...init, headers });
  noteSessionRejected(response);
  return response;
}

/** Decode SoFurry hashid → numeric Post.id (same alphabet as hashids default). */
export function hashidToNumericId(hashid: string): number {
  const s = String(hashid || "").trim();
  if (!s) return 0;
  let n = 0;
  for (const ch of s) {
    const idx = BASE62.indexOf(ch);
    if (idx < 0) return Math.abs(hashString(s)) || 1;
    n = n * 62 + idx;
    if (n > Number.MAX_SAFE_INTEGER) return Math.abs(hashString(s)) || 1;
  }
  return n || Math.abs(hashString(s)) || 1;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function extFromUrl(url?: string | null): string {
  if (!url) return "jpg";
  try {
    const path = new URL(url, SOFURRY_ORIGIN).pathname.toLowerCase();
    const ext = path.split(".").pop() || "";
    if (/^[a-z0-9]{1,5}$/.test(ext)) return ext;
  } catch {
    /* ignore */
  }
  return "jpg";
}

function toEpoch(iso?: string | null): number {
  if (!iso) return Math.floor(Date.now() / 1000);
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : Math.floor(Date.now() / 1000);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object" && typeof (x as { name?: string }).name === "string") {
        return (x as { name: string }).name;
      }
      return "";
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

function rewriteMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, SOFURRY_ORIGIN);
    const host = u.hostname.toLowerCase();
    if (
      host === "cdn.sofurryfiles.com" ||
      host === "s3.sofurryfiles.com" ||
      host.endsWith(".sofurryfiles.com") ||
      host === "www.sofurry.com" ||
      host === "sofurry.com"
    ) {
      return `${proxyBase()}/media${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return url;
}

type SoftContentItem = {
  id?: string;
  type?: string | null;
  extension?: string | null;
  displayUrl?: string | null;
  meta?: {
    width?: number | null;
    height?: number | null;
    wordCount?: number | null;
    duration?: number | null;
  } | null;
};

type SoftSubmission = {
  id?: string;
  title?: string;
  description?: string | null;
  type?: string | null;
  category?: string | null;
  thumbUrl?: string | null;
  coverUrl?: string | null;
  contentUrl?: string | null;
  content?: SoftContentItem[] | string | null;
  publishedAt?: string | null;
  created_at?: string | null;
  author?:
    | string
    | {
        name?: string;
        username?: string;
        handle?: string;
        avatar?: string | null;
        avatarUrl?: string | null;
      }
    | null;
  authorName?: string | null;
  authorAvatar?: string | null;
  user?: { name?: string; avatar?: string | null; id?: string | number } | null;
  tags?: unknown;
  likes?: number | null;
  favorite_count?: number | null;
  views?: number | null;
  isNsfw?: boolean | null;
  rating?: number | string | null;
  body?: string | null;
};

export type SofurryMeta = {
  id: string;
  type: string;
  author: string;
  contentUrl?: string | null;
  detailsLoaded?: boolean;
};

function authorNameOf(raw: SoftSubmission): string {
  if (typeof raw.author === "string" && raw.author.trim()) return raw.author.trim();
  if (raw.author && typeof raw.author === "object") {
    const n =
      raw.author.username || raw.author.handle || raw.author.name || "";
    if (n.trim()) return n.trim();
  }
  if (raw.authorName?.trim()) return raw.authorName.trim();
  if (raw.user?.name?.trim()) return raw.user.name.trim();
  return "unknown";
}

function primaryContent(raw: SoftSubmission): SoftContentItem | null {
  if (!Array.isArray(raw.content) || !raw.content.length) return null;
  return raw.content[0] || null;
}

function submissionType(raw: SoftSubmission): string {
  return String(raw.type || raw.category || "artwork").toLowerCase();
}

function isStoryType(t: string): boolean {
  return /^(shortstory|writing|story|journal|document|text)$/i.test(t);
}

function isArtworkType(t: string): boolean {
  return /^(artwork|image|photography|photo|drawing)$/i.test(t) || !isStoryType(t);
}

/** Prefer artwork + stories; allow unknown types through as best-effort. */
function includeSubmission(raw: SoftSubmission): boolean {
  const t = submissionType(raw);
  if (!t) return true;
  if (isStoryType(t) || isArtworkType(t)) return true;
  const item = primaryContent(raw);
  return !!(raw.thumbUrl || raw.contentUrl || raw.coverUrl || item?.displayUrl);
}

function adaptSubmission(raw: SoftSubmission, detailsLoaded = false): Post | null {
  const softId = String(raw.id || "").trim();
  if (!softId) return null;
  if (!includeSubmission(raw)) return null;

  const t = submissionType(raw);
  const story = isStoryType(t);
  const author = authorNameOf(raw);
  const item = primaryContent(raw);
  const contentDisplay = item?.displayUrl || null;
  const thumb = rewriteMediaUrl(raw.thumbUrl || raw.coverUrl || null);
  let fileUrl = rewriteMediaUrl(
    contentDisplay || raw.contentUrl || raw.coverUrl || raw.thumbUrl || null,
  );
  let ext =
    (item?.extension || "").replace(/^\./, "").toLowerCase() ||
    extFromUrl(contentDisplay || raw.contentUrl || raw.thumbUrl || "");
  const width = Number(item?.meta?.width) || 0;
  const height = Number(item?.meta?.height) || 0;

  if (story || ext === "txt") {
    ext = "txt";
    if (!fileUrl) fileUrl = thumb;
  }

  const tags = asStringArray(raw.tags);
  const created = toEpoch(raw.publishedAt || raw.created_at);
  const score = Number(raw.likes ?? raw.favorite_count ?? 0) || 0;
  const favCount = Number(raw.favorite_count ?? raw.likes ?? 0) || 0;
  const nsfw =
    !!raw.isNsfw ||
    (typeof raw.rating === "number" && raw.rating > 0) ||
    (typeof raw.rating === "string" && /^(e|explicit|nsfw|[1-9])/i.test(raw.rating));

  const post = {
    id: hashidToNumericId(softId),
    created_at: String(raw.publishedAt || raw.created_at || created),
    updated_at: String(raw.publishedAt || raw.created_at || created),
    file: {
      width,
      height,
      ext: ext || "jpg",
      size: 0,
      md5: softId,
      url: fileUrl,
    },
    preview: { width: 0, height: 0, url: thumb },
    sample: {
      width,
      height,
      url: fileUrl || thumb,
      has: true,
    },
    score: { up: score, down: 0, total: score },
    tags: {
      general: tags,
      artist: author && author !== "unknown" ? [author] : [],
      copyright: [],
      character: [],
      species: [],
      invalid: [],
      meta: story || ext === "txt" ? ["story"] : [],
      lore: [],
    },
    locked_tags: [],
    change_seq: created,
    flags: {
      pending: false,
      flagged: false,
      note_locked: false,
      status_locked: false,
      rating_locked: false,
      deleted: false,
    },
    rating: nsfw ? "e" : "s",
    fav_count: favCount,
    sources: [`${SOFURRY_ORIGIN}/s/${softId}`],
    pools: [],
    relationships: {
      parent_id: undefined,
      has_children: false,
      has_active_children: false,
      children: [],
    },
    approver_id: undefined,
    uploader_id: 0,
    description: String(
      raw.description ||
        (typeof raw.content === "string" ? raw.content : "") ||
        raw.body ||
        "",
    ),
    comment_count: 0,
    is_favorited: false,
    has_notes: false,
    __meta: {
      kind: story || ext === "txt" ? "story" : undefined,
      sofurry: {
        id: softId,
        type: t,
        author,
        contentUrl: contentDisplay || raw.contentUrl || null,
        detailsLoaded,
      } satisfies SofurryMeta,
    },
  } as unknown as Post;

  rememberSoftId(softId, post.id);
  return post;
}

/* ─── Inertia / Remix-style .data pack unpacker ─── */

function unpackNode(node: unknown, pack: unknown[]): unknown {
  if (Array.isArray(node)) {
    return node.map((x) =>
      typeof x === "number"
        ? x < 0 || x >= pack.length
          ? null
          : unpackNode(pack[x], pack)
        : unpackNode(x, pack),
    );
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      let key: string = k;
      if (k.startsWith("_") && /^\d+$/.test(k.slice(1))) {
        const ki = Number(k.slice(1));
        const resolved = ki >= 0 && ki < pack.length ? unpackNode(pack[ki], pack) : k;
        key = typeof resolved === "string" ? resolved : String(resolved ?? k);
      }
      if (typeof v === "number") {
        out[key] =
          v < 0 || v >= pack.length ? (v < 0 ? null : v) : unpackNode(pack[v], pack);
      } else {
        out[key] = unpackNode(v, pack);
      }
    }
    return out;
  }
  return node;
}

/** Unpack SoFurry `.data` body: initial JSON pack + optional `P#:` deferred packs. */
export function unpackSofurryData(raw: string): unknown {
  const lines = String(raw || "").split(/\r?\n/).filter((l) => l.length > 0);
  if (!lines.length) return null;

  let pack: unknown[] = JSON.parse(lines[0]!);
  let deferredRoot: unknown = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const m = /^P\d+:/.exec(line);
    if (!m) continue;
    const payload = line.slice(m[0].length);
    const deferred = JSON.parse(payload) as unknown[];
    if (!Array.isArray(deferred)) continue;
    // Absolute indices: deferred[j] continues after pack0.
    const offset = pack.length;
    pack = pack.concat(deferred);
    deferredRoot = deferred[0];
    void offset;
  }

  if (deferredRoot != null) {
    return unpackNode(deferredRoot, pack);
  }
  // No deferred: unpack first-line root (detail pages).
  if (Array.isArray(pack) && pack.length) {
    return unpackNode(pack[0], pack);
  }
  return null;
}

function digSubmissions(payload: unknown): {
  data: SoftSubmission[];
  currentPage: number;
  lastPage: number;
  total: number;
} {
  const empty = { data: [] as SoftSubmission[], currentPage: 1, lastPage: 1, total: 0 };
  if (!payload || typeof payload !== "object") return empty;

  const root = payload as Record<string, unknown>;
  // browse deferred root: { submissions, warnings }
  let subs = root.submissions;
  // detail / nested
  if (!subs && root.data && typeof root.data === "object") {
    const d = root.data as Record<string, unknown>;
    subs = d.submissions || d.gallery || d.likes || d;
  }
  // /api/profile shape: { gallery: { data, ... }, likes: { data, ... } }
  if (!subs && (root.gallery || root.likes)) {
    return empty; // caller handles profile directly
  }

  if (!subs || typeof subs !== "object") return empty;
  const s = subs as Record<string, unknown>;
  const data = Array.isArray(s.data) ? (s.data as SoftSubmission[]) : [];
  return {
    data,
    currentPage: Number(s.currentPage ?? s.current_page ?? 1) || 1,
    lastPage: Number(s.lastPage ?? s.last_page ?? 1) || 1,
    total: Number(s.total ?? data.length) || data.length,
  };
}

type SoftPostsResult = {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
};

function postsResponseFromSubs(
  data: SoftSubmission[],
  page: number,
  limit: number,
  lastPage: number,
  total: number,
): SoftPostsResult {
  const posts = data.map((raw) => adaptSubmission(raw)).filter((p): p is Post => !!p);
  return {
    posts,
    total: total || posts.length,
    page,
    limit,
    lastPage:
      lastPage ||
      Math.max(1, Math.ceil((total || posts.length) / Math.max(1, limit))),
  };
}

export type SofurryAuthResult = {
  ok: boolean;
  cookies?: string;
  username?: string;
  error?: string;
};

export async function loginSofurry(args: {
  email: string;
  password: string;
}): Promise<SofurryAuthResult> {
  const response = await fetch(`${proxyBase()}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email: args.email,
      password: args.password,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as SofurryAuthResult;
  if (data.ok && data.cookies) {
    setActiveSofurryCookies(data.cookies);
  }
  return data;
}

export async function whoami(cookies?: string | null): Promise<{
  id?: string | number;
  name?: string;
  avatar?: string | null;
} | null> {
  if (cookies) setActiveSofurryCookies(cookies);
  if (!activeCookies) return null;
  const response = await sofurryFetch("/api/profile");
  if (response.status === 401 || response.status === 403) {
    notifySessionCleared();
    return null;
  }
  if (!response.ok) return null;
  const data = (await response.json()) as {
    user?: { id?: string | number; name?: string; avatar?: string | null };
  };
  return data.user || null;
}

export async function verifyCookies(cookies: string): Promise<boolean> {
  setActiveSofurryCookies(cookies);
  const me = await whoami();
  return !!me?.name;
}

async function fetchProfileList(args: {
  username: string;
  folder: "gallery" | "favorites" | "likes";
  page: number;
  limit: number;
}): Promise<SoftPostsResult> {
  const params = new URLSearchParams();
  params.set("username", args.username);
  params.set("folder", args.folder === "favorites" ? "likes" : args.folder);
  params.set("page", String(Math.max(1, args.page)));
  params.set("perPage", String(Math.max(1, Math.min(100, args.limit || 24))));

  const response = await sofurryFetch(`/api/profile?${params}`);
  if (!response.ok) {
    throw new Error(`SoFurry profile failed (${response.status})`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const key = args.folder === "gallery" ? "gallery" : "likes";
  const block = (data[key] || data.gallery || data.likes) as
    | {
        data?: SoftSubmission[];
        current_page?: number;
        last_page?: number;
        total?: number;
        per_page?: number;
      }
    | undefined;
  const rows = Array.isArray(block?.data) ? block!.data! : [];
  return postsResponseFromSubs(
    rows,
    Number(block?.current_page ?? args.page) || args.page,
    Number(block?.per_page ?? args.limit) || args.limit,
    Number(block?.last_page ?? 1) || 1,
    Number(block?.total ?? rows.length) || rows.length,
  );
}

export async function searchBrowse(args: {
  tags?: string;
  page?: number;
  limit?: number;
  user?: string;
  favorites?: boolean;
}): Promise<SoftPostsResult> {
  const page = Math.max(1, args.page || 1);
  const limit = Math.max(1, Math.min(100, args.limit || 24));
  const tags = (args.tags || "").trim();

  // User gallery / likes via clean JSON API.
  if (args.user) {
    return fetchProfileList({
      username: args.user,
      folder: args.favorites ? "likes" : "gallery",
      page,
      limit,
    });
  }

  // Logged-in "My Likes" without username: resolve via whoami then profile likes.
  if (args.favorites && activeCookies) {
    const me = await whoami();
    if (me?.name) {
      return fetchProfileList({
        username: String(me.name),
        folder: "likes",
        page,
        limit,
      });
    }
  }

  const params = new URLSearchParams();
  if (tags) params.set("q", tags);
  params.set("page", String(page));
  // Request near our limit; server may still return up to 100.
  const response = await sofurryFetch(`/browse.data?${params}`);
  if (!response.ok) {
    throw new Error(`SoFurry browse failed (${response.status})`);
  }
  const raw = await response.text();
  const unpacked = unpackSofurryData(raw);
  const { data, currentPage, lastPage, total } = digSubmissions(unpacked);
  // Client-side page size trim if server over-fetches.
  const sliced = data.slice(0, limit);
  return postsResponseFromSubs(sliced, currentPage || page, limit, lastPage, total);
}

export async function fetchSubmission(args: {
  id: string | number;
}): Promise<Post | null> {
  const softId =
    typeof args.id === "string" && /[A-Za-z]/.test(args.id)
      ? args.id
      : softIdForNumeric(Number(args.id)) || String(args.id);
  if (!softId) return null;

  const response = await sofurryFetch(`/s/${encodeURIComponent(softId)}.data`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`SoFurry submission failed (${response.status})`);
  const raw = await response.text();
  const unpacked = unpackSofurryData(raw) as Record<string, unknown> | null;
  if (!unpacked || typeof unpacked !== "object") return null;

  const sub = digSubmission(unpacked);
  if (!sub) return null;

  const post = adaptSubmission(sub, true);
  if (!post) return null;

  // Stories: hydrate description from content .txt when needed.
  const meta = (post as Post & { __meta?: { kind?: string; sofurry?: SofurryMeta } })
    .__meta;
  if (meta?.kind === "story") {
    const contentUrl = meta.sofurry?.contentUrl || post.file?.url;
    if (contentUrl && String(post.description || "").length < 40) {
      try {
        const textUrl = contentUrl.startsWith("http")
          ? `${proxyBase()}/media-url?url=${encodeURIComponent(contentUrl)}`
          : contentUrl;
        const tr = await fetch(textUrl, {
          headers: activeCookies ? { "X-Sofurry-Cookies": activeCookies } : {},
        });
        if (tr.ok) {
          const text = await tr.text();
          if (text) post.description = text.slice(0, 500_000);
        }
      } catch {
        /* best-effort */
      }
    }
  }
  return post;
}

function digSubmission(unpacked: Record<string, unknown>): SoftSubmission | null {
  const direct = unpacked.submission;
  if (direct && typeof direct === "object") return direct as SoftSubmission;

  const data = unpacked.data;
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).submission;
    if (nested && typeof nested === "object") return nested as SoftSubmission;
  }

  // Inertia single-fetch root: { root, "routes/submission.$id": { data: { submission } } }
  for (const [key, value] of Object.entries(unpacked)) {
    if (!/submission/i.test(key) || !value || typeof value !== "object") continue;
    const route = value as Record<string, unknown>;
    const routeData = route.data;
    if (routeData && typeof routeData === "object") {
      const sub = (routeData as Record<string, unknown>).submission;
      if (sub && typeof sub === "object") return sub as SoftSubmission;
    }
    if (route.submission && typeof route.submission === "object") {
      return route.submission as SoftSubmission;
    }
  }

  if (unpacked.id && (unpacked.thumbUrl || unpacked.content || unpacked.contentUrl)) {
    return unpacked as SoftSubmission;
  }
  return null;
}

export function sofurryMetaFromPost(post: Post): SofurryMeta | null {
  const meta = (post as Post & { __meta?: { sofurry?: SofurryMeta } }).__meta?.sofurry;
  return meta || null;
}

/** Merge detail into a list hit (keeps feed pageNumber / origin meta from the caller). */
export function adaptDetails(raw: SoftSubmission): Post | null {
  return adaptSubmission(raw, true);
}

export async function fetchSubmissionByNumericId(id: number): Promise<Post | null> {
  // Without reverse hashid we cannot map numeric → soft id. Caller should pass soft id via __meta.
  // Attempt browse is too heavy; return null and let UI use list cache.
  void id;
  return null;
}

export async function searchTags(args: { query: string; limit?: number }): Promise<Tag[]> {
  const q = (args.query || "").trim();
  if (!q) return [];
  // SoFurry has no public tag suggest API; synthesize from query tokens.
  const limit = Math.max(1, Math.min(20, args.limit || 10));
  return [
    {
      id: hashString(q) || 1,
      name: q,
      post_count: 0,
      category: 0,
      related_tags: "",
      related_tags_updated_at: new Date(0),
      is_locked: false,
      created_at: new Date(0),
      updated_at: new Date(0),
    } as Tag,
  ].slice(0, limit);
}

export async function fetchFeed(args?: { page?: number; limit?: number }): Promise<SoftPostsResult> {
  const page = Math.max(1, args?.page || 1);
  const limit = Math.max(1, Math.min(100, args?.limit || 24));
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("perPage", String(limit));
  const response = await sofurryFetch(`/api/feed?${params}`);
  if (response.status === 401 || response.status === 403) {
    notifySessionCleared();
    throw new Error("SoFurry feed requires login");
  }
  if (!response.ok) throw new Error(`SoFurry feed failed (${response.status})`);
  const data = (await response.json()) as {
    data?: SoftSubmission[];
    current_page?: number;
    last_page?: number;
    total?: number;
    per_page?: number;
  };
  // Feed may wrap submissions differently — accept array or paginator.
  const rows = Array.isArray(data.data)
    ? data.data
    : Array.isArray(data)
      ? (data as SoftSubmission[])
      : [];
  return postsResponseFromSubs(
    rows,
    Number(data.current_page ?? page) || page,
    Number(data.per_page ?? limit) || limit,
    Number(data.last_page ?? 1) || 1,
    Number(data.total ?? rows.length) || rows.length,
  );
}

/**
 * Toggle like/favorite. Endpoint discovered at runtime via common patterns;
 * returns false if the write API is unavailable.
 */
export async function favoriteSubmission(args: {
  id: string;
  like?: boolean;
}): Promise<boolean> {
  const softId = args.id;
  const like = args.like !== false;
  // Try JSON toggle endpoints used by similar Laravel apps; proxy forwards cookies.
  const attempts: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [
    {
      path: `/api/submissions/${encodeURIComponent(softId)}/like`,
      method: like ? "POST" : "DELETE",
    },
    {
      path: `/api/like`,
      method: "POST",
      body: { id: softId, like },
    },
    {
      path: `/s/${encodeURIComponent(softId)}/like`,
      method: like ? "POST" : "DELETE",
    },
  ];
  for (const attempt of attempts) {
    try {
      const response = await sofurryFetch(attempt.path, {
        method: attempt.method,
        headers: attempt.body
          ? { "Content-Type": "application/json" }
          : undefined,
        body: attempt.body ? JSON.stringify(attempt.body) : undefined,
      });
      if (response.ok || response.status === 204) return true;
      if (response.status === 404 || response.status === 405) continue;
      if (response.status === 401 || response.status === 403) {
        notifySessionCleared();
        return false;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

export async function listFollowing(): Promise<
  Array<{ name: string; avatar?: string | null }>
> {
  // Best-effort: profile endpoint may expose following; otherwise empty.
  const me = await whoami();
  if (!me?.name) return [];
  try {
    const params = new URLSearchParams({ username: String(me.name), folder: "gallery" });
    const response = await sofurryFetch(`/api/following?${params}`);
    if (!response.ok) return [];
    const data = (await response.json()) as {
      data?: Array<{ name?: string; username?: string; avatar?: string | null }>;
      following?: Array<{ name?: string; username?: string; avatar?: string | null }>;
    };
    const rows = data.data || data.following || [];
    return rows
      .map((u) => ({
        name: String(u.name || u.username || "").trim(),
        avatar: u.avatar || null,
      }))
      .filter((u) => !!u.name);
  } catch {
    return [];
  }
}
