/**
 * Furbooru (Philomena) API client.
 *
 * All requests go through the local proxy at /api/furbooru/* because
 * furbooru.org returns no CORS headers.  furrycdn.org (the media CDN)
 * does support CORS, so image/video URLs are used directly.
 *
 * Auth: Furbooru uses a single API key (no username) sent as ?key=API_KEY.
 */

import type { Post, PostTags, Tag, Comment } from "@/worker/api/returnTypes";

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

async function fetchJson<T>(url: string, options: RequestInit = {}, retries = 2): Promise<T> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) {
      return response.json() as Promise<T>;
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

/** Map a Philomena image to an e621-shaped Post. */
export function adaptImage(img: PhilomenaImage): Post {
  const rep = img.representations;
  const sources = (img.source_urls && img.source_urls.length
    ? img.source_urls
    : img.source_url
      ? [img.source_url]
      : []
  ).filter(Boolean) as string[];

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
      url: rep.thumb_small ?? rep.thumb,
      width: 150,
      height: 150,
    },
    sample: {
      has: true,
      url: rep.large ?? rep.medium,
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

export interface FurbooruSearchArgs {
  /** Tag query string (same Philomena syntax: tag1, -tag2, my:faves, etc.) */
  query: string;
  page: number;
  limit: number;
  /** Furbooru API key for authenticated requests */
  apiKey?: string | null;
  /** Philomena sort — mapped from e621 order:* tags */
  sort?: FurbooruSort | null;
}

export async function searchImages(args: FurbooruSearchArgs): Promise<{ posts: Post[]; total: number }> {
  const q = new URLSearchParams({
    q: args.query || "*",
    page: String(args.page),
    per_page: String(args.limit),
  });
  if (args.apiKey) q.set("key", args.apiKey);
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
  if (!response.ok) {
    throw new Error(`Furbooru favorite error: ${response.status}`);
  }
}

export async function unfavoriteImage(args: FurbooruWriteArgs): Promise<void> {
  const q = new URLSearchParams({ key: args.apiKey });
  const response = await fetch(`${proxyBase()}/images/${args.postId}/faves?${q}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Furbooru unfavorite error: ${response.status}`);
  }
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
    throw new Error(`Furbooru vote error: ${response.status}`);
  }
  const data = await response.json() as { image?: PhilomenaImage };
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
    throw new Error(`Furbooru clear vote error: ${response.status}`);
  }
  const data = await response.json() as { image?: PhilomenaImage };
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
    throw new Error(`Furbooru comment error: ${response.status}`);
  }
  const data = await response.json() as { comment: PhilomenaComment };
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
