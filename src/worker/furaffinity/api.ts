/**
 * Fur Affinity client. JSON calls go through /api/furaffinity/* (serve.py or
 * the Vite proxy). Media is rewritten to /api/download so the proxy can send
 * Referer + cookies.
 *
 * Auth: cookies `a` and `b` stored in the site profile as apiKey
 * (`a=…;b=…`). If omitted, the server uses FA_COOKIE_A/B or a guest session.
 */

import type { Comment, Post, PostTags, Tag } from "@/worker/api/returnTypes";

export interface FaUserPartial {
  name: string;
  status?: string;
  title?: string;
  avatar_url?: string;
}

export interface FaPartial {
  id: number;
  title: string;
  author: FaUserPartial | string;
  rating: string;
  type: string;
  thumbnail_url: string;
  kind?: "submission" | "journal";
  date?: string;
  tags?: string[];
  category?: string;
  species?: string;
  description?: string;
  file_url?: string;
  views?: number;
  comment_count?: number;
  favorites?: number;
  favorite?: boolean;
  favorite_toggle_link?: string;
  comments?: Comment[];
  details?: boolean;
}

export interface FaMeta {
  title: string;
  kind: "submission" | "journal";
  detailsLoaded: boolean;
  faType: string;
}

export interface MappedFaSearch {
  text: string;
  username?: string;
  scraps?: boolean;
  favsUser?: string;
  journals?: boolean;
  orderBy?: "date" | "relevancy" | "popularity";
  random?: boolean;
  ratings: string[];
}

function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/furaffinity`;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function authorName(author: FaUserPartial | string | undefined): string {
  if (!author) return "";
  if (typeof author === "string") return author;
  return author.name || "";
}

function absFaUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://www.furaffinity.net${url}`;
  return url;
}

export function proxyMediaUrl(url?: string | null, cookies?: string | null): string | null {
  const href = absFaUrl(url);
  if (!href) return null;
  if (href.startsWith("/api/download")) return href;
  let out = `/api/download?url=${encodeURIComponent(href)}`;
  if (cookies) out += `&fa=${encodeURIComponent(cookies)}`;
  return out;
}

export function submissionUrl(id: number): string {
  return `https://www.furaffinity.net/view/${id}`;
}

export function journalUrl(id: number): string {
  return `https://www.furaffinity.net/journal/${id}`;
}

function adaptRating(raw?: string): "s" | "q" | "e" {
  const value = (raw || "general").toLowerCase();
  if (value.includes("adult") || value === "e" || value.includes("explicit")) return "e";
  if (value.includes("mature") || value === "q" || value.includes("questionable")) return "q";
  return "s";
}

function extFromUrl(url?: string | null, type?: string): string {
  const path = (url || "").split("?")[0] || "";
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (ext && ext.length <= 5 && /^[a-z0-9]+$/.test(ext)) return ext;
  const t = (type || "image").toLowerCase();
  if (t === "text" || t === "story") return "txt";
  if (t === "music") return "mp3";
  if (t === "flash") return "swf";
  return "jpg";
}

function stripHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function faRequest<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${proxyBase()}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { ok?: boolean; message?: string };
  if (!response.ok || (data && data.ok === false)) {
    throw new Error(data?.message || `FurAffinity ${action} failed (${response.status})`);
  }
  return data;
}

