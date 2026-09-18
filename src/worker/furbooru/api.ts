/**
 * Furbooru (Philomena) API client.
 *
 * All requests go through the local proxy at /api/furbooru/* because
 * furbooru.org returns no CORS headers.  Media URLs on furrycdn.org are
 * played via /api/download (host must be allowlisted there).
 *
 * Auth: Furbooru uses a single API key (no username) sent as ?key=API_KEY.
 */

import type { Post, PostTags, Tag, Comment, Pool } from "@/worker/api/returnTypes";

// ---------------------------------------------------------------------------
// Philomena wire types
// ---------------------------------------------------------------------------

export interface PhilomenaRepresentations {
  full: string;
  large: string;
  medium: string;
  small: string;
  tall: string;
  thumb: string;
  thumb_small: string;
  thumb_tiny: string;
}

export interface PhilomenaImage {
  id: number;
  created_at: string;
  updated_at: string;
  first_seen_at?: string;
  /** Flat list of tag strings, e.g. "artist:foo", "species:wolf", "safe" */
  tags: string[];
  tag_ids: number[];
  score: number;
  upvotes: number;
  downvotes: number;
  faves: number;
  comment_count: number;
  description: string;
  /** "safe" | "suggestive" | "questionable" | "explicit" | null — often absent; rating lives in tags */
  rating?: string | null;
  /** MIME type, e.g. "image/jpeg" */
  mime_type: string;
  /** File extension, e.g. "jpg" */
  format: string;
  width: number;
  height: number;
  /** Byte size of the original file */
  size?: number;
  view_url: string;
  representations: PhilomenaRepresentations;
  /** Whether the image is favorited by the authenticated user */
  is_favorited?: boolean;
  spoilered: boolean;
  sha512_hash?: string;
  name?: string;
  source_url?: string | null;
  source_urls?: string[];
  uploader?: string | null;
  uploader_id?: number | null;
  wilson_score?: number;
  duration?: number;
  animated?: boolean;
}

export interface PhilomenaSearchResponse {
  images: PhilomenaImage[];
  total: number;
}

export interface PhilomenaTag {
  id: number;
  name: string;
  slug: string;
  description: string;
  images: number;
  /** 0=general, 1=artist, 3=copyright, 4=character, 5=species, 6=meta */
  category: string | null;
  aliased_tag?: string | null;
  aliases?: string[];
}

export interface PhilomenaTagSearchResponse {
  tags: PhilomenaTag[];
}

export interface PhilomenaComment {
  id: number;
  image_id: number;
  user_id?: number;
  author: string;
  body: string;
  created_at: string;
  updated_at: string;
  edited?: boolean;
}

export interface PhilomenaCommentSearchResponse {
  comments: PhilomenaComment[];
  total: number;
}

export interface PhilomenaGallery {
  id: number;
  title: string;
  description?: string | null;
  spoiler_warning?: string | null;
  thumbnail_id?: number | null;
  user?: string | null;
  user_id?: number | null;
}

export interface PhilomenaGallerySearchResponse {
  galleries: PhilomenaGallery[];
  total: number;
}

// ---------------------------------------------------------------------------
// Proxy base URL
// ---------------------------------------------------------------------------

function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/furbooru`;
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function parseFurbooruResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const trimmed = text.trimStart();
  if (
    !trimmed ||
    trimmed.startsWith("<") ||
    /Attention Required|cf-browser-verification|Just a moment|I'm not a robot/i.test(
      text.slice(0, 4000),
    )
  ) {
    throw new Error(
      `Furbooru blocked by Cloudflare (${response.status}). Retry shortly.`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Furbooru returned non-JSON (${response.status}). Check proxy / curl_cffi.`,
    );
  }
}

