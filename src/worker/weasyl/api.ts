/**
 * Weasyl API client (https://projects.weasyl.com/weasylapi/).
 *
 * JSON endpoints go through /api/weasyl/* because weasyl.com has no CORS headers.
 * Tag search uses an HTML scrape of /search (no JSON search API exists); the
 * Python proxy in serve.py performs the scrape and returns JSON.
 *
 * Auth: X-Weasyl-API-Key header (sent by the proxy when `key` query param is present).
 * Without a key, only SFW/general content is visible.
 */

import type { Post, PostTags, Tag } from "@/worker/api/returnTypes";

// ---------------------------------------------------------------------------
// Weasyl wire types
// ---------------------------------------------------------------------------

export interface WeasylMediaItem {
  mediaid: number | null;
  url: string;
  links?: {
    cover?: WeasylMediaItem[];
  };
}

export interface WeasylMedia {
  submission?: WeasylMediaItem[];
  thumbnail?: WeasylMediaItem[];
  cover?: WeasylMediaItem[];
}

/** Basic submission object (frontpage / gallery list item). */
export interface WeasylSubmission {
  submitid: number;
  title: string;
  owner: string;
  owner_login: string;
  posted_at: string;
  rating: string;
  type: string;
  subtype?: string;
  tags: string[];
  media: WeasylMedia;
}

/** Detailed submission object from /view endpoint. */
export interface WeasylSubmissionDetail extends WeasylSubmission {
  description?: string;
  comments?: number;
  favorites?: number;
  views?: number;
  favorited?: boolean;
  embedlink?: string | null;
  friends_only?: boolean;
}

export interface WeasylGalleryResponse {
  submissions: WeasylSubmission[];
  backid: number | null;
  nextid: number | null;
}

export interface WeasylUserView {
  username: string;
  login_name: string;
  media?: WeasylMedia;
  statistics?: {
    submissions?: number;
    faves_received?: number;
    page_views?: number;
  };
}

export type WeasylMeta = {
  detailsLoaded?: boolean;
};

export function weasylMeta(detailsLoaded = false): WeasylMeta {
  return { detailsLoaded };
}

// ---------------------------------------------------------------------------
// Proxy helpers
// ---------------------------------------------------------------------------

function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/weasyl`;
}

function buildUrl(path: string, params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    q.set(key, String(value));
  }
  const qs = q.toString();
  return qs ? `${proxyBase()}/${path}?${qs}` : `${proxyBase()}/${path}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    let msg = `Weasyl proxy error: ${response.status} ${response.statusText}`;
    try {
      const data = await response.json() as { error?: { name?: string; code?: string } };
      if (data.error?.name) msg = `Weasyl: ${data.error.name}`;
      else if (data.error?.code) msg = `Weasyl: ${data.error.code}`;
    } catch {
      // ignore parse error
    }
    throw new Error(msg);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

function emptyTags(): PostTags {
  return {
    general: [],
    species: [],
    character: [],
    copyright: [],
    artist: [],
    invalid: [],
    lore: [],
    meta: [],
  };
}

function adaptRating(rating: string | undefined): "s" | "q" | "e" {
  switch ((rating || "").toLowerCase()) {
    case "explicit": return "e";
    case "mature":
    case "moderate": return "q";
    default: return "s";
  }
}

function pickMediaUrl(items?: WeasylMediaItem[]): string | null {
  if (!items || !items.length) return null;
  return items[0]?.url || null;
}

export function submissionUrl(sub: { submitid: number; owner_login: string; title?: string }): string {
  // Canonical Weasyl submission URL
  return `https://www.weasyl.com/~${sub.owner_login}/submissions/${sub.submitid}`;
}

