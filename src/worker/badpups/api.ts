/**
 * Badpups adapter — WordPress HTML listings + JSON-LD detail; Bunny CDN MP4/HLS.
 */
import type { Post, PostTags, Tag } from "@/worker/api/returnTypes";
import { proxyDownloadUrl } from "@/misc/util/mediaProxy";

const ORIGIN = "https://badpups.com";
const BUNNY_GUID_RE =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export type BadpupsMeta = {
  slug: string;
  guid?: string | null;
  pageUrl: string;
  title?: string;
};

const slugByNumeric = new Map<number, string>();

function rememberSlug(slug: string, numericId: number) {
  if (slug && numericId) slugByNumeric.set(numericId, slug);
}

export function slugForNumeric(id: number): string | null {
  return slugByNumeric.get(id) || null;
}

function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/badpups`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export function badpupsNumericId(slugOrGuid: string): number {
  const s = String(slugOrGuid || "").trim();
  if (!s) return 1;
  return Math.abs(hashString(s)) || 1;
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

function bunnyUrls(guid: string): { mp4: string; hls: string; thumb: string } {
  const base = `https://vz-4189b02a-6f9.b-cdn.net/${guid}`;
  return {
    mp4: `${base}/play_720p.mp4`,
    hls: `${base}/playlist.m3u8`,
    thumb: `${base}/thumbnail.jpg`,
  };
}

function mediaUrl(absolute: string): string {
  return proxyDownloadUrl(absolute) || absolute;
}

function slugFromUrl(href: string): string | null {
  try {
    const u = new URL(href, ORIGIN);
    if (u.hostname.replace(/^www\./, "") !== "badpups.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    const skip = new Set([
      "videos",
      "lite",
      "login",
      "register",
      "feed",
      "upload",
      "wp-json",
      "wp-content",
      "tag",
      "category",
      "page",
      "embed",
      "staff",
    ]);
    if (parts[0] === "lite" && parts[1] === "video" && parts[2]) return parts[2];
    if (parts.length === 1 && !skip.has(parts[0])) return parts[0];
    return null;
  } catch {
    return null;
  }
}

export type BadpupsListCard = {
  slug: string;
  title: string;
  thumbUrl: string | null;
  guid: string | null;
  durationSec: number | null;
  categories: string[];
};

/** Parse `/videos/` (or search) HTML article cards. */
export function parseListingHtml(html: string): BadpupsListCard[] {
  const articles = html.match(/<article[\s\S]*?<\/article>/gi) || [];
  const out: BadpupsListCard[] = [];
  const seen = new Set<string>();
  for (const art of articles) {
    const href =
      art.match(/href="(https?:\/\/badpups\.com\/[^"]+)"/i)?.[1] ||
      art.match(/href="(\/[^"]+)"/i)?.[1];
    if (!href) continue;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const title =
      art.match(/title="([^"]+)"/i)?.[1] ||
      art.match(/alt="([^"]+)"/i)?.[1] ||
      slug.replace(/-/g, " ");
    const thumb =
      art.match(/data-src="(https:\/\/vz-[^"]+thumbnail\.jpg)"/i)?.[1] ||
      art.match(/data-src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i)?.[1] ||
      null;
    const guid = thumb?.match(BUNNY_GUID_RE)?.[1] || null;
    const durLabel = art.match(/class="duration"[^>]*>\s*([\d:]+)/i)?.[1];
    let durationSec: number | null = null;
    if (durLabel) {
      const parts = durLabel.trim().split(":").map((x) => Number(x));
      if (parts.every((n) => Number.isFinite(n))) {
        durationSec = parts.reduce((acc, n) => acc * 60 + n, 0);
      }
    }
    const categories = [
      ...art.matchAll(/category-([a-z0-9-]+)/gi),
    ].map((m) => m[1].replace(/-/g, "_"));
    out.push({
      slug,
      title: title.trim(),
      thumbUrl: thumb,
      guid,
      durationSec,
      categories,
    });
  }
  return out;
}