/** Writes may return empty bodies; still reject HTML challenge pages. */
async function consumeFurbooruWrite(
  response: Response,
  fallbackMessage: string,
): Promise<void> {
  const text = await response.text();
  const trimmed = text.trimStart();
  if (
    trimmed.startsWith("<") ||
    /Attention Required|cf-browser-verification|Just a moment|I'm not a robot/i.test(
      text.slice(0, 4000),
    )
  ) {
    throw new Error(
      `Furbooru blocked by Cloudflare (${response.status}). Retry shortly.`,
    );
  }
  if (!response.ok) {
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed?.message === "string" && parsed.message.trim()) {
        throw new Error(parsed.message.trim());
      }
    } catch (err) {
      if (err instanceof Error && err.message !== fallbackMessage) throw err;
    }
    throw new Error(fallbackMessage);
  }
}

async function fetchJson<T>(url: string, options: RequestInit = {}, retries = 2): Promise<T> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) {
      return parseFurbooruResponse<T>(response);
    }
    if ((response.status === 429 || response.status === 501) && attempt < retries) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 5000 * (attempt + 1);
      await sleep(waitMs);
      continue;
    }
    lastError = new Error(
      `Furbooru proxy error: ${response.status} ${response.statusText}`,
    );
    try {
      const text = await response.clone().text();
      try {
        const parsed = JSON.parse(text) as { message?: unknown };
        if (typeof parsed?.message === "string" && parsed.message.trim()) {
          lastError = new Error(parsed.message.trim());
        }
      } catch {
        /* not JSON */
      }
      if (
        /Attention Required|cf-browser-verification|Just a moment|I'm not a robot/i.test(
          text,
        )
      ) {
        lastError = new Error(
          `Furbooru blocked by Cloudflare (${response.status}). Retry shortly.`,
        );
      } else if (
        response.status === 501 &&
        /curl_cffi/i.test(lastError.message)
      ) {
        // Keep curl_cffi install hint from furbooru_cf.py
      } else if (response.status === 501) {
        lastError = new Error(
          `Furbooru blocked by Cloudflare (${response.status}). Check curl_cffi / .venv.`,
        );
      }
    } catch {
      /* keep status error */
    }
    break;
  }
  throw lastError || new Error("Furbooru proxy error");
}

// ---------------------------------------------------------------------------
// Philomena image → e621 Post adapter
// ---------------------------------------------------------------------------

/** Split flat Philomena tag strings into e621 PostTags categories. */
function adaptTags(tags: string[]): PostTags {
  const result: PostTags = {
    general: [],
    species: [],
    character: [],
    copyright: [],
    artist: [],
    invalid: [],
    lore: [],
    meta: [],
  };
  for (const tag of tags) {
    const colon = tag.indexOf(":");
    if (colon > 0) {
      const prefix = tag.slice(0, colon).toLowerCase();
      const rest = tag.slice(colon + 1).toLowerCase();
      switch (prefix) {
        case "artist":
          result.artist.push(rest);
          // Keep prefixed form so blacklist lines like artist:foo still match (H11).
          result.meta.push(`${prefix}:${rest}`);
          continue;
        case "species":
          result.species.push(rest);
          result.meta.push(`${prefix}:${rest}`);
          continue;
        case "character":
          result.character.push(rest);
          result.meta.push(`${prefix}:${rest}`);
          continue;
        case "copyright":
        case "franchise":
          result.copyright.push(rest);
          result.meta.push(`copyright:${rest}`);
          continue;
        case "meta":
          result.meta.push(rest);
          continue;
        case "lore":
          result.lore.push(rest);
          result.meta.push(`lore:${rest}`);
          continue;
      }
    }
    result.general.push(tag.toLowerCase());
  }
  return result;
}

/** Map a Philomena rating string or rating tag to e621 rating character. */
function adaptRating(img: PhilomenaImage): "s" | "q" | "e" {
  const fromField = (img.rating || "").toLowerCase();
  const tags = (img.tags || []).map((t) => t.toLowerCase());
  const rating =
    fromField ||
    tags.find((t) =>
      ["safe", "suggestive", "questionable", "explicit", "semi-grimdark", "grimdark"].includes(t),
    ) ||
    "";
  switch (rating) {
    case "safe":
      return "s";
    case "explicit":
    case "grimdark":
      return "e";
    case "suggestive":
    case "questionable":
    case "semi-grimdark":
      return "q";
    default:
      return "q";
  }
}

