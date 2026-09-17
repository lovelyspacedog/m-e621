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

export async function loadFlayrahFeedOffline(
  feedId: string,
): Promise<{ articles: FlayrahArticle[]; savedAt: number } | null> {
  const all = await readAll();
  const hit = all.byFeed[feedId];
  if (!hit?.articles?.length) return null;
  return { articles: hit.articles, savedAt: hit.savedAt };
}
