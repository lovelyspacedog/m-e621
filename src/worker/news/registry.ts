/**
 * News source registry — single client/Vite allowlist for RSS, articles, media.
 * Keep serve.py NEWS_* tables in sync with this file.
 */

export type NewsSource =
  | "flayrah"
  | "dogpatch"
  | "infurnation"
  | "fwg";

export type NewsParserKind = "flayrah" | "wordpress";

export interface NewsCategoryFeed {
  id: string;
  label: string;
  /** WordPress category slug. */
  slug: string;
}

export interface NewsTaxonomyFeed {
  id: string;
  label: string;
  termId: number;
}

export interface NewsSourceDef {
  id: NewsSource;
  label: string;
  /** Short chip label when space is tight. */
  shortLabel: string;
  homeUrl: string;
  baseOrigin: string;
  mediaHosts: readonly string[];
  parser: NewsParserKind;
  fullRssUrl: string;
  articleUrl: (numericId: number) => string;
  supportsPaging: boolean;
  mergeInAll: boolean;
  categoryFeeds?: readonly NewsCategoryFeed[];
  taxonomyFeeds?: readonly NewsTaxonomyFeed[];
  /** Footer attribution site name. */
  attributionName: string;
}

export const NEWS_RSS_PAGE_MAX = 8;

export const NEWS_SOURCE_DEFS: readonly NewsSourceDef[] = [
  {
    id: "flayrah",
    label: "Flayrah",
    shortLabel: "Flayrah",
    homeUrl: "https://www.flayrah.com/",
    baseOrigin: "https://www.flayrah.com",
    mediaHosts: ["flayrah.com", "www.flayrah.com"],
    parser: "flayrah",
    fullRssUrl: "https://www.flayrah.com/rss-full.xml",
    articleUrl: (id) => `https://www.flayrah.com/node/${id}`,
    supportsPaging: false,
    mergeInAll: true,
    taxonomyFeeds: [
      { id: "reviews", label: "Reviews", termId: 37 },
      { id: "opinion", label: "Opinion", termId: 36 },
      { id: "media", label: "Media", termId: 41 },
      { id: "conventions", label: "Conventions", termId: 30 },
      { id: "games", label: "Games", termId: 60 },
      { id: "science-fiction", label: "Sci‑fi", termId: 32 },
      { id: "art", label: "Art", termId: 49 },
      { id: "wikifur-news", label: "WikiFur News", termId: 51 },
    ],
    attributionName: "flayrah.com",
  },
  {
    id: "dogpatch",
    label: "Dogpatch Press",
    shortLabel: "Dogpatch",
    homeUrl: "https://dogpatch.press/",
    baseOrigin: "https://dogpatch.press",
    mediaHosts: [
      "dogpatch.press",
      "www.dogpatch.press",
    ],
    parser: "wordpress",
    fullRssUrl: "https://dogpatch.press/feed/",
    articleUrl: (id) => `https://dogpatch.press/?p=${id}`,
    supportsPaging: true,
    mergeInAll: true,
    categoryFeeds: [
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
    ],
    attributionName: "dogpatch.press",
  },
  {
    id: "infurnation",
    label: "InFurNation",
    shortLabel: "InFurNation",
    homeUrl: "https://www.infurnation.com/",
    baseOrigin: "https://www.infurnation.com",
    mediaHosts: ["infurnation.com", "www.infurnation.com"],
    parser: "wordpress",
    fullRssUrl: "https://www.infurnation.com/feed/",
    articleUrl: (id) => `https://www.infurnation.com/?p=${id}`,
    supportsPaging: true,
    mergeInAll: true,
    attributionName: "infurnation.com",
  },
  {
    id: "fwg",
    label: "Furry Writers’ Guild",
    shortLabel: "FWG",
    homeUrl: "https://furrywritersguild.com/",
    baseOrigin: "https://furrywritersguild.com",
    mediaHosts: ["furrywritersguild.com", "www.furrywritersguild.com"],
    parser: "wordpress",
    fullRssUrl: "https://furrywritersguild.com/feed/",
    articleUrl: (id) => `https://furrywritersguild.com/?p=${id}`,
    supportsPaging: true,
    mergeInAll: true,
    attributionName: "furrywritersguild.com",
  },
] as const;

export const NEWS_SOURCES: NewsSource[] = NEWS_SOURCE_DEFS.map((d) => d.id);

const BY_ID = new Map(NEWS_SOURCE_DEFS.map((d) => [d.id, d]));

export function getNewsSourceDef(id: string): NewsSourceDef | undefined {
  return BY_ID.get(id as NewsSource);
}

export function isNewsSource(raw: unknown): raw is NewsSource {
  return typeof raw === "string" && BY_ID.has(raw as NewsSource);
}

export function newsSourceLabel(source: NewsSource): string {
  return BY_ID.get(source)?.label || source;
}

export function newsSourceHomeUrl(source: NewsSource): string {
  return BY_ID.get(source)?.homeUrl || "https://www.flayrah.com/";
}

export function newsSourceBaseOrigin(source: NewsSource): string {
  return BY_ID.get(source)?.baseOrigin || "https://www.flayrah.com";
}

export function newsMediaHosts(): string[] {
  const out: string[] = [];
  for (const d of NEWS_SOURCE_DEFS) out.push(...d.mediaHosts);
  // WP CDN hosts used by several feeds.
  out.push(".wp.com", ".wordpress.com");
  return out;
}

/** Flat host set for allowlist checks (exact hostname). */
export function newsExactMediaHostSet(): Set<string> {
  const set = new Set<string>();
  for (const d of NEWS_SOURCE_DEFS) {
    for (const h of d.mediaHosts) set.add(h.toLowerCase());
  }
  return set;
}

export function newsSourcesInAll(): NewsSource[] {
  return NEWS_SOURCE_DEFS.filter((d) => d.mergeInAll).map((d) => d.id);
}

export function newsSourceSupportsPaging(source: NewsSource): boolean {
  return Boolean(BY_ID.get(source)?.supportsPaging);
}

export function newsArticleUpstreamUrl(
  source: NewsSource,
  numericId: number,
): string | null {
  const def = BY_ID.get(source);
  if (!def || !numericId) return null;
  return def.articleUrl(numericId);
}

export function makeNewsId(source: NewsSource, numericId: number): string {
  return `${source}:${numericId}`;
}

export function parseNewsId(
  raw: unknown,
): { source: NewsSource; numericId: number } | null {
  const s = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  const m = s.match(/^([a-z0-9_-]+):(\d+)$/i);
  if (!m) return null;
  const source = m[1].toLowerCase();
  if (!isNewsSource(source)) return null;
  const numericId = parseInt(m[2], 10);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;
  return { source, numericId };
}

/** Migrate legacy numeric Flayrah ids → `flayrah:N`. */
export function migrateLegacyNewsId(raw: unknown): string | null {
  if (typeof raw === "string") {
    const parsed = parseNewsId(raw);
    if (parsed) return makeNewsId(parsed.source, parsed.numericId);
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0 && String(n) === raw.trim()) {
      return makeNewsId("flayrah", n);
    }
    return null;
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return makeNewsId("flayrah", Math.floor(raw));
  }
  return null;
}
