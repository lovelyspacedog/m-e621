/**
 * Itaku.ee API client (Django REST at https://itaku.ee/api/).
 *
 * Requests go through /api/itaku/* (no CORS on itaku.ee).
 * Auth: Authorization: Token <token> (pasted from browser DevTools).
 */

import type { Comment, Post, PostTags, Tag } from "@/worker/api/returnTypes";

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

export interface ItakuTag {
  id: number;
  name: string;
  num_objects?: number;
  tag_type?: string | null;
  maturity_rating?: string | null;
}

export interface ItakuImage {
  id: number;
  title?: string | null;
  description?: string | null;
  date_added?: string | null;
  date_edited?: string | null;
  maturity_rating?: string | null;
  visibility?: string | null;
  owner?: number | null;
  owner_username?: string | null;
  owner_displayname?: string | null;
  image?: string | null;
  image_sm?: string | null;
  image_lg?: string | null;
  image_xl?: string | null;
  video?: { video?: string | null } | string | null;
  animated?: boolean;
  is_thumbnail_for_video?: boolean;
  num_likes?: number;
  liked_by_you?: boolean;
  num_comments?: number;
  tags?: ItakuTag[] | null;
  categorized_tags?: Record<string, ItakuTag[]> | null;
  uncompressed_filesize?: number | null;
}

export interface ItakuPost {
  id: number;
  title?: string | null;
  content?: string | null;
  date_added?: string | null;
  maturity_rating?: string | null;
  owner?: number | null;
  owner_username?: string | null;
  owner_displayname?: string | null;
  gallery_images?: ItakuImage[] | null;
  tags?: ItakuTag[] | null;
  num_likes?: number;
  liked_by_you?: boolean;
  num_comments?: number;
}

export interface ItakuPage<T> {
  links?: { next?: string | null; previous?: string | null };
  results?: T[];
  count?: number;
}

export interface ItakuUserProfile {
  owner: number;
  owner_username?: string;
  displayname?: string;
}

export interface ItakuAuthUser {
  profile?: {
    owner?: number;
    owner_username?: string;
    displayname?: string;
  };
  username?: string;
  id?: number;
}

export interface ItakuFeedItem {
  id: number;
  content_type?: string;
  content_object?: Record<string, unknown> | null;
  date_added?: string;
  owner_username?: string;
  owner_displayname?: string;
}

export interface ItakuComment {
  id: number;
  content?: string | null;
  date_added?: string | null;
  date_edited?: string | null;
  owner?: number | null;
  owner_username?: string | null;
  owner_displayname?: string | null;
  num_likes?: number | null;
  children?: ItakuComment[] | null;
  parent?: number | null;
  replying_to?: number | null;
}

// ---------------------------------------------------------------------------
// Proxy helpers
// ---------------------------------------------------------------------------

