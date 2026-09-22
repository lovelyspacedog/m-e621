/**
 * News RSS + archive article client (multi-source via registry + custom feeds).
 * Fetches via local proxy (/api/news/…) — no CORS on source hosts.
 */
import {
  customFeedIdFromFilter,
  isCustomSourceFilter,
  normalizeNewsFeedId,
  normalizeNewsPage,
  normalizeNewsSourceFilter,
  type NewsSourceFilter,
} from "./feeds";
import { isNewsSource, parseNewsId, type NewsSource } from "./ids";
import { parseCustomNewsId } from "./customIds";
import {
  loadNewsArticleOffline,
  loadNewsFeedOffline,
  saveNewsArticleOffline,
  saveNewsFeedOffline,
} from "./offlineCache";
import {
  parseGenericArticleHtml,
  parseNewsArticleHtml,
} from "./parseArticleHtml";
import {
  customFeedTitleFromXml,
  parseCustomNewsRss,
} from "./parseCustomRss";
import { parseNewsRss, type NewsArticle } from "./parseRss";
import {
  newsSourceLabel,
  newsSourceSupportsPaging,
  newsSourcesInAll,
} from "./registry";
import { newsRssAbortSignal } from "./timeouts";
import {
  CUSTOM_NEWS_ARTICLE_TIMEOUT_MS,
  validatePublicHttpsUrl,
} from "./customUrl";

export type { NewsArticle };
export type { NewsSource, NewsSourceFilter };

