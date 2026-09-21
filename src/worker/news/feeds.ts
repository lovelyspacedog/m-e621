/**
 * Curated Flayrah taxonomy RSS feeds (allowlisted on the proxy).
 * `full` is rss-full.xml; others are taxonomy/term/{id}/0/feed.
 * Dogpatch categories are allowlisted slugs on /category/{slug}/feed/.
 * Flayrah's public RSS ignores page query params; only Dogpatch supports paged=.
 */

import type { NewsSource } from "./ids";
import { isNewsSource } from "./ids";

export interface FlayrahFeedOption {
  id: string;
  label: string;
  /** Drupal taxonomy term id; null for the full magazine feed. */
  termId: number | null;
}

export interface DogpatchFeedOption {
  id: string;
  label: string;
  /** WordPress category slug; null for the site feed. */
  slug: string | null;
}

export const FLAYRAH_FEED_OPTIONS: FlayrahFeedOption[] = [
  { id: "full", label: "All", termId: null },
  { id: "reviews", label: "Reviews", termId: 37 },
  { id: "opinion", label: "Opinion", termId: 36 },
  { id: "media", label: "Media", termId: 41 },
  { id: "conventions", label: "Conventions", termId: 30 },
  { id: "games", label: "Games", termId: 60 },
  { id: "science-fiction", label: "Sci‑fi", termId: 32 },
  { id: "art", label: "Art", termId: 49 },
  { id: "wikifur-news", label: "WikiFur News", termId: 51 },
];

/** Live Dogpatch categories that actually publish items. */
export const DOGPATCH_FEED_OPTIONS: DogpatchFeedOption[] = [
  { id: "full", label: "All", slug: null },
  { id: "announcements", label: "Announcements", slug: "announcements" },
  { id: "business", label: "Business", slug: "business" },
  { id: "costuming", label: "Costuming", slug: "costuming" },
  { id: "current-events", label: "Current events", slug: "current-events" },
  { id: "interviews", label: "Interviews", slug: "interviews" },
  { id: "media", label: "Media", slug: "media" },
  { id: "on-the-scene", label: "On the scene", slug: "on-the-scene" },
  { id: "opinion", label: "Opinion", slug: "opinion" },
  { id: "personalities", label: "Personalities", slug: "personalities" },
  { id: "reviews", label: "Reviews", slug: "reviews" },
  { id: "science", label: "Science", slug: "science" },
  { id: "society-and-culture", label: "Society", slug: "society-and-culture" },
  { id: "special-feature", label: "Special feature", slug: "special-feature" },
];

export const FLAYRAH_FEED_IDS = new Set(FLAYRAH_FEED_OPTIONS.map((f) => f.id));
export const DOGPATCH_FEED_IDS = new Set(DOGPATCH_FEED_OPTIONS.map((f) => f.id));

/** WordPress RSS pages to allow. Page 1 is the default feed. */
export const NEWS_RSS_PAGE_MAX = 8;

export function normalizeFlayrahFeedId(raw: unknown): string {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return FLAYRAH_FEED_IDS.has(id) ? id : "full";
}

export function normalizeDogpatchFeedId(raw: unknown): string {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return DOGPATCH_FEED_IDS.has(id) ? id : "full";
}

export function normalizeNewsFeedId(
  source: NewsSource | NewsSourceFilter,
  raw: unknown,
): string {
  if (source === "dogpatch") return normalizeDogpatchFeedId(raw);
  return normalizeFlayrahFeedId(raw);
}

export function normalizeNewsPage(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), NEWS_RSS_PAGE_MAX);
}

const FLAYRAH_RSS: Record<string, string> = {
  full: "https://www.flayrah.com/rss-full.xml",
  reviews: "https://www.flayrah.com/taxonomy/term/37/0/feed",
  opinion: "https://www.flayrah.com/taxonomy/term/36/0/feed",
  media: "https://www.flayrah.com/taxonomy/term/41/0/feed",
  conventions: "https://www.flayrah.com/taxonomy/term/30/0/feed",
  games: "https://www.flayrah.com/taxonomy/term/60/0/feed",
  "science-fiction": "https://www.flayrah.com/taxonomy/term/32/0/feed",
  art: "https://www.flayrah.com/taxonomy/term/49/0/feed",
  "wikifur-news": "https://www.flayrah.com/taxonomy/term/51/0/feed",
};

/**
 * Allowlisted upstream RSS URL, or null when source/feed/page is rejected.
 * Null is a 400 at the proxy. Flayrah page>1 is rejected (feed ignores paging).
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
  if (source === "dogpatch") {
    const id = normalizeDogpatchFeedId(feed);
    if (feed && feed !== "full" && id === "full" && feed.trim().toLowerCase() !== "full") {
      return null;
    }
    const slug = DOGPATCH_FEED_OPTIONS.find((f) => f.id === id)?.slug;
    const base = slug
      ? `https://dogpatch.press/category/${slug}/feed/`
      : "https://dogpatch.press/feed/";
    if (n <= 1) return base;
    return `${base}?paged=${n}`;
  }
  if (source === "flayrah" || source === "all") {
    if (n > 1) return null;
    const id =
      source === "all" ? "full" : normalizeFlayrahFeedId(feed);
    if (
      source === "flayrah" &&
      feed &&
      feed !== "full" &&
      id === "full" &&
      feed.trim().toLowerCase() !== "full"
    ) {
      return null;
    }
    return FLAYRAH_RSS[id] || null;
  }
  return null;
}

export type NewsSourceFilter = "all" | NewsSource;

export const NEWS_SOURCE_OPTIONS: { id: NewsSourceFilter; label: string }[] = [
  { id: "all", label: "All sources" },
  { id: "flayrah", label: "Flayrah" },
  { id: "dogpatch", label: "Dogpatch" },
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
