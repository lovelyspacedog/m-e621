/**
 * News RSS + archive article client (Flayrah + Dogpatch Press).
 * Fetches via local proxy (/api/news/…) — no CORS on source hosts.
 */
import {
  normalizeNewsFeedId,
  normalizeNewsPage,
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

function cacheKey(source: NewsSourceFilter, feed: string, page = 1): string {
  const section = normalizeNewsFeedId(
    source === "dogpatch" ? "dogpatch" : "flayrah",
    feed,
  );
  const p = normalizeNewsPage(page);
  if (source === "all") return `all:${section}:p${p}`;
  if (source === "dogpatch") return `dogpatch:${section}:p${p}`;
  return `flayrah:${section}:p${p}`;
}

export function getNewsCacheAgeMs(
  source: NewsSourceFilter = "all",
  feedId = "full",
  page = 1,
): number | null {
  const hit = cacheByKey.get(cacheKey(source, feedId, page));
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
  page = 1,
): Promise<NewsArticle[]> {
  const qs = new URLSearchParams();
  qs.set("source", source);
  qs.set("page", String(normalizeNewsPage(page)));
  const section = normalizeNewsFeedId(source, feed);
  if (section !== "full") qs.set("feed", section);
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
  page?: number;
}): Promise<NewsArticle[]> {
  const source = normalizeNewsSourceFilter(opts?.source);
  const feed = normalizeNewsFeedId(
    source === "dogpatch" ? "dogpatch" : "flayrah",
    opts?.feed,
  );
  const page = normalizeNewsPage(opts?.page ?? 1);
  const key = cacheKey(source, feed, page);
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
      if (page > 1) {
        articles = sortByPublished(
          await fetchOneSource("dogpatch", "full", page),
        );
      } else {
        const results = await Promise.allSettled([
          fetchOneSource("flayrah", feed, 1),
          fetchOneSource("dogpatch", "full", 1),
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
      }
    } else {
      articles = sortByPublished(await fetchOneSource(source, feed, page));
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
  const feedSource = parsed.source;
  const feed = normalizeNewsFeedId(feedSource, opts?.feed);
  try {
    const list = await fetchNewsArticles({
      force: opts?.force,
      source: sourceFilter === "all" ? parsed.source : sourceFilter,
      feed:
        sourceFilter === "all" || sourceFilter === parsed.source ? feed : "full",
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

/** Peek in-memory feed cache for UI badges (no network). */
export function peekNewsCachedArticles(
  source: NewsSourceFilter = "all",
  feed = "full",
): NewsArticle[] {
  const hit = cacheByKey.get(cacheKey(source, feed));
  if (hit?.articles?.length) return hit.articles;
  // Fall back to any cached feed so the nav badge still works after a taxonomy view.
  for (const entry of cacheByKey.values()) {
    if (entry.articles?.length) return entry.articles;
  }
  return [];
}

export function findNewsArticle(
  articles: NewsArticle[],
  id: string,
): NewsArticle | undefined {
  return articles.find((a) => a.id === id);
}