export type BadpupsDetail = {
  slug: string;
  title: string;
  description: string;
  thumbUrl: string | null;
  guid: string | null;
  durationSec: number | null;
  tags: string[];
  pageUrl: string;
  uploadDate: string | null;
};

export function parseDetailHtml(html: string, slugHint?: string): BadpupsDetail | null {
  let ld: Record<string, unknown> | null = null;
  for (const m of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const data = JSON.parse(m[1]) as Record<string, unknown>;
      if (data["@type"] === "VideoObject") {
        ld = data;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  const embedGuid =
    html.match(/mediadelivery\.net\/embed\/\d+\/([0-9a-f-]{36})/i)?.[1] ||
    html.match(/\/embed\/([0-9a-f-]{36})/i)?.[1] ||
    null;
  const thumbFromLd = Array.isArray(ld?.thumbnailUrl)
    ? String((ld?.thumbnailUrl as string[])[0] || "")
    : typeof ld?.thumbnailUrl === "string"
      ? ld.thumbnailUrl
      : null;
  const guid =
    embedGuid ||
    thumbFromLd?.match(BUNNY_GUID_RE)?.[1] ||
    html.match(BUNNY_GUID_RE)?.[1] ||
    null;
  const slug =
    slugHint ||
    slugFromUrl(
      typeof ld?.contentUrl === "string" ? ld.contentUrl : "",
    ) ||
    html.match(/rel="canonical" href="([^"]+)"/i)?.[1]?.split("/")?.filter(Boolean).pop() ||
    null;
  if (!slug && !guid) return null;
  const durationIso = typeof ld?.duration === "string" ? ld.duration : null;
  let durationSec: number | null = null;
  if (durationIso) {
    const m = durationIso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
    if (m) {
      durationSec =
        (Number(m[1] || 0) * 3600) +
        (Number(m[2] || 0) * 60) +
        Number(m[3] || 0);
    }
  }
  const tags = [
    ...html.matchAll(/\/lite\/video-tags\/([^"'/]+)/gi),
  ].map((x) => decodeURIComponent(x[1]).replace(/-/g, "_"));
  const cats = [
    ...html.matchAll(/\/lite\/video-categories\/([^"'/]+)/gi),
  ].map((x) => decodeURIComponent(x[1]).replace(/-/g, "_"));
  const pageUrl = `${ORIGIN}/${slug || ""}`;
  return {
    slug: slug || guid || "video",
    title: String(ld?.name || slug || "Video"),
    description: String(ld?.description || ""),
    thumbUrl: thumbFromLd || (guid ? bunnyUrls(guid).thumb : null),
    guid,
    durationSec,
    tags: [...new Set([...tags, ...cats])],
    pageUrl,
    uploadDate: typeof ld?.uploadDate === "string" ? ld.uploadDate : null,
  };
}

function cardToPost(card: BadpupsListCard): Post {
  const numericId = badpupsNumericId(card.slug);
  rememberSlug(card.slug, numericId);
  const tags = emptyTags();
  // Listing exposes WP categories only — no per-uploader field on cards.
  tags.general = card.categories;
  const guid = card.guid;
  const bunny = guid ? bunnyUrls(guid) : null;
  const thumb = card.thumbUrl || bunny?.thumb || "";
  const fileUrl = bunny ? mediaUrl(bunny.mp4) : null;
  const created = new Date().toISOString();
  const post = {
    id: numericId,
    created_at: created,
    updated_at: created,
    file: {
      // Default 16:9 — thumbs are landscape; portrait hardcode letterboxed cards.
      width: 1280,
      height: 720,
      ext: "mp4",
      size: 0,
      md5: (guid || card.slug).replace(/-/g, "").slice(0, 32),
      url: fileUrl,
    },
    preview: { width: 320, height: 180, url: mediaUrl(thumb) },
    sample: { has: !!thumb, width: 640, height: 360, url: mediaUrl(thumb) },
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
    rating: "e" as const,
    fav_count: 0,
    sources: [`${ORIGIN}/${card.slug}/`],
    pools: [],
    relationships: {
      has_children: false,
      has_active_children: false,
      children: [],
    },
    approver_id: undefined,
    uploader_id: 0,
    description: card.title,
    comment_count: 0,
    is_favorited: false,
    has_notes: false,
    duration: card.durationSec,
  } as unknown as Post & { __meta: { badpups: BadpupsMeta } };
  post.__meta = {
    badpups: {
      slug: card.slug,
      guid,
      pageUrl: `${ORIGIN}/${card.slug}/`,
      title: card.title,
    },
  };
  return post;
}

function detailToPost(detail: BadpupsDetail): Post {
  const numericId = badpupsNumericId(detail.slug);
  rememberSlug(detail.slug, numericId);
  const tags = emptyTags();
  // Badpups tags/categories have no artist namespace on the public HTML.
  tags.general = detail.tags;
  const bunny = detail.guid ? bunnyUrls(detail.guid) : null;
  const thumb = detail.thumbUrl || bunny?.thumb || "";
  const created = detail.uploadDate || new Date().toISOString();
  const post = {
    id: numericId,
    created_at: created,
    updated_at: created,
    file: {
      // Default 16:9 — thumbs are landscape; portrait hardcode letterboxed cards.
      width: 1280,
      height: 720,
      ext: "mp4",
      size: 0,
      md5: (detail.guid || detail.slug).replace(/-/g, "").slice(0, 32),
      url: bunny ? mediaUrl(bunny.mp4) : null,
    },
    preview: { width: 320, height: 180, url: mediaUrl(thumb) },
    sample: { has: !!thumb, width: 640, height: 360, url: mediaUrl(thumb) },
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
    rating: "e" as const,
    fav_count: 0,
    sources: [detail.pageUrl],
    pools: [],
    relationships: {
      has_children: false,
      has_active_children: false,
      children: [],
    },
    approver_id: undefined,
    uploader_id: 0,
    description: detail.description || detail.title,
    comment_count: 0,
    is_favorited: false,
    has_notes: false,
    duration: detail.durationSec,
  } as unknown as Post & { __meta: { badpups: BadpupsMeta } };
  post.__meta = {
    badpups: {
      slug: detail.slug,
      guid: detail.guid,
      pageUrl: detail.pageUrl,
      title: detail.title,
    },
  };
  return post;
}

async function fetchHtml(path: string): Promise<string> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(`${proxyBase()}/html?${qs}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Badpups proxy ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { html?: string };
  return data.html || "";
}

export async function searchBrowse(args: {
  tags?: string;
  page: number;
  limit: number;
}): Promise<{ posts: Post[]; hasMore: boolean }> {
  const q = (args.tags || "").trim();
  const page = Math.max(1, args.page || 1);
  let path: string;
  if (q) {
    path = `/?s=${encodeURIComponent(q)}${page > 1 ? `&paged=${page}` : ""}`;
  } else if (page <= 1) {
    path = "/videos/";
  } else {
    path = `/videos/page/${page}/`;
  }
  const html = await fetchHtml(path);
  const cards = parseListingHtml(html);
  const posts = cards.map(cardToPost);
  return {
    posts: posts.slice(0, args.limit || 75),
    hasMore: cards.length >= 12,
  };
}

export async function fetchDetail(slug: string): Promise<Post | null> {
  const s = String(slug || "").trim().replace(/^\/+|\/+$/g, "");
  if (!s) return null;
  const html = await fetchHtml(`/${s}/`);
  const detail = parseDetailHtml(html, s);
  return detail ? detailToPost(detail) : null;
}

export async function searchTags(args: {
  tags?: string;
  limit?: number;
}): Promise<Tag[]> {
  const q = (args.tags || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!q) return [];
  return [
    {
      id: Math.abs(hashString(q)) || 1,
      name: q,
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
