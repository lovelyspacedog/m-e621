/**
 * Curated News RSS feeds (allowlisted on the proxy via resolveNewsRssUrl).
 * Source defs live in registry.ts — keep serve.py NEWS_* tables in sync.
 */

import {
  NEWS_RSS_PAGE_MAX,
  NEWS_SOURCE_DEFS,
  getNewsSourceDef,
  isNewsSource,
  type NewsSource,
} from "./registry";

export { NEWS_RSS_PAGE_MAX } from "./registry";

export interface FlayrahFeedOption {
  id: string;
  label: string;
  termId: number | null;
}

export interface DogpatchFeedOption {
  id: string;
  label: string;
  slug: string | null;
}

export interface NewsSectionFeedOption {
  id: string;
  label: string;
}

export const FLAYRAH_FEED_OPTIONS: FlayrahFeedOption[] = [
  { id: "full", label: "All", termId: null },
  ...(getNewsSourceDef("flayrah")?.taxonomyFeeds || []).map((f) => ({
    id: f.id,
    label: f.label,
    termId: f.termId,
  })),
];

export const DOGPATCH_FEED_OPTIONS: DogpatchFeedOption[] = [
  { id: "full", label: "All", slug: null },
  ...(getNewsSourceDef("dogpatch")?.categoryFeeds || []).map((f) => ({
    id: f.id,
    label: f.label,
    slug: f.slug,
  })),
];

export const FLAYRAH_FEED_IDS = new Set(FLAYRAH_FEED_OPTIONS.map((f) => f.id));
export const DOGPATCH_FEED_IDS = new Set(DOGPATCH_FEED_OPTIONS.map((f) => f.id));

export function normalizeFlayrahFeedId(raw: unknown): string {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return FLAYRAH_FEED_IDS.has(id) ? id : "full";
}

export function normalizeDogpatchFeedId(raw: unknown): string {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return DOGPATCH_FEED_IDS.has(id) ? id : "full";
}

export function sectionFeedOptions(
  source: NewsSource,
): NewsSectionFeedOption[] {
  const def = getNewsSourceDef(source);
  if (!def) return [{ id: "full", label: "All" }];
  if (def.taxonomyFeeds?.length) {
    return [
      { id: "full", label: "All" },
      ...def.taxonomyFeeds.map((f) => ({ id: f.id, label: f.label })),
    ];
  }
  if (def.categoryFeeds?.length) {
    return [
      { id: "full", label: "All" },
      ...def.categoryFeeds.map((f) => ({ id: f.id, label: f.label })),
    ];
  }
  return [{ id: "full", label: "All" }];
}

export function normalizeNewsFeedId(
  source: NewsSource | NewsSourceFilter,
  raw: unknown,
): string {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (source === "all" || !isNewsSource(source)) {
    return "full";
  }
  const opts = sectionFeedOptions(source);
  return opts.some((o) => o.id === id) ? id : "full";
}

export function normalizeNewsPage(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), NEWS_RSS_PAGE_MAX);
}

/**
 * Allowlisted upstream RSS URL, or null when source/feed/page is rejected.
 * Null is a 400 at the proxy.
 */
export function resolveNewsRssUrl(
  source: string,
  feed: string,
  page = 1,
): string | null {
  const n = typeof page === "number" ? page : parseInt(String(page), 10);
  if (!Number.isFinite(n) || n < 1 || n > NEWS_RSS_PAGE_MAX || n !== Math.floor(n)) {
    return null;
  }

  // Client merges "all"; proxy serves Flayrah full if asked for all/page1.
  if (source === "all") {
    if (n > 1) return null;
    return getNewsSourceDef("flayrah")?.fullRssUrl || null;
  }

  const def = getNewsSourceDef(source);
  if (!def) return null;

  if (n > 1 && !def.supportsPaging) return null;

  const section = normalizeNewsFeedId(def.id, feed);
  if (
    feed &&
    feed !== "full" &&
    section === "full" &&
    feed.trim().toLowerCase() !== "full"
  ) {
    return null;
  }

  let base = def.fullRssUrl;
  if (section !== "full") {
    const tax = def.taxonomyFeeds?.find((f) => f.id === section);
    if (tax) {
      base = `https://www.flayrah.com/taxonomy/term/${tax.termId}/0/feed`;
    } else {
      const cat = def.categoryFeeds?.find((f) => f.id === section);
      if (!cat) return null;
      // WP category feed under the source origin.
      const origin = def.baseOrigin.replace(/\/$/, "");
      base = `${origin}/category/${cat.slug}/feed/`;
    }
  }

  if (n <= 1) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}paged=${n}`;
}

export type NewsSourceFilter = "all" | NewsSource;

export const NEWS_SOURCE_OPTIONS: { id: NewsSourceFilter; label: string }[] = [
  { id: "all", label: "All sources" },
  ...NEWS_SOURCE_DEFS.map((d) => ({
    id: d.id as NewsSourceFilter,
    label: d.shortLabel,
  })),
];

export function normalizeNewsSourceFilter(raw: unknown): NewsSourceFilter {
  if (raw === "all") return "all";
  if (isNewsSource(raw)) return raw;
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    if (t === "all") return "all";
    if (isNewsSource(t)) return t;
  }
  return "all";
}