/** Synthetic rating tags for blacklist matching (includes Philomena-native names). */
export function furbooruRatingTags(rating: "s" | "q" | "e", raw?: string): string[] {
  const tags = [
    `rating:${rating}`,
    rating === "s"
      ? "rating:safe"
      : rating === "e"
        ? "rating:explicit"
        : "rating:questionable",
  ];
  const native = (raw || "").toLowerCase();
  if (native) tags.push(`rating:${native}`, native);
  return tags;
}

const isVideoFormat = (format: string | undefined | null) =>
  /^(webm|mp4)$/i.test(format || "");

/**
 * Philomena lists video representation URLs as .webm/.mp4, but card <img> and
 * <video poster> need a still. FurryCDN serves matching .gif thumbs for the
 * thumb* sizes (thumb.gif / thumb_small.gif / thumb_tiny.gif).
 */
export const stillRepUrl = (url: string | undefined | null): string => {
  if (!url) return "";
  return url.replace(/\.(webm|mp4)(?=\?|$)/i, ".gif");
};

/** Map a Philomena image to an e621-shaped Post. */
export function adaptImage(img: PhilomenaImage): Post {
  const rep = img.representations;
  const sources = (img.source_urls && img.source_urls.length
    ? img.source_urls
    : img.source_url
      ? [img.source_url]
      : []
  ).filter(Boolean) as string[];

  const previewRaw = rep.thumb_small ?? rep.thumb;
  // large/medium for videos often alias full.webm; full.gif 404s — prefer thumb GIF.
  const sampleRaw = isVideoFormat(img.format)
    ? rep.thumb ?? rep.thumb_small ?? rep.large ?? rep.medium
    : rep.large ?? rep.medium;

  return {
    id: img.id,
    created_at: img.created_at,
    updated_at: img.updated_at ?? img.created_at,
    file: {
      url: rep.full,
      ext: img.format,
      width: img.width,
      height: img.height,
      size: img.size ?? 0,
      // Philomena uses SHA-512; surface it in the md5 slot for the overview hash row
      md5: img.sha512_hash ?? "",
    },
    preview: {
      url: isVideoFormat(img.format) ? stillRepUrl(previewRaw) : previewRaw,
      width: 150,
      height: 150,
    },
    sample: {
      has: true,
      url: isVideoFormat(img.format) ? stillRepUrl(sampleRaw) : sampleRaw,
      width: img.width,
      height: img.height,
    },
    score: {
      up: img.upvotes ?? 0,
      down: Math.abs(img.downvotes ?? 0),
      total: img.score ?? 0,
    },
    tags: (() => {
      const t = adaptTags(img.tags || []);
      const ratingChar = adaptRating(img);
      const native = (img.rating || "").toLowerCase();
      for (const tag of furbooruRatingTags(ratingChar, native)) {
        if (!t.meta.includes(tag) && !t.general.includes(tag)) t.meta.push(tag);
      }
      if (img.spoilered) t.meta.push("spoilered");
      return t;
    })(),
    locked_tags: [],
    change_seq: 0,
    flags: {
      pending: false,
      flagged: !!img.spoilered,
      note_locked: false,
      status_locked: false,
      rating_locked: false,
      deleted: false,
    },
    rating: adaptRating(img),
    fav_count: img.faves ?? 0,
    sources,
    pools: [],
    relationships: {
      has_children: false,
      has_active_children: false,
      children: [],
    },
    uploader_id: img.uploader_id ?? 0,
    uploader_name: img.uploader ?? undefined,
    description: img.description ?? "",
    comment_count: img.comment_count ?? 0,
    is_favorited: img.is_favorited ?? false,
    has_notes: false,
  };
}

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

/** Philomena sort field / direction (sf / sd query params). */
export interface FurbooruSort {
  sf: string;
  sd?: "asc" | "desc";
}

/**
 * Map e621-style `order:*` tags to Philomena `sf`/`sd`.
 * Returns the sort params and the remaining (non-order) tags.
 */