export function adaptSubmission(sub: WeasylSubmission): Post {
  const tags = emptyTags();
  tags.general = (sub.tags || []).filter(Boolean);
  if (sub.owner_login) tags.artist = [sub.owner_login];

  const thumbUrl = pickMediaUrl(sub.media?.thumbnail);
  const submissionUrl_ = pickMediaUrl(sub.media?.submission);
  const coverUrl = pickMediaUrl(sub.media?.cover);
  // Use submission file as full, cover as sample, thumbnail as preview
  const fullUrl = submissionUrl_ || coverUrl || thumbUrl;
  const sampleUrl = coverUrl || submissionUrl_ || thumbUrl;
  const previewUrl = thumbUrl || sampleUrl;

  // Guess ext from URL
  const ext = (fullUrl || "").split(".").pop()?.split("?")[0] || "";
  const isMedia = /^(jpg|jpeg|png|gif|webp|mp4|webm|swf|pdf)$/i.test(ext);

  const post: Post = {
    id: sub.submitid,
    created_at: sub.posted_at || "",
    updated_at: sub.posted_at || "",
    file: {
      url: isMedia ? fullUrl : null,
      ext,
      width: 0,
      height: 0,
      size: 0,
      md5: "",
    },
    preview: {
      url: previewUrl || "",
      width: 0,
      height: 0,
    },
    sample: {
      has: !!sampleUrl,
      url: sampleUrl || "",
      width: 0,
      height: 0,
    },
    score: { up: 0, down: 0, total: 0 },
    tags,
    locked_tags: [],
    change_seq: 0,
    flags: {
      pending: false,
      flagged: false,
      note_locked: false,
      status_locked: false,
      rating_locked: false,
      deleted: false,
    },
    rating: adaptRating(sub.rating),
    fav_count: 0,
    sources: [submissionUrl({ submitid: sub.submitid, owner_login: sub.owner_login, title: sub.title })],
    pools: [],
    relationships: {
      has_children: false,
      has_active_children: false,
      children: [],
    },
    uploader_id: 0,
    uploader_name: sub.owner_login,
    description: sub.title || "",
    comment_count: 0,
    is_favorited: false,
    has_notes: false,
  };

  return post;
}

export function adaptDetail(sub: WeasylSubmissionDetail): Post {
  const base = adaptSubmission(sub);
  if (sub.description) base.description = sub.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (sub.favorites != null) base.fav_count = sub.favorites;
  if (sub.comments != null) base.comment_count = sub.comments;
  if (sub.views != null) base.score = { up: sub.views, down: 0, total: sub.views };
  if (sub.favorited != null) base.is_favorited = sub.favorited;
  return base;
}

// ---------------------------------------------------------------------------
// Search tag mapping
// ---------------------------------------------------------------------------

export interface MappedWeasylSearch {
  q: string;
  favsMe: boolean;
  username: string | null;
  orderby?: string;
  random?: boolean;
}

export function mapSearchTags(tags: string[]): MappedWeasylSearch {
  const terms: string[] = [];
  const mapped: MappedWeasylSearch = { q: "", favsMe: false, username: null };

  for (const raw of tags.filter(Boolean)) {
    const tag = raw.trim();
    const lower = tag.toLowerCase();

    if (lower === "favs:me" || lower === "fav:me") {
      mapped.favsMe = true;
      continue;
    }
    if (lower.startsWith("user:") || lower.startsWith("artist:")) {
      mapped.username = tag.slice(tag.indexOf(":") + 1);
      continue;
    }
    if (lower.startsWith("order:")) {
      // Weasyl HTML search has limited sort options; map what we can
      if (lower === "order:score" || lower === "order:favcount") mapped.orderby = "popular";
      else if (lower === "order:random") mapped.random = true;
      // default is newest; no-op for other orders
      continue;
    }

    // Translate e621-style tags to Weasyl search syntax
    // Weasyl uses same - prefix for negation, spaces between terms
    terms.push(tag.replace(/_/g, " "));
  }

  mapped.q = terms.join(" ");
  return mapped;
}

// ---------------------------------------------------------------------------
// Cursor pagination cache
// ---------------------------------------------------------------------------

// Keyed by serialized search params + page index → nextid for that page
// This lets us advance from page N to page N+1 without re-fetching.
const nextidCache = new Map<string, Map<number, number>>();

function searchCacheKey(mapped: MappedWeasylSearch): string {
  return JSON.stringify({ q: mapped.q, username: mapped.username, favsMe: mapped.favsMe });
}

function getCachedNextid(key: string, page: number): number | null {
  const forKey = nextidCache.get(key);
  return forKey?.get(page) ?? null;
}