export function mapSearchTags(tags: string[]): MappedFaSearch {
  const text: string[] = [];
  const mapped: MappedFaSearch = { text: "", ratings: [] };
  for (const raw of tags.filter(Boolean)) {
    const tag = raw.trim();
    const lower = tag.toLowerCase();
    if (lower.startsWith("order:")) {
      if (lower === "order:random") mapped.random = true;
      else if (lower === "order:score") mapped.orderBy = "popularity";
      else if (lower === "order:newest" || lower === "order:id_desc") mapped.orderBy = "date";
      else if (lower === "order:id") mapped.orderBy = "date";
      continue;
    }
    if (lower.startsWith("rating:")) {
      const rating = lower.slice("rating:".length);
      if (rating === "s" || rating === "safe" || rating === "general") mapped.ratings.push("general");
      else if (rating === "q" || rating === "questionable" || rating === "mature") mapped.ratings.push("mature");
      else if (rating === "e" || rating === "explicit" || rating === "adult") mapped.ratings.push("adult");
      continue;
    }
    if (lower.startsWith("user:") || lower.startsWith("artist:")) {
      mapped.username = tag.slice(tag.indexOf(":") + 1);
      continue;
    }
    if (lower.startsWith("scraps:")) {
      mapped.username = tag.slice(tag.indexOf(":") + 1);
      mapped.scraps = true;
      continue;
    }
    if (lower === "favs:me" || lower === "fav:me") {
      mapped.favsUser = "me";
      continue;
    }
    if (lower.startsWith("favs:") || lower.startsWith("fav:")) {
      mapped.favsUser = tag.slice(tag.indexOf(":") + 1);
      continue;
    }
    if (lower.startsWith("journals:") || lower.startsWith("journal:")) {
      mapped.username = tag.slice(tag.indexOf(":") + 1);
      mapped.journals = true;
      continue;
    }
    text.push(tag.replace(/_/g, " "));
  }
  mapped.text = text.join(" ");
  return mapped;
}

export function adaptPartial(hit: FaPartial, cookies?: string | null): Post {
  const id = num(hit.id);
  const artist = authorName(hit.author);
  const tags = emptyTags();
  if (artist) tags.artist.push(artist);
  if (hit.species) tags.species.push(hit.species.replace(/ /g, "_").toLowerCase());
  if (hit.category) tags.meta.push(hit.category.replace(/ \/ /g, "_").replace(/ /g, "_").toLowerCase());
  for (const tag of hit.tags || []) {
    if (tag) tags.general.push(tag.replace(/ /g, "_"));
  }
  const kind = hit.kind === "journal" ? "journal" : "submission";
  const thumb = kind === "journal" ? null : proxyMediaUrl(hit.thumbnail_url, cookies);
  const file = kind === "journal" ? null : proxyMediaUrl(hit.file_url || hit.thumbnail_url, cookies);
  const created = hit.date || "";
  const views = num(hit.views);
  const ext = kind === "journal" ? "txt" : extFromUrl(hit.file_url || hit.thumbnail_url, hit.type);
  return {
    id,
    created_at: created,
    updated_at: created,
    file: {
      url: file,
      ext,
      width: 400,
      height: 400,
      size: 0,
      md5: "",
    },
    preview: {
      url: thumb || "",
      width: 400,
      height: 400,
    },
    sample: {
      has: !!file,
      url: file || thumb || "",
      width: 400,
      height: 400,
    },
    score: { up: views, down: 0, total: views },
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
    rating: adaptRating(hit.rating),
    fav_count: num(hit.favorites),
    sources: [kind === "journal" ? journalUrl(id) : submissionUrl(id)],
    pools: [],
    relationships: {
      has_children: false,
      has_active_children: false,
      children: [],
    },
    uploader_id: 0,
    uploader_name: artist,
    description: stripHtml(hit.description || "") || hit.title || "",
    comment_count: num(hit.comment_count),
    is_favorited: !!hit.favorite,
    has_notes: false,
  };
}

export function faMetaFrom(hit: FaPartial, detailsLoaded = false): FaMeta {
  return {
    title: hit.title || "",
    kind: hit.kind === "journal" ? "journal" : "submission",
    detailsLoaded: detailsLoaded || !!hit.details || hit.kind === "journal",
    faType: hit.type || "",
  };
}

let cachedMe: { cookies: string; username: string } | null = null;
const favPageCache = new Map<string, string[]>();

function cookieField(cookies?: string | null): Record<string, string> {
  return cookies ? { cookies } : {};
}

export async function login(username: string, password: string): Promise<{ username: string; cookies: string }> {
  const data = await faRequest<{ username: string; cookies: string }>("login", { username, password });
  cachedMe = { cookies: data.cookies, username: data.username };
  return data;
}

export async function me(cookies?: string | null): Promise<{ username: string }> {
  const key = cookies || "";
  if (cachedMe && cachedMe.cookies === key) return { username: cachedMe.username };
  const data = await faRequest<{ username: string }>("me", cookieField(cookies));
  cachedMe = { cookies: key, username: data.username };
  return data;
}

export async function logoutLocal(): Promise<void> {
  cachedMe = null;
  favPageCache.clear();
}