export function mapOrderTags(tags: string[]): { sort: FurbooruSort | null; tags: string[] } {
  const orderTag = tags.find((t) => t.toLowerCase().startsWith("order:"))?.toLowerCase() ?? null;
  const rest = tags.filter((t) => !t.toLowerCase().startsWith("order:"));
  if (!orderTag) return { sort: null, tags: rest };

  const map: Record<string, FurbooruSort> = {
    "order:score": { sf: "score", sd: "desc" },
    "order:score_asc": { sf: "score", sd: "asc" },
    "order:favcount": { sf: "faves", sd: "desc" },
    "order:favcount_asc": { sf: "faves", sd: "asc" },
    "order:random": { sf: "random" },
    "order:id": { sf: "id", sd: "asc" },
    "order:id_desc": { sf: "id", sd: "desc" },
    "order:rank": { sf: "wilson_score", sd: "desc" },
    "order:comment_count": { sf: "comment_count", sd: "desc" },
    "order:comment_count_asc": { sf: "comment_count", sd: "asc" },
    "order:mpixels": { sf: "pixels", sd: "desc" },
    "order:mpixels_asc": { sf: "pixels", sd: "asc" },
    "order:filesize": { sf: "size", sd: "desc" },
    "order:filesize_asc": { sf: "size", sd: "asc" },
    "order:duration": { sf: "duration", sd: "desc" },
    "order:duration_asc": { sf: "duration", sd: "asc" },
  };

  return { sort: map[orderTag] ?? null, tags: rest };
}

/**
 * Philomena system filter "Everything" (no hidden/spoilered tags).
 * Without this, anonymous searches use "Default" and drop most NSFW
 * gallery covers / membership — pool cards look empty.
 */
export const FURBOORU_EVERYTHING_FILTER_ID = 2;

/**
 * Expand e621-style `id:1,2,3` (or `id:1, 2`) into Philomena
 * `id:1 OR id:2 OR id:3`. Leaves other query text alone.
 */
export function expandPhilomenaIdQuery(query: string): string {
  return (query || "").replace(/\bid:(\d+(?:\s*,\s*\d+)*)/gi, (_match, raw: string) => {
    const ids = String(raw)
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s));
    if (!ids.length) return "id:0";
    if (ids.length === 1) return `id:${ids[0]}`;
    return ids.map((id) => `id:${id}`).join(" OR ");
  });
}

export interface FurbooruSearchArgs {
  /** Tag query string (same Philomena syntax: tag1, -tag2, my:faves, etc.) */
  query: string;
  page: number;
  limit: number;
  /** Furbooru API key for authenticated requests */
  apiKey?: string | null;
  /** Philomena sort — mapped from e621 order:* tags */
  sort?: FurbooruSort | null;
  /**
   * Philomena filter_id. Defaults to Everything so client blacklist owns
   * hiding (matches e621-style browsing).
   */
  filterId?: number | null;
}

export async function searchImages(args: FurbooruSearchArgs): Promise<{ posts: Post[]; total: number }> {
  const q = new URLSearchParams({
    q: expandPhilomenaIdQuery(args.query || "*") || "*",
    page: String(args.page),
    per_page: String(args.limit),
  });
  if (args.apiKey) q.set("key", args.apiKey);
  const filterId =
    args.filterId === null
      ? null
      : args.filterId ?? FURBOORU_EVERYTHING_FILTER_ID;
  if (filterId != null && Number.isFinite(filterId) && filterId > 0) {
    q.set("filter_id", String(Math.floor(filterId)));
  }
  if (args.sort?.sf) {
    q.set("sf", args.sort.sf);
    if (args.sort.sd) q.set("sd", args.sort.sd);
  }
  const url = `${proxyBase()}/images?${q}`;
  const data = await fetchJson<PhilomenaSearchResponse>(url);
  return {
    posts: (data.images ?? []).map(adaptImage),
    total: data.total ?? 0,
  };
}

export async function getImage(args: {
  id: number;
  apiKey?: string | null;
}): Promise<Post | null> {
  // Proxy only exposes search `/images`, not GET `/images/:id`.
  const result = await searchImages({
    query: `id:${args.id}`,
    page: 1,
    limit: 1,
    apiKey: args.apiKey,
  });
  return result.posts.find((p) => p.id === args.id) || result.posts[0] || null;
}

