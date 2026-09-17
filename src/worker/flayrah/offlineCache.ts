/**
 * Persist last-good Flayrah RSS parses for offline fallback.
 */
import localforage from "localforage";
import type { FlayrahArticle } from "./parseRss";

const KEY = "flayrah-feed-cache-v1";

export interface FlayrahFeedOfflineCache {
  byFeed: Record<
    string,
    {
      savedAt: number;
      articles: FlayrahArticle[];
    }
  >;
}

async function readAll(): Promise<FlayrahFeedOfflineCache> {
  const raw = await localforage.getItem<FlayrahFeedOfflineCache>(KEY);
  if (!raw || typeof raw !== "object" || !raw.byFeed) {
    return { byFeed: {} };
  }
  return raw;
}

export async function saveFlayrahFeedOffline(
  feedId: string,
  articles: FlayrahArticle[],
): Promise<void> {
  const all = await readAll();
  all.byFeed[feedId] = { savedAt: Date.now(), articles };
  // Cap to a handful of feeds to bound IDB size.
  const keys = Object.keys(all.byFeed);
  if (keys.length > 12) {
    const sorted = keys
      .map((k) => ({ k, at: all.byFeed[k]?.savedAt || 0 }))
      .sort((a, b) => b.at - a.at)
      .slice(0, 12);
    const next: FlayrahFeedOfflineCache["byFeed"] = {};
    for (const { k } of sorted) next[k] = all.byFeed[k];
    all.byFeed = next;
  }
  await localforage.setItem(KEY, all);
}

const ARTICLE_KEY = "flayrah-article-cache-v1";
const ARTICLE_CAP = 40;

export async function saveFlayrahArticleOffline(
  article: FlayrahArticle,
): Promise<void> {
  if (!article?.id) return;
  const raw =
    (await localforage.getItem<Record<string, FlayrahArticle>>(ARTICLE_KEY)) ||
    {};
  const next: Record<string, FlayrahArticle> = { ...raw, [String(article.id)]: article };
  const ids = Object.keys(next);
  if (ids.length > ARTICLE_CAP) {
    // Drop oldest-looking entries (lowest id) beyond cap — archive ids grow.
    const sorted = ids
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)
      .slice(0, ARTICLE_CAP);
    const trimmed: Record<string, FlayrahArticle> = {};
    for (const id of sorted) {
      const hit = next[String(id)];
      if (hit) trimmed[String(id)] = hit;
    }
    await localforage.setItem(ARTICLE_KEY, trimmed);
    return;
  }
  await localforage.setItem(ARTICLE_KEY, next);
}

export async function loadFlayrahArticleOffline(
  id: number,
): Promise<FlayrahArticle | null> {
  if (!id) return null;
  const raw =
    (await localforage.getItem<Record<string, FlayrahArticle>>(ARTICLE_KEY)) ||
    {};
  return raw[String(id)] || null;
}

export async function loadFlayrahFeedOffline(
  feedId: string,
): Promise<{ articles: FlayrahArticle[]; savedAt: number } | null> {
  const all = await readAll();
  const hit = all.byFeed[feedId];
  if (!hit?.articles?.length) return null;
  return { articles: hit.articles, savedAt: hit.savedAt };
}
