/**
 * Murrtube adapter — Inertia `data-page` JSON via /api/murrtube (age-gated).
 * Playback is HLS (`file.ext` = m3u8); client attaches hls.js when needed.
 */
import type { Post, PostTags, Tag } from "@/worker/api/returnTypes";

const ORIGIN = "https://murrtube.net";

export type MurrtubeMeta = {
  id: string;
  shortCode: string;
  hlsUrl?: string | null;
  title?: string;
};

const softIdByNumeric = new Map<number, string>();

function rememberId(softId: string, numericId: number) {
  if (softId && numericId) softIdByNumeric.set(numericId, softId);
}

export function softIdForNumeric(id: number): string | null {
  return softIdByNumeric.get(id) || null;
}

function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/murrtube`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** Stable positive Post.id from UUID / short code. */
export function murrtubeNumericId(id: string): number {
  const s = String(id || "").trim();
  if (!s) return 1;
  const n = Math.abs(hashString(s)) || 1;
  return n;
}

function rewriteMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, ORIGIN);
    const host = u.hostname.toLowerCase();
    if (host === "storage.murrtube.net" || host.endsWith(".murrtube.net")) {
      return `${proxyBase()}/media?url=${encodeURIComponent(u.href)}`;
    }
  } catch {
    /* ignore */
  }
  return url;
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

function asTagNames(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object") {
        const o = x as { name?: string; slug?: string };
        return o.name || o.slug || "";
      }
      return "";
    })
    .map((s) => s.trim().replace(/\s+/g, "_"))
    .filter(Boolean);
}

type MurrUser = {
  id?: string;
  slug?: string;
  name?: string;
};

type MurrMedium = {
  id?: string;
  short_code?: string;
  title?: string;
  description?: string | null;
  url?: string;
  duration?: number;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  hls_url?: string | null;
  likes_count?: number;
  views_count?: number;
  published_at?: string | null;
  created_at?: string | null;
  tags?: unknown;
  user?: MurrUser | null;
};

export function adaptMedium(raw: MurrMedium): Post {
  const softId = String(raw.id || raw.short_code || "").trim();
  const numericId = murrtubeNumericId(softId || raw.short_code || "0");
  rememberId(softId || String(raw.short_code || ""), numericId);
  const artist =
    (raw.user?.slug || raw.user?.name || "").trim().replace(/\s+/g, "_") || "unknown";
  const tags = emptyTags();
  tags.artist = [artist];
  tags.general = asTagNames(raw.tags);
  const thumb = rewriteMediaUrl(raw.thumbnail_url) || "";
  const preview = rewriteMediaUrl(raw.preview_url) || thumb;
  const hls = rewriteMediaUrl(raw.hls_url);
  const pageUrl = raw.url?.startsWith("http")
    ? raw.url
    : `${ORIGIN}${raw.url || `/v/${raw.short_code || softId}`}`;
  const created = raw.published_at || raw.created_at || new Date().toISOString();
  const post = {
    id: numericId,
    created_at: created,
    updated_at: created,
    file: {
      width: 1280,
      height: 720,
      ext: "m3u8",
      size: 0,
      md5: softId.replace(/-/g, "").slice(0, 32) || String(numericId),
      url: hls,
    },
    preview: { width: 320, height: 180, url: thumb || preview },
    sample: { has: !!preview, width: 640, height: 360, url: preview || thumb },
    score: {
      up: raw.likes_count || 0,
      down: 0,
      total: raw.likes_count || 0,
    },
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
    rating: "e" as const,
    fav_count: raw.likes_count || 0,
    sources: [pageUrl],
    pools: [],
    relationships: {
      has_children: false,
      has_active_children: false,
      children: [],
    },
    approver_id: undefined,
    uploader_id: 0,
    description: raw.title || raw.description || "",
    comment_count: 0,
    is_favorited: false,
    has_notes: false,
    duration: raw.duration || null,
  } as unknown as Post & { __meta: { murrtube: MurrtubeMeta } };
  post.__meta = {
    murrtube: {
      id: softId,
      shortCode: String(raw.short_code || ""),
      hlsUrl: raw.hls_url || null,
      title: String(raw.title || "").trim() || undefined,
    },
  };
  return post;
}

async function fetchInertia(path: string): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(`${proxyBase()}/inertia?${qs}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Murrtube proxy ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function searchBrowse(args: {
  tags?: string;
  page: number;
  limit: number;
}): Promise<{ posts: Post[]; hasMore: boolean }> {
  const q = (args.tags || "").trim();
  const page = Math.max(1, args.page || 1);
  let path = "/";
  if (q) {
    path = `/?q=${encodeURIComponent(q)}`;
  }
  if (page > 1) {
    const join = path.includes("?") ? "&" : "?";
    path = `${path}${join}page=${page}`;
  }
  const data = await fetchInertia(path);
  const props = (data.props || {}) as {
    media?: MurrMedium[];
    pagination?: { page?: number; pages?: number; next?: number | null };
  };
  const media = Array.isArray(props.media) ? props.media : [];
  // Home cards omit hls_url; fullscreen enrich (fetchMedium) fills file.url.
  const posts = media.map(adaptMedium);
  const pag = props.pagination;
  const hasMore =
    pag?.next != null ||
    (pag?.page != null && pag?.pages != null && pag.page < pag.pages) ||
    posts.length >= Math.min(args.limit || 60, 60);
  return { posts: posts.slice(0, args.limit || 75), hasMore };
}

export async function fetchMedium(shortCodeOrId: string): Promise<Post | null> {
  const id = String(shortCodeOrId || "").trim();
  if (!id) return null;
  const path = id.includes("-") && id.length > 8 ? `/videos/x-${id}` : `/v/${id}`;
  try {
    const data = await fetchInertia(path.startsWith("/v/") ? path : `/v/${id}`);
    const medium = (data.props as { medium?: MurrMedium } | undefined)?.medium;
    return medium ? adaptMedium(medium) : null;
  } catch {
    return null;
  }
}

export async function searchTags(args: {
  tags?: string;
  limit?: number;
}): Promise<Tag[]> {
  const q = (args.tags || "").trim().toLowerCase();
  if (!q) return [];
  // No public tag autocomplete; suggest the typed token.
  return [
    {
      id: Math.abs(hashString(q)) || 1,
      name: q.replace(/\s+/g, "_"),
      post_count: 0,
      category: 0,
      related_tags: "",
      related_tags_updated_at: new Date(0),
      is_locked: false,
      created_at: new Date(0),
      updated_at: new Date(0),
    } as Tag,
  ];
}