/** Strip e621-style `*glob*` wrappers for Philomena field queries. */
export const stripPoolGlob = (raw: string | undefined | null): string =>
  (raw || "").trim().replace(/^\*+/, "").replace(/\*+$/, "").trim();

/**
 * Map e621 pool list args onto a Philomena galleries `q` string.
 * Returns null when the request cannot be satisfied (e.g. post tag match).
 */
export function mapPoolListQuery(args: {
  query?: string;
  descriptionMatches?: string;
  postTagsMatch?: string;
  creatorName?: string;
  ids?: number[] | string;
}): string | null {
  if (args.postTagsMatch?.trim()) return null;

  const parts: string[] = [];
  const idsRaw = args.ids;
  const idList = Array.isArray(idsRaw)
    ? idsRaw.map((n) => Math.floor(Number(n))).filter((n) => n > 0)
    : String(idsRaw || "")
        .split(/[,\s]+/)
        .map((s) => Math.floor(Number(s)))
        .filter((n) => n > 0);
  if (idList.length) {
    parts.push(idList.map((id) => `id:${id}`).join(" OR "));
  }

  const title = stripPoolGlob(args.query);
  if (title) parts.push(`title:${title}*`);

  const desc = stripPoolGlob(args.descriptionMatches);
  if (desc) parts.push(`description:${desc}*`);

  const creator = (args.creatorName || "").trim();
  if (creator) parts.push(`user:${creator}`);

  return parts.length ? parts.join(", ") : "*";
}

/** Map Philomena gallery → e621 Pool shape (list cards; membership via getPool). */
export function adaptGallery(g: PhilomenaGallery): Pool {
  const thumb =
    typeof g.thumbnail_id === "number" && g.thumbnail_id > 0
      ? g.thumbnail_id
      : 0;
  return {
    id: g.id,
    name: g.title || `Gallery ${g.id}`,
    created_at: new Date(0),
    updated_at: new Date(0),
    creator_id: g.user_id ?? 0,
    description: g.description || "",
    is_active: true,
    category: "",
    is_deleted: false,
    // Cover only — full membership comes from getPool(gallery_id).
    post_ids: thumb ? [thumb] : [],
    creator_name: g.user || "",
    post_count: 0,
  };
}

export interface FurbooruGalleriesArgs {
  query: string;
  page: number;
  limit: number;
  apiKey?: string | null;
}

export async function searchGalleries(
  args: FurbooruGalleriesArgs,
): Promise<{ pools: Pool[]; total: number }> {
  const q = new URLSearchParams({
    q: args.query || "*",
    page: String(args.page),
    per_page: String(args.limit),
  });
  if (args.apiKey) q.set("key", args.apiKey);
  const url = `${proxyBase()}/galleries?${q}`;
  const data = await fetchJson<PhilomenaGallerySearchResponse>(url);
  return {
    pools: (data.galleries ?? []).map(adaptGallery),
    total: data.total ?? 0,
  };
}

export const FURBOORU_POOL_PAGE_SIZE = 50;
export const FURBOORU_POOL_MAX_PAGES = 40;

export type FurbooruPoolResult = {
  pool: Pool;
  truncated: boolean;
};

/**
 * Resolve a gallery and paginate membership via `gallery_id:N` image search.
 */
