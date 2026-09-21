/**
 * Persist last-good News RSS parses for offline fallback.
 */
import localforage from "localforage";
import type { NewsArticle } from "./parseRss";

const KEY = "news-feed-cache-v1";

export interface NewsFeedOfflineCache {
  byFeed: Record<
    string,
    {
      savedAt: number;
      articles: NewsArticle[];
    }
  >;
}

async function readAll(): Promise<NewsFeedOfflineCache> {
  const raw = await localforage.getItem<NewsFeedOfflineCache>(KEY);
  if (!raw || typeof raw !== "object" || !raw.byFeed) {
    return { byFeed: {} };
  }
  return raw;
}

export async function saveNewsFeedOffline(
  feedKey: string,
  articles: NewsArticle[],
): Promise<void> {
  const all = await readAll();
  all.byFeed[feedKey] = { savedAt: Date.now(), articles };
  const keys = Object.keys(all.byFeed);
  if (keys.length > 16) {
    const sorted = keys
      .map((k) => ({ k, at: all.byFeed[k]?.savedAt || 0 }))
      .sort((a, b) => b.at - a.at)
      .slice(0, 16);
    const next: NewsFeedOfflineCache["byFeed"] = {};
    for (const { k } of sorted) next[k] = all.byFeed[k];
    all.byFeed = next;
  }
  await localforage.setItem(KEY, all);
}

const ARTICLE_KEY = "news-article-cache-v1";
const ARTICLE_CAP = 40;

interface ArticleCacheEntry {
  article: NewsArticle;
  /** Last open / save time — used for LRU eviction. */
  accessedAt: number;
}

type ArticleCacheStore = Record<string, ArticleCacheEntry | NewsArticle>;

function asEntry(
  raw: ArticleCacheEntry | NewsArticle | undefined,
): ArticleCacheEntry | null {
  if (!raw || typeof raw !== "object") return null;
  if ("article" in raw && raw.article && typeof raw.article === "object") {
    const accessedAt =
      typeof (raw as ArticleCacheEntry).accessedAt === "number"
        ? (raw as ArticleCacheEntry).accessedAt
        : Date.now();
    return { article: (raw as ArticleCacheEntry).article, accessedAt };
  }
  // Legacy: bare NewsArticle
  const article = raw as NewsArticle;
  if (!article.id) return null;
  return {
    article,
    accessedAt: article.publishedMs || 0,
  };
}

export async function saveNewsArticleOffline(
  article: NewsArticle,
): Promise<void> {
  if (!article?.id) return;
  const raw =
    (await localforage.getItem<ArticleCacheStore>(ARTICLE_KEY)) || {};
  const next: Record<string, ArticleCacheEntry> = {};
  for (const [id, value] of Object.entries(raw)) {
    const entry = asEntry(value);
    if (entry) next[id] = entry;
  }
  next[article.id] = { article, accessedAt: Date.now() };
  const ids = Object.keys(next);
  if (ids.length > ARTICLE_CAP) {
    const sorted = ids
      .map((id) => ({ id, at: next[id]?.accessedAt || 0 }))
      .sort((a, b) => b.at - a.at)
      .slice(0, ARTICLE_CAP);
    const trimmed: Record<string, ArticleCacheEntry> = {};
    for (const { id } of sorted) {
      const hit = next[id];
      if (hit) trimmed[id] = hit;
    }
    await localforage.setItem(ARTICLE_KEY, trimmed);
    return;
  }
  await localforage.setItem(ARTICLE_KEY, next);
}

export async function touchNewsArticleOffline(id: string): Promise<void> {
  if (!id) return;
  const raw =
    (await localforage.getItem<ArticleCacheStore>(ARTICLE_KEY)) || {};
  const entry = asEntry(raw[id]);
  if (!entry) return;
  const next: Record<string, ArticleCacheEntry> = {};
  for (const [otherId, value] of Object.entries(raw)) {
    const e = asEntry(value);
    if (e) next[otherId] = e;
  }
  next[id] = { article: entry.article, accessedAt: Date.now() };
  await localforage.setItem(ARTICLE_KEY, next);
}

export async function loadNewsArticleOffline(
  id: string,
): Promise<NewsArticle | null> {
  if (!id) return null;
  const raw =
    (await localforage.getItem<ArticleCacheStore>(ARTICLE_KEY)) || {};
  const entry = asEntry(raw[id]);
  if (!entry) return null;
  // Bump access so recently opened articles survive eviction.
  void touchNewsArticleOffline(id);
  return entry.article;
}

export async function loadNewsFeedOffline(
  feedKey: string,
): Promise<{ articles: NewsArticle[]; savedAt: number } | null> {
  const all = await readAll();
  const hit = all.byFeed[feedKey];
  if (!hit?.articles?.length) return null;
  return { articles: hit.articles, savedAt: hit.savedAt };
}