function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/itaku`;
}

/** Strip optional "Token " prefix so Account settings can paste either form. */
export function normalizeToken(raw: string | null | undefined): string {
  const t = (raw || "").trim();
  if (!t) return "";
  return t.replace(/^Token\s+/i, "").trim();
}

function buildUrl(
  path: string,
  params: Record<string, string | number | boolean | undefined | null | string[]> = {},
): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v !== undefined && v !== null && v !== "") q.append(key, String(v));
      }
      continue;
    }
    q.set(key, String(value));
  }
  const qs = q.toString();
  const base = `${proxyBase()}/${path.replace(/^\//, "")}`;
  return qs ? `${base}?${qs}` : base;
}

async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    let msg = `Itaku proxy error: ${response.status} ${response.statusText}`;
    try {
      const data = (await response.json()) as { detail?: string; error?: string };
      if (data.detail) msg = `Itaku: ${data.detail}`;
      else if (data.error) msg = `Itaku: ${data.error}`;
    } catch {
      // ignore
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

function adaptRating(rating: string | undefined | null): "s" | "q" | "e" {
  switch ((rating || "").toUpperCase()) {
    case "NSFW":
    case "EXPLICIT":
      return "e";
    case "QUESTIONABLE":
    case "SUGGESTIVE":
      return "q";
    default:
      return "s";
  }
}

function tagTypeBucket(tagType: string | undefined | null): keyof PostTags {
  switch ((tagType || "").toUpperCase()) {
    case "ARTIST":
      return "artist";
    case "CHARACTER":
      return "character";
    case "COPYRIGHT":
      return "copyright";
    case "SPECIES":
      return "species";
    case "META":
      return "meta";
    default:
      return "general";
  }
}

function adaptTags(
  tags: ItakuTag[] | null | undefined,
  categorized?: Record<string, ItakuTag[]> | null,
  artist?: string | null,
): PostTags {
  const result = emptyTags();
  const push = (bucket: keyof PostTags, name: string) => {
    const list = result[bucket];
    if (Array.isArray(list)) list.push(name);
    else result.general.push(name);
  };
  if (categorized) {
    for (const [bucket, list] of Object.entries(categorized)) {
      const key = tagTypeBucket(bucket);
      for (const t of list || []) {
        if (t?.name) push(key, t.name.replace(/ /g, "_"));
      }
    }
  } else if (tags) {
    for (const t of tags) {
      if (!t?.name) continue;
      push(tagTypeBucket(t.tag_type), t.name.replace(/ /g, "_"));
    }
  }
  if (artist) {
    const a = artist.replace(/ /g, "_");
    if (!result.artist.includes(a)) result.artist = [a, ...result.artist];
  }
  return result;
}

function extFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  const clean = url.split("?")[0] || "";
  const part = clean.split(".").pop() || "";
  return /^[a-z0-9]{2,5}$/i.test(part) ? part.toLowerCase() : "";
}

function videoUrl(video: ItakuImage["video"]): string | null {
  if (!video) return null;
  if (typeof video === "string") return video;
  return video.video || null;
}

export function imagePageUrl(id: number): string {
  return `https://itaku.ee/images/${id}`;
}

export function adaptImage(
  img: ItakuImage,
  extras?: { description?: string | null; tags?: ItakuTag[] | null; artist?: string | null },
): Post {
  const artist =
    extras?.artist || img.owner_username || img.owner_displayname || null;
  const tags = adaptTags(
    extras?.tags || img.tags,
    img.categorized_tags,
    artist,
  );
  const full =
    videoUrl(img.video) ||
    img.image ||
    img.image_xl ||
    img.image_lg ||
    img.image_sm ||
    null;
  const sample = img.image_xl || img.image_lg || img.image || img.image_sm || full;
  const preview = img.image_sm || img.image_lg || sample || full || "";
  const ext = extFromUrl(full);
  const likes = img.num_likes ?? 0;
  const description =
    (extras?.description || img.description || img.title || "").trim();

  return {
    id: img.id,
    created_at: img.date_added || "",
    updated_at: img.date_edited || img.date_added || "",
    file: {
      url: full,
      ext,
      width: 0,
      height: 0,
      size: img.uncompressed_filesize || 0,
      md5: "",
    },
    preview: {
      url: preview || "",
      width: 0,
      height: 0,
    },
    sample: {
      has: !!sample,
      url: sample || "",
      width: 0,
      height: 0,
    },
    score: { up: likes, down: 0, total: likes },
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
    rating: adaptRating(img.maturity_rating),
    fav_count: likes,
    sources: [imagePageUrl(img.id)],
    pools: [],
    relationships: {
      has_children: false,
      has_active_children: false,
      children: [],
    },
    uploader_id: img.owner || 0,
    uploader_name: artist || "",
    description,
    comment_count: img.num_comments || 0,
    is_favorited: !!img.liked_by_you,
    has_notes: false,
  };
}

/** Flatten a multi-image Itaku post into one Post per gallery image. */
export function flattenPost(post: ItakuPost): Post[] {
  const images = post.gallery_images || [];
  if (!images.length) return [];
  const artist = post.owner_username || post.owner_displayname || null;
  const desc = (post.content || post.title || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return images.map((img) =>
    adaptImage(
      {
        ...img,
        owner: img.owner ?? post.owner,
        owner_username: img.owner_username || post.owner_username,
        owner_displayname: img.owner_displayname || post.owner_displayname,
        maturity_rating: img.maturity_rating || post.maturity_rating,
        date_added: img.date_added || post.date_added,
      },
      {
        description: desc || img.title,
        tags: img.tags || post.tags,
        artist,
      },
    ),
  );
}

// ---------------------------------------------------------------------------
// Search tag mapping
// ---------------------------------------------------------------------------

export interface MappedItakuSearch {
  required: string[];
  negative: string[];
  optional: string[];
  ownerUsername: string | null;
  starsMe: boolean;
  followingMe: boolean;
  ordering: string;
  random: boolean;
}

export function mapSearchTags(tags: string[]): MappedItakuSearch {
  const mapped: MappedItakuSearch = {
    required: [],
    negative: [],
    optional: [],
    ownerUsername: null,
    starsMe: false,
    followingMe: false,
    ordering: "-date_added",
    random: false,
  };

  for (const raw of tags.filter(Boolean)) {
    const tag = raw.trim();
    const lower = tag.toLowerCase();

    if (lower === "stars:me" || lower === "favs:me" || lower === "fav:me") {
      mapped.starsMe = true;
      continue;
    }
    if (lower === "following:me" || lower === "watch:me") {
      mapped.followingMe = true;
      continue;
    }
    if (lower.startsWith("user:") || lower.startsWith("artist:")) {
      mapped.ownerUsername = tag.slice(tag.indexOf(":") + 1).trim();
      continue;
    }
    if (lower.startsWith("order:")) {
      if (lower === "order:score" || lower === "order:rank") {
        mapped.ordering = "-hotness_score";
      } else if (lower === "order:favcount") {
        mapped.ordering = "-num_likes";
      } else if (lower === "order:random") {
        mapped.random = true;
      } else {
        mapped.ordering = "-date_added";
      }
      continue;
    }
    if (tag.startsWith("-")) {
      mapped.negative.push(tag.slice(1).replace(/_/g, " "));
      continue;
    }
    if (tag.startsWith("~")) {
      mapped.optional.push(tag.slice(1).replace(/_/g, " "));
      continue;
    }
    mapped.required.push(tag.replace(/_/g, " "));
  }

  return mapped;
}

// ---------------------------------------------------------------------------
// Cursor pagination cache (page N → next cursor for page N+1)
// ---------------------------------------------------------------------------

const cursorCache = new Map<string, Map<number, string>>();

function cacheKey(parts: Record<string, unknown>): string {
  return JSON.stringify(parts);
}

function getCachedCursor(key: string, page: number): string | null {
  return cursorCache.get(key)?.get(page) ?? null;
}

function setCachedCursor(key: string, page: number, nextUrl: string | null | undefined): void {
  if (!nextUrl) return;
  try {
    const u = new URL(nextUrl);
    const cursor = u.searchParams.get("cursor");
    if (!cursor) return;
    if (!cursorCache.has(key)) cursorCache.set(key, new Map());
    cursorCache.get(key)!.set(page, cursor);
  } catch {
    // ignore bad next urls
  }
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const MATURITY = ["SFW", "Questionable", "NSFW"];
const VISIBILITY = ["PUBLIC", "PROFILE_ONLY"];

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function whoami(apiKey: string): Promise<{ username: string; userId: number }> {
  const token = normalizeToken(apiKey);
  if (!token) throw new Error("Itaku token is required");
  const data = await fetchJson<ItakuAuthUser>(
    buildUrl("auth/user", { key: token }),
  );
  const username =
    data.profile?.owner_username ||
    data.username ||
    "";
  const userId = data.profile?.owner ?? data.id ?? 0;
  if (!username || !userId) {
    throw new Error("Itaku: token is invalid or profile incomplete");
  }
  return { username, userId };
}

export async function fetchImage(args: {
  id: number;
  apiKey?: string | null;
}): Promise<Post> {
  const data = await fetchJson<ItakuImage>(
    buildUrl(`images/${args.id}`, { key: normalizeToken(args.apiKey) || undefined }),
  );
  return adaptImage(data);
}

export async function resolveUserId(
  username: string,
  apiKey?: string | null,
): Promise<number> {
  if (username.startsWith("id:")) {
    const n = parseInt(username.slice(3), 10);
    if (!n) throw new Error(`Invalid Itaku user id: ${username}`);
    return n;
  }
  const data = await fetchJson<ItakuUserProfile>(
    buildUrl(`users/${encodeURIComponent(username)}`, {
      key: normalizeToken(apiKey) || undefined,
    }),
  );
  if (!data.owner) throw new Error(`Itaku user not found: ${username}`);
  return data.owner;
}

async function fetchImagesPage(args: {
  path: string;
  params: Record<string, string | number | boolean | undefined | null | string[]>;
  page: number;
  cacheParts: Record<string, unknown>;
  apiKey?: string | null;
  random?: boolean;
}): Promise<{ posts: Post[]; total: number }> {
  const key = cacheKey(args.cacheParts);
  const cursor = args.page > 1 ? getCachedCursor(key, args.page - 1) : null;
  const data = await fetchJson<ItakuPage<ItakuImage>>(
    buildUrl(args.path, {
      ...args.params,
      cursor: cursor || undefined,
      key: normalizeToken(args.apiKey) || undefined,
    }),
  );
  setCachedCursor(key, args.page, data.links?.next);
  let posts = (data.results || []).map((img) => adaptImage(img));
  if (args.random) posts = shuffleInPlace(posts);
  return { posts, total: data.count ?? posts.length };
}

function postsFromFeedItems(items: ItakuFeedItem[]): Post[] {
  const out: Post[] = [];
  const seen = new Set<number>();

  const pushImage = (raw: Record<string, unknown> | null | undefined) => {
    if (!raw || typeof raw.id !== "number") return;
    if (seen.has(raw.id)) return;
    seen.add(raw.id);
    out.push(adaptImage(raw as unknown as ItakuImage));
  };

  const pushPost = (raw: Record<string, unknown> | null | undefined) => {
    if (!raw) return;
    const flattened = flattenPost(raw as unknown as ItakuPost);
    for (const p of flattened) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  };

  for (const item of items) {
    let type = item.content_type || "";
    let obj = (item.content_object || null) as Record<string, unknown> | null;

    if (type === "reshare" && obj) {
      type = String(obj.content_type || "");
      obj = (obj.content_object || null) as Record<string, unknown> | null;
    }

    if (type === "galleryimage" || type === "image") {
      pushImage(obj);
    } else if (type === "post") {
      pushPost(obj);
    }
    // skip commissions and other types
  }

  return out;
}

export async function searchImages(args: {
  tags: string[];
  page: number;
  limit: number;
  apiKey?: string | null;
  userId?: number | null;
}): Promise<{ posts: Post[]; total: number }> {
  const mapped = mapSearchTags(args.tags);
  const page = Math.max(1, args.page || 1);
  const limit = Math.min(100, Math.max(1, args.limit || 30));
  const token = normalizeToken(args.apiKey);

  if (mapped.followingMe) {
    if (!token) throw new Error("Log in to Itaku to browse your following feed.");
    const key = cacheKey({ feed: true, ordering: mapped.ordering });
    const cursor = page > 1 ? getCachedCursor(key, page - 1) : null;
    const data = await fetchJson<ItakuPage<ItakuFeedItem>>(
      buildUrl("feed", {
        page,
        page_size: limit,
        ordering: mapped.ordering,
        cursor: cursor || undefined,
        maturity_rating: MATURITY,
        key: token,
      }),
    );
    setCachedCursor(key, page, data.links?.next);
    let posts = postsFromFeedItems(data.results || []);
    if (mapped.random) posts = shuffleInPlace(posts);
    return { posts, total: posts.length };
  }

  if (mapped.starsMe) {
    if (!token) throw new Error("Log in to Itaku to browse your stars.");
    const starsOf = args.userId;
    if (!starsOf) {
      throw new Error("Verify your Itaku token in Account settings to load stars.");
    }
    return fetchImagesPage({
      path: "stars",
      params: {
        stars_of: starsOf,
        page,
        page_size: limit,
        ordering: mapped.ordering === "-date_added" ? "-like_date" : mapped.ordering,
        maturity_rating: MATURITY,
        visibility: VISIBILITY,
      },
      page,
      cacheParts: { stars: starsOf, ordering: mapped.ordering },
      apiKey: token,
      random: mapped.random,
    });
  }

  let owner: number | undefined;
  if (mapped.ownerUsername) {
    owner = await resolveUserId(mapped.ownerUsername, token);
  }

  return fetchImagesPage({
    path: "images",
    params: {
      owner,
      page,
      page_size: limit,
      ordering: mapped.ordering,
      maturity_rating: MATURITY,
      visibility: VISIBILITY,
      required_tags: mapped.required.length ? mapped.required : undefined,
      negative_tags: mapped.negative.length ? mapped.negative : undefined,
      optional_tags: mapped.optional.length ? mapped.optional : undefined,
    },
    page,
    cacheParts: {
      owner,
      required: mapped.required,
      negative: mapped.negative,
      optional: mapped.optional,
      ordering: mapped.ordering,
    },
    apiKey: token,
    random: mapped.random,
  });
}

export async function favoriteImage(args: {
  postId: number;
  apiKey: string;
}): Promise<void> {
  const token = normalizeToken(args.apiKey);
  if (!token) throw new Error("Log in to Itaku to star images.");
  await fetchJson(buildUrl(`images/${args.postId}/like`, { key: token }), {
    method: "POST",
  });
}

export async function unfavoriteImage(args: {
  postId: number;
  apiKey: string;
}): Promise<void> {
  const token = normalizeToken(args.apiKey);
  if (!token) throw new Error("Log in to Itaku to unstar images.");
  await fetchJson(buildUrl(`images/${args.postId}/like`, { key: token }), {
    method: "DELETE",
  });
}

/** Map Itaku comment wire → e621-shaped Comment. */
export function adaptComment(c: ItakuComment, postId: number): Comment {
  const name = c.owner_displayname || c.owner_username || "";
  return {
    id: c.id,
    created_at: c.date_added || "",
    post_id: postId,
    creator_id: c.owner || 0,
    body: c.content || "",
    score: c.num_likes ?? 0,
    updated_at: c.date_edited || c.date_added || "",
    updater_id: c.owner || 0,
    do_not_bump_post: false,
    is_hidden: false,
    is_sticky: false,
    creator_name: name,
    updater_name: name,
  };
}

/** Flatten top-level + one level of children (Itaku nests replies). */
export function flattenItakuComments(
  results: ItakuComment[] | null | undefined,
  postId: number,
): Comment[] {
  const out: Comment[] = [];
  for (const c of results || []) {
    out.push(adaptComment(c, postId));
    for (const child of c.children || []) {
      out.push(adaptComment(child, postId));
    }
  }
  return out;
}

export async function getComments(args: {
  postId: number;
  apiKey?: string | null;
  limit?: number;
}): Promise<Comment[]> {
  const pageSize = Math.min(Math.max(args.limit ?? 100, 1), 100);
  const data = await fetchJson<ItakuPage<ItakuComment>>(
    buildUrl(`images/${args.postId}/comments`, {
      page: 1,
      page_size: pageSize,
      child_page_size: pageSize,
      key: normalizeToken(args.apiKey) || undefined,
    }),
  );
  return flattenItakuComments(data.results, args.postId);
}

export async function createComment(args: {
  postId: number;
  apiKey: string;
  body: string;
}): Promise<Comment> {
  const token = normalizeToken(args.apiKey);
  if (!token) throw new Error("Log in to Itaku to post comments.");
  const content = (args.body || "").trim();
  if (!content) throw new Error("Comment is empty");
  const created = await fetchJson<ItakuComment>(
    buildUrl(`images/${args.postId}/comment`, { key: token }),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mentions: [] }),
    },
  );
  return adaptComment(created, args.postId);
}

export async function searchTags(args: {
  query?: string | null;
  limit?: number;
  apiKey?: string | null;
}): Promise<Tag[]> {
  const q = (args.query || "").trim();
  if (!q) return [];
  const data = await fetchJson<ItakuPage<ItakuTag>>(
    buildUrl("tags", {
      name: q,
      page_size: args.limit ?? 20,
      key: normalizeToken(args.apiKey) || undefined,
    }),
  );
  return (data.results || []).map((t) => ({
    id: t.id,
    name: t.name.replace(/ /g, "_"),
    post_count: t.num_objects ?? 0,
    related_tags: "",
    related_tags_updated_at: new Date(),
    category: itakuTagCategory(t.tag_type),
    is_locked: false,
    created_at: new Date(),
    updated_at: new Date(),
  }));
}

function itakuTagCategory(tagType: string | null | undefined): number {
  switch ((tagType || "").toUpperCase()) {
    case "ARTIST":
      return 1;
    case "COPYRIGHT":
      return 3;
    case "CHARACTER":
      return 4;
    case "SPECIES":
      return 5;
    case "META":
      return 7;
    default:
      return 0;
  }
}