export async function getPool(args: {
  id: number;
  apiKey?: string | null;
}): Promise<FurbooruPoolResult> {
  const galleryId = Math.floor(Number(args.id));
  if (!Number.isFinite(galleryId) || galleryId <= 0) {
    throw new Error("Invalid Furbooru gallery id");
  }

  const listed = await searchGalleries({
    query: `id:${galleryId}`,
    page: 1,
    limit: 1,
    apiKey: args.apiKey,
  });
  const meta = listed.pools.find((p) => p.id === galleryId) || listed.pools[0];
  if (!meta) {
    throw new Error(`Furbooru gallery ${galleryId} not found`);
  }

  const postIds: number[] = [];
  let reportedTotal = 0;
  let firstCreated = "";
  let lastUpdated = "";
  let page = 1;

  while (page <= FURBOORU_POOL_MAX_PAGES) {
    const result = await searchImages({
      query: `gallery_id:${galleryId}`,
      page,
      limit: FURBOORU_POOL_PAGE_SIZE,
      apiKey: args.apiKey,
    });
    if (result.total > 0) reportedTotal = result.total;
    for (const post of result.posts) {
      if (post.id) postIds.push(post.id);
      if (!firstCreated && post.created_at) firstCreated = String(post.created_at);
      if (post.updated_at) lastUpdated = String(post.updated_at);
      else if (post.created_at) lastUpdated = String(post.created_at);
    }
    if (
      !result.posts.length ||
      result.posts.length < FURBOORU_POOL_PAGE_SIZE ||
      (reportedTotal > 0 && postIds.length >= reportedTotal)
    ) {
      break;
    }
    page += 1;
  }

  const truncated =
    page >= FURBOORU_POOL_MAX_PAGES &&
    reportedTotal > 0 &&
    postIds.length < reportedTotal;

  const parseDt = (raw?: string): Date => {
    if (!raw) return new Date(0);
    const t = Date.parse(raw);
    return Number.isFinite(t) ? new Date(t) : new Date(0);
  };

  const postCount = Math.max(reportedTotal || 0, postIds.length);
  return {
    pool: {
      ...meta,
      post_ids: postIds,
      post_count: postCount,
      created_at: parseDt(firstCreated),
      updated_at: parseDt(lastUpdated || firstCreated),
    },
    truncated,
  };
}

export interface FurbooruTagsArgs {
  query?: string;
  limit?: number;
  apiKey?: string | null;
}

export async function searchTags(args: FurbooruTagsArgs): Promise<Tag[]> {
  const q = new URLSearchParams({
    q: args.query ?? "*",
    per_page: String(args.limit ?? 25),
  });
  if (args.apiKey) q.set("key", args.apiKey);
  const url = `${proxyBase()}/tags?${q}`;
  const data = await fetchJson<PhilomenaTagSearchResponse>(url);
  return (data.tags ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    post_count: t.images,
    related_tags: "",
    related_tags_updated_at: new Date(),
    // Philomena category → e621 numeric category (best-effort)
    category: philomenaTagCategory(t.category),
    is_locked: false,
    created_at: new Date(),
    updated_at: new Date(),
  }));
}

function philomenaTagCategory(cat: string | null | undefined): number {
  switch (cat) {
    case "artist": return 1;
    case "copyright": return 3;
    case "character": return 4;
    case "species": return 5;
    case "meta": return 7;
    default: return 0; // general
  }
}

export interface FurbooruCommentsArgs {
  imageId: number;
  apiKey?: string | null;
  limit?: number;
}

export async function getComments(args: FurbooruCommentsArgs): Promise<Comment[]> {
  const q = new URLSearchParams({
    q: `image_id:${args.imageId}`,
    per_page: String(args.limit ?? 100),
  });
  if (args.apiKey) q.set("key", args.apiKey);
  const url = `${proxyBase()}/comments?${q}`;
  const data = await fetchJson<PhilomenaCommentSearchResponse>(url);
  return (data.comments ?? []).map<Comment>((c) => ({
    id: c.id,
    created_at: c.created_at,
    post_id: c.image_id,
    creator_id: c.user_id ?? 0,
    body: c.body,
    score: 0,
    updated_at: c.updated_at,
    updater_id: c.user_id ?? 0,
    do_not_bump_post: false,
    is_hidden: false,
    is_sticky: false,
    creator_name: c.author,
    updater_name: c.author,
  }));
}

// ---------------------------------------------------------------------------
// Write API (requires API key)
// ---------------------------------------------------------------------------

export interface FurbooruWriteArgs {
  postId: number;
  apiKey: string;
}

export async function favoriteImage(args: FurbooruWriteArgs): Promise<void> {
  const q = new URLSearchParams({ key: args.apiKey });
  const response = await fetch(`${proxyBase()}/images/${args.postId}/faves?${q}`, {
    method: "POST",
  });
  await consumeFurbooruWrite(response, `Furbooru favorite error: ${response.status}`);
}