function setCachedNextid(key: string, page: number, nextid: number | null): void {
  if (!nextidCache.has(key)) nextidCache.set(key, new Map());
  const forKey = nextidCache.get(key)!;
  if (nextid != null) forKey.set(page, nextid);
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Fetch the Weasyl frontpage feed. Used when no tags are specified.
 * Returns up to `count` submissions newest-first.
 */
export async function fetchFrontpage(args: {
  apiKey?: string | null;
  count?: number;
}): Promise<Post[]> {
  const url = buildUrl("frontpage", {
    count: args.count ?? 75,
    key: args.apiKey ?? undefined,
  });
  const data = await fetchJson<WeasylSubmission[]>(url);
  return (data || []).map(adaptSubmission);
}

/**
 * Fetch a single submission by ID.
 */
export async function fetchSubmission(args: {
  id: number;
  apiKey?: string | null;
}): Promise<Post> {
  const url = buildUrl(`submission/${args.id}`, {
    anyway: "1",
    key: args.apiKey ?? undefined,
  });
  const data = await fetchJson<WeasylSubmissionDetail>(url);
  return adaptDetail(data);
}

/**
 * Search submissions. Routes to:
 * - frontpage (no tags, no user, no favs)
 * - gallery (user:X specified)
 * - favorites (favs:me specified)
 * - HTML search scrape (tags provided)
 */
export async function searchSubmissions(args: {
  tags: string[];
  page: number;
  limit: number;
  apiKey?: string | null;
  username?: string | null;
}): Promise<{ posts: Post[]; total: number }> {
  const mapped = mapSearchTags(args.tags);
  const page = Math.max(1, args.page || 1);
  const limit = Math.min(100, Math.max(1, args.limit || 30));
  const maybeShuffle = (posts: Post[]) =>
    mapped.random ? [...posts].sort(() => Math.random() - 0.5) : posts;

  // favs:me
  if (mapped.favsMe) {
    if (!args.username) throw new Error("Log in to Weasyl to browse your favorites.");
    const cacheKey = searchCacheKey(mapped);
    const prevNextid = page > 1 ? getCachedNextid(cacheKey, page - 1) : null;
    const result = await fetchUserFavorites({
      login: args.username,
      apiKey: args.apiKey,
      count: limit,
      nextid: prevNextid,
    });
    setCachedNextid(cacheKey, page, result.nextid);
    return { posts: maybeShuffle(result.posts), total: result.posts.length };
  }

  // user gallery
  if (mapped.username) {
    const cacheKey = searchCacheKey(mapped);
    const prevNextid = page > 1 ? getCachedNextid(cacheKey, page - 1) : null;
    const url = buildUrl(`gallery/${mapped.username}`, {
      count: limit,
      nextid: prevNextid ?? undefined,
      key: args.apiKey ?? undefined,
    });
    const data = await fetchJson<WeasylGalleryResponse>(url);
    setCachedNextid(cacheKey, page, data.nextid);
    const posts = maybeShuffle((data.submissions || []).map(adaptSubmission));
    return { posts, total: posts.length };
  }

  // tag search via HTML scrape proxy
  if (mapped.q) {
    const cacheKey = searchCacheKey(mapped);
    const prevNextid = page > 1 ? getCachedNextid(cacheKey, page - 1) : null;
    const url = buildUrl("search", {
      q: mapped.q,
      count: limit,
      nextid: prevNextid ?? undefined,
      orderby: mapped.orderby ?? undefined,
      key: args.apiKey ?? undefined,
    });
    const data = await fetchJson<{ submissions: WeasylSubmission[]; nextid: number | null }>(url);
    setCachedNextid(cacheKey, page, data.nextid);
    const posts = maybeShuffle((data.submissions || []).map(adaptSubmission));
    return { posts, total: posts.length };
  }

  // No tags — frontpage
  const posts = maybeShuffle(
    await fetchFrontpage({ apiKey: args.apiKey, count: limit }),
  );
  return { posts, total: posts.length };
}

/**
 * Fetch a user's favorites list.
 */
export async function fetchUserFavorites(args: {
  login: string;
  apiKey?: string | null;
  count?: number;
  nextid?: number | null;
}): Promise<{ posts: Post[]; nextid: number | null }> {
  const url = buildUrl(`favorites/${args.login}`, {
    count: args.count ?? 75,
    nextid: args.nextid ?? undefined,
    key: args.apiKey ?? undefined,
  });
  const data = await fetchJson<WeasylGalleryResponse>(url);
  const posts = (data.submissions || []).map(adaptSubmission);
  return { posts, nextid: data.nextid };
}

/**
 * Verify an API key by fetching the user's own profile.
 * Requires a username to confirm the key belongs to that user.
 */
export async function verifyApiKey(args: {
  apiKey: string;
  username: string;
}): Promise<{ userId: number }> {
  if (!args.username.trim()) {
    throw new Error("Username is required to verify a Weasyl API key");
  }
  const url = buildUrl(`user/${args.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`, {
    key: args.apiKey,
  });
  const data = await fetchJson<WeasylUserView>(url);
  if (!data.login_name && !data.username) {
    throw new Error("Could not verify Weasyl API key — user not found");
  }
  // Weasyl user API doesn't return a numeric userid in the user view endpoint.
  // We return 0; the caller stores the username separately.
  return { userId: 0 };
}

/**
 * Verify via /api/whoami (confirms the key is valid and returns the login).
 */
export async function whoami(apiKey: string): Promise<{ login: string; userid: number }> {
  const url = buildUrl("whoami", { key: apiKey });
  const data = await fetchJson<{ login: string; userid: number }>(url);
  if (!data.login) throw new Error("Weasyl: API key is invalid or not authorized");
  return data;
}

export { adaptSubmission as adaptSearchHit };
