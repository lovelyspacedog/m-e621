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

export async function saveNewsArticleOffline(
  article: NewsArticle,
): Promise<void> {
  if (!article?.id) return;
  const raw =
    (await localforage.getItem<Record<string, NewsArticle>>(ARTICLE_KEY)) || {};
  const next: Record<string, NewsArticle> = { ...raw, [article.id]: article };
  const ids = Object.keys(next);
  if (ids.length > ARTICLE_CAP) {
    const sorted = ids
      .map((id) => ({ id, at: next[id]?.publishedMs || 0 }))
      .sort((a, b) => b.at - a.at)
      .slice(0, ARTICLE_CAP);
    const trimmed: Record<string, NewsArticle> = {};
    for (const { id } of sorted) {
      const hit = next[id];
      if (hit) trimmed[id] = hit;
    }
    await localforage.setItem(ARTICLE_KEY, trimmed);
    return;
  }
  await localforage.setItem(ARTICLE_KEY, next);
}

export async function loadNewsArticleOffline(
  id: string,
): Promise<NewsArticle | null> {
  if (!id) return null;
  const raw =
    (await localforage.getItem<Record<string, NewsArticle>>(ARTICLE_KEY)) || {};
  return raw[id] || null;
}

export async function loadNewsFeedOffline(
  feedKey: string,
): Promise<{ articles: NewsArticle[]; savedAt: number } | null> {
  const all = await readAll();
  const hit = all.byFeed[feedKey];
  if (!hit?.articles?.length) return null;
  return { articles: hit.articles, savedAt: hit.savedAt };
}