export async function unfavoriteImage(args: FurbooruWriteArgs): Promise<void> {
  const q = new URLSearchParams({ key: args.apiKey });
  const response = await fetch(`${proxyBase()}/images/${args.postId}/faves?${q}`, {
    method: "DELETE",
  });
  await consumeFurbooruWrite(response, `Furbooru unfavorite error: ${response.status}`);
}

export type VoteValue = "up" | "down";

export async function voteImage(
  args: FurbooruWriteArgs & { value: VoteValue },
): Promise<{ score: number; up: number; down: number }> {
  const q = new URLSearchParams({ key: args.apiKey, value: args.value });
  const response = await fetch(`${proxyBase()}/images/${args.postId}/votes?${q}`, {
    method: "POST",
  });
  if (!response.ok) {
    try {
      await parseFurbooruResponse(response);
    } catch (err) {
      throw err instanceof Error
        ? err
        : new Error(`Furbooru vote error: ${response.status}`);
    }
    throw new Error(`Furbooru vote error: ${response.status}`);
  }
  const data = await parseFurbooruResponse<{ image?: PhilomenaImage }>(response);
  const img = data.image;
  return {
    score: img?.score ?? 0,
    up: img?.upvotes ?? 0,
    down: img?.downvotes ?? 0,
  };
}

/** Clear the current user's vote (Philomena DELETE /votes). */
export async function clearVoteImage(
  args: FurbooruWriteArgs,
): Promise<{ score: number; up: number; down: number }> {
  const q = new URLSearchParams({ key: args.apiKey });
  const response = await fetch(`${proxyBase()}/images/${args.postId}/votes?${q}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    try {
      await parseFurbooruResponse(response);
    } catch (err) {
      throw err instanceof Error
        ? err
        : new Error(`Furbooru clear vote error: ${response.status}`);
    }
    throw new Error(`Furbooru clear vote error: ${response.status}`);
  }
  const data = await parseFurbooruResponse<{ image?: PhilomenaImage }>(response);
  const img = data.image;
  return {
    score: img?.score ?? 0,
    up: img?.upvotes ?? 0,
    down: img?.downvotes ?? 0,
  };
}

export async function createComment(args: FurbooruWriteArgs & { body: string }): Promise<Comment> {
  const q = new URLSearchParams({ key: args.apiKey });
  const response = await fetch(`${proxyBase()}/comments?${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment: { image_id: args.postId, body: args.body } }),
  });
  if (!response.ok) {
    try {
      await parseFurbooruResponse(response);
    } catch (err) {
      throw err instanceof Error
        ? err
        : new Error(`Furbooru comment error: ${response.status}`);
    }
    throw new Error(`Furbooru comment error: ${response.status}`);
  }
  const data = await parseFurbooruResponse<{ comment: PhilomenaComment }>(response);
  const c = data.comment;
  return {
    id: c.id,
    created_at: c.created_at,
    post_id: c.image_id,
    creator_id: c.user_id ?? 0,
    body: c.body,
    score: 0,
    updated_at: c.updated_at,
    updater_id: c.user_id ?? 0,
    do_not_bump_post: false,
    is_hidden: false,
    is_sticky: false,
    creator_name: c.author,
    updater_name: c.author,
  };
}

export interface FurbooruVerifyArgs {
  apiKey: string;
}

/** Verify an API key by fetching the user's filters list.
 *  Philomena has no /users/me; /filters/user returns 200 with a valid key
 *  and 403 without one / with a bad key. */
export async function verifyApiKey(args: FurbooruVerifyArgs): Promise<{ ok: true }> {
  const q = new URLSearchParams({ key: args.apiKey });
  const url = `${proxyBase()}/user?${q}`;
  const response = await fetch(url);
  if (response.status === 403) {
    throw new Error("Invalid API key");
  }
  if (!response.ok) {
    throw new Error(`Furbooru proxy error: ${response.status} ${response.statusText}`);
  }
  return { ok: true };
}
