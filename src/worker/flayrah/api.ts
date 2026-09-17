/**
 * Flayrah RSS client.
 * Fetches via local proxy (/api/flayrah/rss) — no CORS on flayrah.com.
 */
import {
  parseFlayrahRss,
  type FlayrahArticle,
} from "./parseRss";

export type { FlayrahArticle };

let cachedArticles: FlayrahArticle[] | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/flayrah`;
}

export async function fetchFlayrahArticles(opts?: {
  force?: boolean;
}): Promise<FlayrahArticle[]> {
  const now = Date.now();
  if (!opts?.force && cachedArticles && now - cachedAt < CACHE_MS) {
    return cachedArticles;
  }
  const response = await fetch(`${proxyBase()}/rss`, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
  });
  if (!response.ok) {
    throw new Error(`Flayrah RSS failed (${response.status})`);
  }
  const xml = await response.text();
  const articles = parseFlayrahRss(xml);
  cachedArticles = articles;
  cachedAt = now;
  return articles;
}

export function clearFlayrahCache() {
  cachedArticles = null;
  cachedAt = 0;
}

export function findFlayrahArticle(
  articles: FlayrahArticle[],
  id: number,
): FlayrahArticle | undefined {
  return articles.find((a) => a.id === id);
}
