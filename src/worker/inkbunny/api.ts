/**
 * Inkbunny API client (https://wiki.inkbunny.net/wiki/API).
 *
 * All JSON calls go through /api/inkbunny/* because inkbunny.net has no CORS.
 * Media is rewritten to /api/download?url=… so the proxy can send
 * Referer: https://inkbunny.net (required for assets).
 *
 * Auth is session-based: login returns a SID. Guest username is "guest".
 * Passwords are never stored here — callers pass them only to login().
 */

import type { Post, PostTags, Tag } from "@/worker/api/returnTypes";

export interface InkbunnyFile {
  file_id: number;
  file_name: string;
  mimetype: string;
  submission_file_order: number;
  file_url_full?: string;
  file_url_screen?: string;
  file_url_preview?: string;
  thumbnail_url_medium?: string;
  thumbnail_url_large?: string;
  thumbnail_url_huge?: string;
  full_size_x?: number;
  full_size_y?: number;
  screen_size_x?: number;
  screen_size_y?: number;
}

export interface InkbunnyPool {
  pool_id: number;
  name: string;
  description?: string;
  count?: number;
}

export interface InkbunnySearchHit {
  submission_id: number | string;
  username?: string;
  user_id?: number | string;
  title?: string;
  create_datetime?: string;
  rating_id?: number | string;
  rating_name?: string;
  mimetype?: string;
  pagecount?: number | string;
  submission_type_id?: number | string;
  type_name?: string;
  hidden?: string;
  deleted?: string;
  friends_only?: string;
  file_url_full?: string;
  file_url_screen?: string;
  file_url_preview?: string;
  thumbnail_url_medium?: string;
  thumbnail_url_large?: string;
  thumbnail_url_huge?: string;
  thumb_medium_x?: number | string;
  thumb_medium_y?: number | string;
  file_name?: string;
}

export interface InkbunnySubmission extends InkbunnySearchHit {
  description?: string;
  writing?: string;
  favorite?: string;
  favorites_count?: number | string;
  comments_count?: number | string;
  views?: number | string;
  keywords?: Array<{ keyword_id?: number; keyword_name: string }>;
  files?: InkbunnyFile[];
  pools?: InkbunnyPool[];
  full_file_md5?: string;
}

export interface InkbunnyLoginResult {
  sid: string;
  userId: number;
  username: string;
  ratingsmask?: string;
}

function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/inkbunny`;
}

function ibError(data: { error_message?: string; error_code?: number }): Error {
  const code = data.error_code;
  const msg = data.error_message || "Inkbunny error";
  return new Error(code != null ? `Inkbunny (${code}): ${msg}` : `Inkbunny: ${msg}`);
}

async function postForm<T extends Record<string, unknown>>(
  path: string,
  fields: Record<string, string | number | undefined | null>,
): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    body.set(key, String(value));
  }
  const response = await fetch(`${proxyBase()}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Inkbunny proxy error: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as T & { error_code?: number; error_message?: string };
  if (data.error_code != null || data.error_message) {
    throw ibError(data);
  }
  return data;
}