async function resolveMeName(cookies?: string | null, fallback?: string | null): Promise<string> {
  if (fallback) return fallback;
  const user = await me(cookies);
  return user.username;
}

export async function searchSubmissions(args: {
  tags: string[];
  page: number;
  limit: number;
  cookies?: string | null;
  username?: string | null;
}): Promise<{ posts: Post[]; hits: FaPartial[] }> {
  const mapped = mapSearchTags(args.tags);
  const page = Math.max(1, args.page || 1);
  const cookies = args.cookies ?? null;
  const extra = cookieField(cookies);

  let data: { results?: FaPartial[]; next?: unknown };
  if (mapped.journals && mapped.username) {
    const user = mapped.username === "me" ? await resolveMeName(cookies, args.username) : mapped.username;
    data = await faRequest("journals", { ...extra, username: user, page });
  } else if (mapped.favsUser) {
    const user =
      mapped.favsUser === "me" ? await resolveMeName(cookies, args.username) : mapped.favsUser;
    const key = `${cookies || ""}:${user}`;
    const tokens = favPageCache.get(key) || [""];
    while (tokens.length < page) {
      const prev = tokens[tokens.length - 1];
      const walk = await faRequest<{ next?: string | null }>("favorites", {
        ...extra,
        username: user,
        page: prev,
      });
      const next = walk.next == null ? "" : String(walk.next);
      if (!next || next === prev) break;
      tokens.push(next);
    }
    favPageCache.set(key, tokens);
    const token = tokens[page - 1] ?? "";
    data = await faRequest("favorites", { ...extra, username: user, page: token });
    if (data.next) {
      tokens[page] = String(data.next);
      favPageCache.set(key, tokens);
    }
  } else if (mapped.username && mapped.scraps) {
    data = await faRequest("scraps", { ...extra, username: mapped.username, page });
  } else if (mapped.username) {
    data = await faRequest("gallery", { ...extra, username: mapped.username, page });
  } else if (mapped.text) {
    data = await faRequest("search", {
      ...extra,
      q: mapped.text,
      page,
      order_by: mapped.orderBy || "date",
      ratings: mapped.ratings.length ? mapped.ratings : undefined,
    });
  } else {
    data = await faRequest("browse", { ...extra, page });
  }

  let hits = data.results || [];
  if (mapped.random) {
    hits = [...hits].sort(() => Math.random() - 0.5);
  }
  const posts = hits.map((hit) => adaptPartial(hit, cookies));
  return { posts, hits };
}

export async function getSubmission(id: number, cookies?: string | null): Promise<FaPartial> {
  return faRequest("submission", { ...cookieField(cookies), id });
}

export async function getJournal(id: number, cookies?: string | null): Promise<FaPartial> {
  return faRequest("journal", { ...cookieField(cookies), id });
}

export async function favoriteSubmission(id: number, cookies?: string | null): Promise<void> {
  await faRequest("favorite", { ...cookieField(cookies), id });
}

export async function unfavoriteSubmission(id: number, cookies?: string | null): Promise<void> {
  await faRequest("unfavorite", { ...cookieField(cookies), id });
}

export async function createComment(id: number, body: string, cookies?: string | null): Promise<void> {
  await faRequest("comment", { ...cookieField(cookies), id, body });
}

export async function getWatchlist(cookies?: string | null, username?: string | null): Promise<Array<{ name: string }>> {
  const data = await faRequest<{ results?: Array<{ name: string }> }>("watchlist", {
    ...cookieField(cookies),
    username: username || undefined,
  });
  return data.results || [];
}

export async function searchKeywords(query: string): Promise<Tag[]> {
  const q = (query || "").replace(/\*/g, "").trim();
  if (!q) return [];
  return [
    {
      id: 0,
      name: q.replace(/ /g, "_"),
      post_count: 0,
      related_tags: "",
      related_tags_updated_at: new Date(),
      category: 0,
      is_locked: false,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];
}

export async function getComments(id: number, cookies?: string | null): Promise<Comment[]> {
  const sub = await getSubmission(id, cookies);
  return (sub.comments || []).map((c) => ({
    ...c,
    body: stripHtml(c.body || ""),
  }));
}
