/**
 * News RSS + archive article client (Flayrah + Dogpatch Press).
 * Fetches via local proxy (/api/news/…) — no CORS on source hosts.
 */
import {
  normalizeFlayrahFeedId,
  normalizeNewsSourceFilter,
  type NewsSourceFilter,
} from "./feeds";
import { isNewsSource, parseNewsId, type NewsSource } from "./ids";
import {
  loadNewsArticleOffline,
  loadNewsFeedOffline,
  saveNewsArticleOffline,
  saveNewsFeedOffline,
} from "./offlineCache";
import { parseNewsArticleHtml } from "./parseArticleHtml";
import { parseNewsRss, type NewsArticle } from "./parseRss";

export type { NewsArticle };
export type { NewsSource, NewsSourceFilter };

/** Align with ~900s and proxy max-age=300. */
const CACHE_MS = 10 * 60 * 1000;

const cacheByKey = new Map<string, { articles: NewsArticle[]; at: number }>();
const articleCache = new Map<string, NewsArticle>();
let lastFetchSource: "network" | "memory" | "offline" = "memory";
let lastPartialWarning: string | null = null;

function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/news`;
}

function cacheKey(source: NewsSourceFilter, feed: string): string {
  if (source === "all") return `all:${feed === "full" ? "full" : feed}`;
  if (source === "dogpatch") return "dogpatch:full";
  return `flayrah:${normalizeFlayrahFeedId(feed)}`;
}

export function getNewsCacheAgeMs(
  source: NewsSourceFilter = "all",
  feedId = "full",
): number | null {
  const hit = cacheByKey.get(cacheKey(source, feedId));
  if (!hit) return null;
  return Date.now() - hit.at;
}

export function getNewsLastFetchSource() {
  return lastFetchSource;
}

export function getNewsPartialWarning() {
  return lastPartialWarning;
}

function rememberArticles(
  key: string,
  articles: NewsArticle[],
  at = Date.now(),
  persist = true,
) {
  cacheByKey.set(key, { articles, at });
  for (const a of articles) articleCache.set(a.id, a);
  if (persist) void saveNewsFeedOffline(key, articles);
}

function sortByPublished(articles: NewsArticle[]): NewsArticle[] {
  return [...articles].sort((a, b) => b.publishedMs - a.publishedMs);
}

async function fetchOneSource(
  source: NewsSource,
  feed: string,
): Promise<NewsArticle[]> {
  const qs = new URLSearchParams();
  qs.set("source", source);
  if (source === "flayrah" && feed !== "full") {
    qs.set("feed", feed);
  }
  const response = await fetch(`${proxyBase()}/rss?${qs.toString()}`, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
  });
  if (!response.ok) {
    throw new Error(`${source} RSS failed (${response.status})`);
  }
  const xml = await response.text();
  return parseNewsRss(xml, source);
}

export async function fetchNewsArticles(opts?: {
  force?: boolean;
  source?: NewsSourceFilter | string;
  feed?: string;
}): Promise<NewsArticle[]> {
  const source = normalizeNewsSourceFilter(opts?.source);
  const feed = normalizeFlayrahFeedId(opts?.feed);
  const key = cacheKey(source, feed);
  const now = Date.now();
  const cached = cacheByKey.get(key);
  if (!opts?.force && cached && now - cached.at < CACHE_MS) {
    lastFetchSource = "memory";
    lastPartialWarning = null;
    return cached.articles;
  }

  lastPartialWarning = null;

  try {
    let articles: NewsArticle[];
    if (source === "all") {
      const results = await Promise.allSettled([
        fetchOneSource("flayrah", feed),
        fetchOneSource("dogpatch", "full"),
      ]);
      const parts: NewsArticle[] = [];
      const failed: string[] = [];
      if (results[0].status === "fulfilled") parts.push(...results[0].value);
      else failed.push("Flayrah");
      if (results[1].status === "fulfilled") parts.push(...results[1].value);
      else failed.push("Dogpatch Press");
      if (!parts.length) {
        throw results[0].status === "rejected"
          ? results[0].reason
          : results[1].status === "rejected"
            ? results[1].reason
            : new Error("News RSS failed");
      }
      if (failed.length) {
        lastPartialWarning = `${failed.join(" and ")} unavailable — showing the other source.`;
      }
      articles = sortByPublished(parts);
    } else {
      articles = sortByPublished(await fetchOneSource(source, feed));
    }
    rememberArticles(key, articles, now, true);
    lastFetchSource = "network";
    return articles;
  } catch (err) {
    const offline = await loadNewsFeedOffline(key);
    if (offline?.articles?.length) {
      rememberArticles(key, offline.articles, offline.savedAt, false);
      lastFetchSource = "offline";
      return offline.articles;
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** Resolve an article from RSS caches, then HTML archive fallback. */
export async function resolveNewsArticle(
  id: string,
  opts?: { source?: NewsSourceFilter | string; feed?: string; force?: boolean },
): Promise<NewsArticle | null> {
  const parsed = parseNewsId(id);
  if (!parsed) return null;
  if (!opts?.force) {
    const mem = articleCache.get(id);
    if (mem) return mem;
  }
  const sourceFilter = normalizeNewsSourceFilter(opts?.source);
  const feed = normalizeFlayrahFeedId(opts?.feed);
  try {
    const list = await fetchNewsArticles({
      force: opts?.force,
      source: sourceFilter === "all" ? parsed.source : sourceFilter,
      feed: parsed.source === "flayrah" ? feed : "full",
    });
    const hit = findNewsArticle(list, id);
    if (hit) return hit;
  } catch {
    // Fall through to archive even if RSS fails.
  }
  for (const { articles } of cacheByKey.values()) {
    const hit = findNewsArticle(articles, id);
    if (hit) {
      articleCache.set(id, hit);
      return hit;
    }
  }
  const offlineArticle = await loadNewsArticleOffline(id);
  if (offlineArticle) {
    articleCache.set(id, offlineArticle);
    return offlineArticle;
  }
  return fetchNewsArticleArchive(parsed.source, parsed.numericId);
}

export async function fetchNewsArticleArchive(
  source: NewsSource,
  numericId: number,
): Promise<NewsArticle | null> {
  if (!isNewsSource(source) || !numericId) return null;
  const response = await fetch(
    `${proxyBase()}/article/${source}/${numericId}`,
    {
      headers: { Accept: "text/html,application/xhtml+xml,*/*" },
    },
  );
  if (!response.ok) {
    throw new Error(`${source} article failed (${response.status})`);
  }
  const html = await response.text();
  const article = parseNewsArticleHtml(html, source, numericId);
  if (article) {
    articleCache.set(article.id, article);
    void saveNewsArticleOffline(article);
  }
  return article;
}

export function clearNewsCache() {
  cacheByKey.clear();
  articleCache.clear();
}

export function findNewsArticle(
  articles: NewsArticle[],
  id: string,
): NewsArticle | undefined {
  return articles.find((a) => a.id === id);
}