export interface CustomFeedRef {
  id: string;
  url: string;
  label: string;
}

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
  const section =
    source === "all" || isCustomSourceFilter(source)
      ? "full"
      : normalizeNewsFeedId(source as NewsSource, feed);
  const p = normalizeNewsPage(page);
  return `${source}:${section}:p${p}`;
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
  let response: Response;
  try {
    response = await fetch(`${proxyBase()}/rss?${qs.toString()}`, {
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      signal: newsRssAbortSignal(),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`${source} RSS timed out`);
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${source} RSS timed out`);
    }
    throw err;
  }
  if (!response.ok) {
    throw new Error(`${source} RSS failed (${response.status})`);
  }
  const xml = await response.text();
  return parseNewsRss(xml, source);
}

async function fetchCustomFeed(ref: CustomFeedRef): Promise<NewsArticle[]> {
  const checked = validatePublicHttpsUrl(ref.url);
  if (!checked.ok) throw new Error(`${ref.label}: ${checked.error}`);
  const qs = new URLSearchParams();
  qs.set("url", checked.href);
  let response: Response;
  try {
    response = await fetch(`${proxyBase()}/custom/rss?${qs.toString()}`, {
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      signal: newsRssAbortSignal(),
    });
  } catch (err) {
    if (
      (err instanceof DOMException && err.name === "TimeoutError") ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      throw new Error(`${ref.label} RSS timed out`);
    }
    throw err;
  }
  if (!response.ok) {
    throw new Error(`${ref.label} RSS failed (${response.status})`);
  }
  const xml = await response.text();
  return parseCustomNewsRss(xml, ref.id, checked.href);
}

/** Probe a URL before saving — returns title + item count. */
export async function probeCustomNewsFeed(url: string): Promise<{
  title: string;
  itemCount: number;
  href: string;
}> {
  const checked = validatePublicHttpsUrl(url);
  if (!checked.ok) throw new Error(checked.error);
  const qs = new URLSearchParams();
  qs.set("url", checked.href);
  const response = await fetch(`${proxyBase()}/custom/rss?${qs.toString()}`, {
    headers: {
      Accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
    signal: newsRssAbortSignal(),
  });
  if (!response.ok) {
    throw new Error(`Feed fetch failed (${response.status})`);
  }
  const xml = await response.text();
  const title = customFeedTitleFromXml(xml) || checked.hostname;
  const items = parseCustomNewsRss(xml, "c_probe", checked.href);
  if (!items.length) throw new Error("Feed has no items");
  return { title, itemCount: items.length, href: checked.href };
}

/** Page>1 for "all": merge every source that supports paging (no custom). */
async function fetchAllOlder(page: number): Promise<NewsArticle[]> {
  const pageable = newsSourcesInAll().filter(newsSourceSupportsPaging);
  const results = await Promise.allSettled(
    pageable.map((s) => fetchOneSource(s, "full", page)),
  );
  const parts: NewsArticle[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    const src = pageable[i];
    if (r.status === "fulfilled") parts.push(...r.value);
    else failed.push(newsSourceLabel(src));
  });
  if (!parts.length) {
    const firstReject = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw firstReject?.reason || new Error("News RSS failed");
  }
  if (failed.length) {
    lastPartialWarning = `${failed.join(", ")} unavailable — showing other sources.`;
  }
  return sortByPublished(parts);
}

async function fetchAllPageOne(
  feed: string,
  customFeeds: CustomFeedRef[],
): Promise<NewsArticle[]> {
  const sources = newsSourcesInAll();
  const builtIn = Promise.allSettled(
    sources.map((s) =>
      fetchOneSource(s, s === "flayrah" ? feed : "full", 1),
    ),
  );
  const customs = Promise.allSettled(
    customFeeds.map((f) => fetchCustomFeed(f)),
  );
  const [builtResults, customResults] = await Promise.all([builtIn, customs]);
  const parts: NewsArticle[] = [];
  const failed: string[] = [];
  builtResults.forEach((r, i) => {
    if (r.status === "fulfilled") parts.push(...r.value);
    else failed.push(newsSourceLabel(sources[i]));
  });
  customResults.forEach((r, i) => {
    if (r.status === "fulfilled") parts.push(...r.value);
    else failed.push(customFeeds[i]?.label || "Custom feed");
  });
  if (!parts.length) {
    const firstReject = [...builtResults, ...customResults].find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult | undefined;
    throw firstReject?.reason || new Error("News RSS failed");
  }
  if (failed.length) {
    lastPartialWarning =
      failed.length === 1
        ? `${failed[0]} unavailable — showing other sources.`
        : `${failed.join(", ")} unavailable — showing other sources.`;
  }
  return sortByPublished(parts);
}

export async function fetchNewsArticles(opts?: {
  force?: boolean;
  source?: NewsSourceFilter | string;
  feed?: string;
  page?: number;
  customFeeds?: CustomFeedRef[];
}): Promise<NewsArticle[]> {
  const source = normalizeNewsSourceFilter(opts?.source);
  const customFeeds = opts?.customFeeds || [];
  const feed =
    source === "all" || isCustomSourceFilter(source)
      ? "full"
      : normalizeNewsFeedId(source as NewsSource, opts?.feed);
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
      articles =
        page > 1
          ? await fetchAllOlder(page)
          : await fetchAllPageOne(opts?.feed || "full", customFeeds);
    } else if (isCustomSourceFilter(source)) {
      const feedId = customFeedIdFromFilter(source);
      const ref = customFeeds.find((f) => f.id === feedId);
      if (!ref) throw new Error("Custom feed not found");
      articles = sortByPublished(await fetchCustomFeed(ref));
    } else {
      articles = sortByPublished(
        await fetchOneSource(source as NewsSource, feed, page),
      );
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

async function fetchCustomArticlePage(
  articleUrl: string,
): Promise<string | null> {
  const checked = validatePublicHttpsUrl(articleUrl);
  if (!checked.ok) return null;
  const qs = new URLSearchParams();
  qs.set("url", checked.href);
  try {
    const response = await fetch(
      `${proxyBase()}/custom/article?${qs.toString()}`,
      {
        headers: { Accept: "text/html,application/xhtml+xml,*/*" },
        signal: AbortSignal.timeout(CUSTOM_NEWS_ARTICLE_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Resolve built-in or custom article from caches, then HTML / RSS fallback. */
export async function resolveNewsArticle(
  id: string,
  opts?: {
    source?: NewsSourceFilter | string;
    feed?: string;
    force?: boolean;
    customFeeds?: CustomFeedRef[];
  },
): Promise<NewsArticle | null> {
  const customParsed = parseCustomNewsId(id);
  if (customParsed) {
    return resolveCustomNewsArticle(id, customParsed, opts);
  }

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
      customFeeds: opts?.customFeeds,
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

async function resolveCustomNewsArticle(
  id: string,
  parsed: { feedId: string; itemKey: string },
  opts?: {
    force?: boolean;
    customFeeds?: CustomFeedRef[];
  },
): Promise<NewsArticle | null> {
  if (!opts?.force) {
    const mem = articleCache.get(id);
    if (mem) {
      return enrichCustomArticleBody(mem, parsed);
    }
  }

  let base: NewsArticle | null = null;
  const filter = `custom:${parsed.feedId}` as NewsSourceFilter;
  try {
    const list = await fetchNewsArticles({
      force: opts?.force,
      source: filter,
      customFeeds: opts?.customFeeds,
    });
    base = findNewsArticle(list, id) || null;
  } catch {
    /* continue */
  }
  if (!base) {
    for (const { articles } of cacheByKey.values()) {
      const hit = findNewsArticle(articles, id);
      if (hit) {
        base = hit;
        break;
      }
    }
  }
  if (!base) {
    const offlineArticle = await loadNewsArticleOffline(id);
    if (offlineArticle) base = offlineArticle;
  }
  if (!base) return null;
  return enrichCustomArticleBody(base, parsed);
}

async function enrichCustomArticleBody(
  base: NewsArticle,
  parsed: { feedId: string; itemKey: string },
): Promise<NewsArticle> {
  const html = await fetchCustomArticlePage(base.link);
  const enriched = parseGenericArticleHtml(html || "", {
    feedId: parsed.feedId,
    itemKey: parsed.itemKey,
    linkHint: base.link,
    titleHint: base.title,
    authorHint: base.author,
    rssHtmlFallback: base.descriptionHtml,
  });
  const article = enriched
    ? {
        ...enriched,
        publishedAt: enriched.publishedAt || base.publishedAt,
        publishedMs: enriched.publishedMs || base.publishedMs,
        tags: enriched.tags.length ? enriched.tags : base.tags,
        thumbUrl: enriched.thumbUrl || base.thumbUrl,
      }
    : base;
  articleCache.set(article.id, article);
  void saveNewsArticleOffline(article);
  return article;
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
