/**
 * Flayrah RSS + archive article client.
 * Fetches via local proxy (/api/flayrah/…) — no CORS on flayrah.com.
 */
import { normalizeFlayrahFeedId } from "./feeds";
import {
  loadFlayrahFeedOffline,
  saveFlayrahFeedOffline,
} from "./offlineCache";
import { parseFlayrahArticleHtml } from "./parseArticleHtml";
import {
  parseFlayrahRss,
  type FlayrahArticle,
} from "./parseRss";

export type { FlayrahArticle };

/** Align with Flayrah ~900s and proxy max-age=300. */
const CACHE_MS = 10 * 60 * 1000;

const cacheByFeed = new Map<string, { articles: FlayrahArticle[]; at: number }>();
const articleCache = new Map<number, FlayrahArticle>();
let lastFetchSource: "network" | "memory" | "offline" = "memory";

function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/flayrah`;
}

export function getFlayrahCacheAgeMs(feedId = "full"): number | null {
  const hit = cacheByFeed.get(normalizeFlayrahFeedId(feedId));
  if (!hit) return null;
  return Date.now() - hit.at;
}

export function getFlayrahLastFetchSource() {
  return lastFetchSource;
}

function rememberArticles(
  feed: string,
  articles: FlayrahArticle[],
  at = Date.now(),
  persist = true,
) {
  cacheByFeed.set(feed, { articles, at });
  for (const a of articles) articleCache.set(a.id, a);
  if (persist) void saveFlayrahFeedOffline(feed, articles);
}

export async function fetchFlayrahArticles(opts?: {
  force?: boolean;
  feed?: string;
}): Promise<FlayrahArticle[]> {
  const feed = normalizeFlayrahFeedId(opts?.feed);
  const now = Date.now();
  const cached = cacheByFeed.get(feed);
  if (!opts?.force && cached && now - cached.at < CACHE_MS) {
    lastFetchSource = "memory";
    return cached.articles;
  }
  const qs = feed === "full" ? "" : `?feed=${encodeURIComponent(feed)}`;
  try {
    const response = await fetch(`${proxyBase()}/rss${qs}`, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    if (!response.ok) {
      throw new Error(`Flayrah RSS failed (${response.status})`);
    }
    const xml = await response.text();
    const articles = parseFlayrahRss(xml);
    rememberArticles(feed, articles, now, true);
    lastFetchSource = "network";
    return articles;
  } catch (err) {
    const offline = await loadFlayrahFeedOffline(feed);
    if (offline?.articles?.length) {
      rememberArticles(feed, offline.articles, offline.savedAt, false);
      lastFetchSource = "offline";
      return offline.articles;
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** Resolve an article from RSS caches, then HTML archive fallback. */
export async function resolveFlayrahArticle(
  id: number,
  opts?: { feed?: string; force?: boolean },
): Promise<FlayrahArticle | null> {
  if (!id) return null;
  if (!opts?.force) {
    const mem = articleCache.get(id);
    if (mem) return mem;
  }
  const feed = normalizeFlayrahFeedId(opts?.feed);
  try {
    const list = await fetchFlayrahArticles({ force: opts?.force, feed });
    const hit = findFlayrahArticle(list, id);
    if (hit) return hit;
  } catch {
    // Fall through to archive even if RSS fails.
  }
  // Scan other feed caches before hitting the network.
  for (const { articles } of cacheByFeed.values()) {
    const hit = findFlayrahArticle(articles, id);
    if (hit) {
      articleCache.set(id, hit);
      return hit;
    }
  }
  return fetchFlayrahArticleArchive(id);
}

export async function fetchFlayrahArticleArchive(
  id: number,
): Promise<FlayrahArticle | null> {
  if (!id) return null;
  const response = await fetch(`${proxyBase()}/article/${id}`, {
    headers: { Accept: "text/html,application/xhtml+xml,*/*" },
  });
  if (!response.ok) {
    throw new Error(`Flayrah article failed (${response.status})`);
  }
  const html = await response.text();
  const article = parseFlayrahArticleHtml(html, id);
  if (article) articleCache.set(id, article);
  return article;
}

export function clearFlayrahCache() {
  cacheByFeed.clear();
  articleCache.clear();
}

export function findFlayrahArticle(
  articles: FlayrahArticle[],
  id: number,
): FlayrahArticle | undefined {
  return articles.find((a) => a.id === id);
}