async function getJson<T extends Record<string, unknown>>(
  path: string,
  params: Record<string, string | number | undefined | null>,
): Promise<T> {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    q.set(key, String(value));
  }
  const response = await fetch(`${proxyBase()}/${path}?${q}`);
  if (!response.ok) {
    throw new Error(`Inkbunny proxy error: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as T & { error_code?: number; error_message?: string };
  if (data.error_code != null || data.error_message) {
    throw ibError(data);
  }
  return data;
}

function asList<T>(value: T[] | Record<string, T> | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function yn(value: unknown): boolean {
  return value === "t" || value === true || value === "yes" || value === 1 || value === "1";
}

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

function adaptRating(ratingId: unknown): "s" | "q" | "e" {
  const id = num(ratingId, 0);
  if (id >= 2) return "e";
  if (id === 1) return "q";
  return "s";
}

/** Rewrite Inkbunny/metapix asset URLs through the download proxy (Referer). */
export function proxyMediaUrl(url?: string | null, sid?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/api/download")) return url;
  let href = url;
  if (
    sid &&
    (href.includes("/private_files/") || href.includes("/private_thumbnails/"))
  ) {
    href += (href.includes("?") ? "&" : "?") + `sid=${encodeURIComponent(sid)}`;
  }
  return `/api/download?url=${encodeURIComponent(href)}`;
}

export function stripBbcode(text: string): string {
  if (!text) return "";
  return text
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, "$2 ($1)")
    .replace(/\[\/?\w+(?:=[^\]]*)?\]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function submissionUrl(id: number): string {
  return `https://inkbunny.net/s/${id}`;
}

export function shouldUseInkbunnyViewer(meta?: {
  pagecount?: number;
  typeId?: number;
}): boolean {
  if (!meta) return false;
  if ((meta.pagecount ?? 1) > 1) return true;
  return meta.typeId === 3 || meta.typeId === 4 || meta.typeId === 12;
}

function pickThumb(hit: InkbunnySearchHit, sid?: string | null): string | null {
  return (
    proxyMediaUrl(hit.thumbnail_url_large || hit.thumbnail_url_huge || hit.thumbnail_url_medium, sid) ||
    proxyMediaUrl(hit.file_url_preview, sid)
  );
}

function pickSample(hit: InkbunnySearchHit, sid?: string | null): string | null {
  return (
    proxyMediaUrl(hit.file_url_screen || hit.file_url_preview, sid) ||
    pickThumb(hit, sid)
  );
}

function pickFull(hit: InkbunnySearchHit, sid?: string | null): string | null {
  return proxyMediaUrl(hit.file_url_full || hit.file_url_screen, sid) || pickSample(hit, sid);
}

export function adaptSearchHit(hit: InkbunnySearchHit, sid?: string | null): Post {
  const id = num(hit.submission_id);
  const tags = emptyTags();
  if (hit.username) tags.artist.push(hit.username);
  const preview = pickThumb(hit, sid);
  const sample = pickSample(hit, sid);
  const full = pickFull(hit, sid);
  const hidden = yn(hit.hidden);
  return {
    id,
    created_at: hit.create_datetime || "",
    updated_at: hit.create_datetime || "",
    file: {
      url: hidden ? null : full,
      ext: (hit.file_name || "").split(".").pop() || "",
      width: num(hit.thumb_medium_x),
      height: num(hit.thumb_medium_y),
      size: 0,
      md5: "",
    },
    preview: {
      url: preview || "",
      width: num(hit.thumb_medium_x, 150),
      height: num(hit.thumb_medium_y, 150),
    },
    sample: {
      has: !!sample,
      url: sample || "",
      width: num(hit.thumb_medium_x),
      height: num(hit.thumb_medium_y),
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
      deleted: yn(hit.deleted),
    },
    rating: adaptRating(hit.rating_id),
    fav_count: 0,
    sources: [submissionUrl(id)],
    pools: [],
    relationships: {
      has_children: false,
      has_active_children: false,
      children: [],
    },
    uploader_id: num(hit.user_id),
    uploader_name: hit.username,
    description: hit.title || "",
    comment_count: 0,
    is_favorited: false,
    has_notes: false,
  };
}

export function adaptDetails(sub: InkbunnySubmission, sid?: string | null): Post {
  const base = adaptSearchHit(sub, sid);
  const keywords = (sub.keywords || [])
    .map((k) => k.keyword_name)
    .filter(Boolean);
  base.tags.general = keywords;
  base.description = stripBbcode(sub.description || "") || sub.title || "";
  base.is_favorited = yn(sub.favorite);
  base.fav_count = num(sub.favorites_count);
  base.comment_count = num(sub.comments_count);
  base.score = {
    up: num(sub.views),
    down: 0,
    total: num(sub.views),
  };
  base.pools = (sub.pools || []).map((p) => num(p.pool_id)).filter(Boolean);
  if (sub.files?.[0]) {
    const f = sub.files[0];
    base.file.width = num(f.full_size_x || f.screen_size_x, base.file.width);
    base.file.height = num(f.full_size_y || f.screen_size_y, base.file.height);
    base.file.ext = (f.file_name || "").split(".").pop() || base.file.ext;
    base.file.url = pickFull(
      {
        ...sub,
        file_url_full: f.file_url_full || sub.file_url_full,
        file_url_screen: f.file_url_screen || sub.file_url_screen,
      },
      sid,
    );
    base.preview.url =
      proxyMediaUrl(f.thumbnail_url_medium || f.thumbnail_url_large, sid) || base.preview.url;
    base.sample.url =
      proxyMediaUrl(f.file_url_screen || f.file_url_preview, sid) || base.sample.url;
  }
  if (sub.full_file_md5) base.file.md5 = sub.full_file_md5;
  return base;
}

export interface InkbunnyMeta {
  title: string;
  pagecount: number;
  typeId: number;
  typeName?: string;
  detailsLoaded: boolean;
  writing: string;
  files: InkbunnyFile[];
}

export function inkbunnyMetaFromHit(
  hit: InkbunnySearchHit | InkbunnySubmission,
  sid?: string | null,
  detailsLoaded = false,
): InkbunnyMeta {
  const files = ((hit as InkbunnySubmission).files || []).map((f) => ({
    ...f,
    file_url_full: proxyMediaUrl(f.file_url_full, sid) || undefined,
    file_url_screen: proxyMediaUrl(f.file_url_screen, sid) || undefined,
    file_url_preview: proxyMediaUrl(f.file_url_preview, sid) || undefined,
    thumbnail_url_medium: proxyMediaUrl(f.thumbnail_url_medium, sid) || undefined,
    thumbnail_url_large: proxyMediaUrl(f.thumbnail_url_large, sid) || undefined,
    thumbnail_url_huge: proxyMediaUrl(f.thumbnail_url_huge, sid) || undefined,
  }));
  return {
    title: hit.title || "",
    pagecount: Math.max(1, num(hit.pagecount, files.length || 1)),
    typeId: num(hit.submission_type_id),
    typeName: hit.type_name,
    detailsLoaded,
    writing: stripBbcode((hit as InkbunnySubmission).writing || ""),
    files,
  };
}

export interface MappedInkbunnySearch {
  text: string;
  username?: string;
  unread?: boolean;
  favsMe?: boolean;
  poolId?: number;
  random?: boolean;
  orderby?: string;
}

export function mapSearchTags(tags: string[]): MappedInkbunnySearch {
  const text: string[] = [];
  const mapped: MappedInkbunnySearch = { text: "" };
  for (const raw of tags.filter(Boolean)) {
    const tag = raw.trim();
    const lower = tag.toLowerCase();
    if (lower.startsWith("order:")) {
      if (lower === "order:random") mapped.random = true;
      else if (lower === "order:score" || lower === "order:favcount") mapped.orderby = "views";
      else if (lower === "order:newest" || lower === "order:id_desc") mapped.orderby = "create_datetime";
      continue;
    }
    if (lower.startsWith("user:") || lower.startsWith("artist:")) {
      mapped.username = tag.slice(tag.indexOf(":") + 1);
      continue;
    }
    if (lower === "unread:yes" || lower === "unread") {
      mapped.unread = true;
      continue;
    }
    if (lower === "favs:me" || lower === "fav:me") {
      mapped.favsMe = true;
      continue;
    }
    if (lower.startsWith("pool:")) {
      const id = num(tag.slice(5));
      if (id) mapped.poolId = id;
      continue;
    }
    text.push(tag.replace(/_/g, " "));
  }
  mapped.text = text.join(" ");
  return mapped;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

let guestSid: string | null = null;

export async function login(username: string, password?: string): Promise<InkbunnyLoginResult> {
  const data = await postForm<{ sid: string; user_id?: number | string; ratingsmask?: string }>(
    "login",
    { username, password: password || undefined },
  );
  if (!data.sid) throw new Error("Inkbunny login did not return a SID");
  ridCache = null;
  const userId = num(data.user_id);
  if (username.toLowerCase() === "guest") {
    guestSid = data.sid;
    await enableAllGuestRatings(data.sid);
  } else {
    guestSid = null;
  }
  return { sid: data.sid, userId, username, ratingsmask: data.ratingsmask };
}

export async function logout(sid: string): Promise<void> {
  try {
    await postForm("logout", { sid });
  } catch {
    // SID may already be dead
  }
  if (guestSid === sid) guestSid = null;
  ridCache = null;
}

async function enableAllGuestRatings(sid: string): Promise<void> {
  try {
    await postForm("ratings", {
      sid,
      "tag[2]": "yes",
      "tag[3]": "yes",
      "tag[4]": "yes",
      "tag[5]": "yes",
    });
  } catch {
    // Guest browse still works with default ratings if this fails.
  }
}

export async function ensureSid(preferred?: string | null): Promise<string> {
  if (preferred) return preferred;
  if (guestSid) return guestSid;
  const result = await login("guest");
  return result.sid;
}

async function withSidRetry<T>(
  sid: string,
  isGuestSid: boolean,
  run: (sid: string) => Promise<T>,
): Promise<T> {
  try {
    return await run(sid);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const expired = isInkbunnyCode(error, 2) || /invalid session/i.test(message);
    if (!expired) throw error;
    if (!isGuestSid) {
      throw new Error("Inkbunny session expired. Log in again in Account settings.");
    }
    guestSid = null;
    const fresh = await login("guest");
    return run(fresh.sid);
  }
}

// ---------------------------------------------------------------------------
// Search (RID pagination)
// ---------------------------------------------------------------------------

let ridCache: { key: string; rid: string } | null = null;

function searchKey(mapped: MappedInkbunnySearch, userId?: number | null): string {
  return JSON.stringify({ ...mapped, userId: mapped.favsMe ? userId : null });
}

function isInkbunnyCode(error: unknown, code: number): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(`Inkbunny (${code}):`);
}

export async function searchSubmissions(args: {
  tags: string[];
  page: number;
  limit: number;
  sid?: string | null;
  userId?: number | null;
}): Promise<{ posts: Post[]; hits: InkbunnySearchHit[]; total: number; sid: string }> {
  const mapped = mapSearchTags(args.tags);
  const sid = await ensureSid(args.sid);
  const isGuest = !args.sid || args.sid === guestSid;
  const page = Math.max(1, args.page || 1);
  const key = searchKey(mapped, args.userId);

  const run = async (sessionId: string, useRid: boolean) => {
    const fields: Record<string, string | number> = {
      sid: sessionId,
      submissions_per_page: Math.min(100, Math.max(1, args.limit || 30)),
      page,
    };
    if (useRid && ridCache?.rid) {
      fields.rid = ridCache.rid;
    } else {
      fields.get_rid = "yes";
      if (mapped.text) fields.text = mapped.text;
      if (mapped.username) fields.username = mapped.username;
      if (mapped.unread) fields.unread_submissions = "yes";
      if (mapped.favsMe) {
        if (!args.userId) throw new Error("Log in to Inkbunny to search your favorites.");
        fields.favs_user_id = args.userId;
      }
      if (mapped.poolId) fields.pool_id = mapped.poolId;
      if (mapped.orderby) fields.orderby = mapped.orderby;
      if (mapped.random) fields.random = "yes";
    }

    const data = await postForm<{
      rid?: string;
      results_count_all?: number | string;
      submissions?: InkbunnySearchHit[];
    }>("search", fields);

    if (data.rid) ridCache = { key, rid: data.rid };
    const hits = asList(data.submissions);
    return {
      posts: hits.map((hit) => adaptSearchHit(hit, sessionId)),
      hits,
      total: num(data.results_count_all),
      sid: sessionId,
    };
  };

  return withSidRetry(sid, isGuest, async (sessionId) => {
    const useRid = page > 1 && ridCache?.key === key && !!ridCache.rid;
    try {
      return await run(sessionId, useRid);
    } catch (error) {
      if (useRid && (isInkbunnyCode(error, 3) || isInkbunnyCode(error, 4))) {
        ridCache = null;
        return run(sessionId, false);
      }
      throw error;
    }
  });
}

export async function getSubmissions(args: {
  ids: number[];
  sid?: string | null;
}): Promise<InkbunnySubmission[]> {
  if (!args.ids.length) return [];
  const sid = await ensureSid(args.sid);
  const isGuest = !args.sid || args.sid === guestSid;
  return withSidRetry(sid, isGuest, async (sessionId) => {
    const data = await postForm<{ submissions?: InkbunnySubmission[] }>("submissions", {
      sid: sessionId,
      submission_ids: args.ids.slice(0, 100).join(","),
      show_description: "yes",
      show_writing: "yes",
      show_pools: "yes",
    });
    return asList(data.submissions);
  });
}

export async function searchKeywords(args: {
  query: string;
  sid?: string | null;
}): Promise<Tag[]> {
  const q = (args.query || "").replace(/\*/g, "").trim();
  if (!q) return [];
  const data = await getJson<{
    results?: Array<{ id?: number | string; singleword?: string; submissions_count?: number | string }>;
  }>("keywords", {
    keyword: q,
    ratingsmask: "11111",
  });
  const results = asList(data.results);
  return results.map((r) => ({
    id: num(r.id),
    name: decodeHtml(r.singleword || ""),
    post_count: num(r.submissions_count),
    related_tags: "",
    related_tags_updated_at: new Date(),
    category: 0,
    is_locked: false,
    created_at: new Date(),
    updated_at: new Date(),
  }));
}

export async function getWatchlist(sid: string): Promise<Array<{ user_id: number; username: string }>> {
  const data = await postForm<{
    watches?: Array<{ user_id?: number | string; username?: string }>;
  }>("watchlist", { sid });
  const watches = asList(data.watches);
  return watches
    .map((w) => ({ user_id: num(w.user_id), username: w.username || "" }))
    .filter((w) => w.username);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
