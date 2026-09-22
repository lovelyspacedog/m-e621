import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type {
  NewsCustomFeed,
  NewsFeedLayout,
  NewsReaderFontScale,
  NewsReaderWidth,
  NewsSavedArticle,
  NewsState,
} from "./types";
import { migrateLegacyNewsId, parseNewsId, isNewsSource } from "@/worker/news/ids";
import {
  isCustomNewsId,
  makeCustomFeedId,
  parseCustomNewsId,
  parseCustomNewsSourceKey,
  customNewsSourceKey,
} from "@/worker/news/customIds";
import { CUSTOM_NEWS_FEED_CAP, validatePublicHttpsUrl } from "@/worker/news/customUrl";
import { saveNewsArticleOffline } from "@/worker/news/offlineCache";
import {
  excerptFromDescription,
  type NewsArticle,
} from "@/worker/news/parseRss";

const READ_CAP = 500;
const SAVED_CAP = 200;
const WATCH_AUTHOR_CAP = 50;

function normalizeFontScale(raw: unknown): NewsReaderFontScale {
  return raw === "sm" || raw === "lg" ? raw : "md";
}

function normalizeWidth(raw: unknown): NewsReaderWidth {
  return raw === "narrow" || raw === "wide" ? raw : "normal";
}

function normalizeAuthorKey(name: string): string {
  return name.trim().toLowerCase();
}

function ensureState(main: ReturnType<typeof useMainStore>): NewsState {
  if (!main.news) {
    main.news = {
      readIds: [],
      saved: [],
      layout: "list",
      readerFontScale: "md",
      readerWidth: "normal",
      watchedAuthors: [],
      lastSeenPublishedMs: null,
      notifyNew: false,
      customFeeds: [],
    };
  }
  if (!Array.isArray(main.news.readIds)) main.news.readIds = [];
  if (!Array.isArray(main.news.saved)) main.news.saved = [];
  if (!Array.isArray(main.news.watchedAuthors)) main.news.watchedAuthors = [];
  if (!Array.isArray(main.news.customFeeds)) main.news.customFeeds = [];
  if (main.news.layout !== "magazine") main.news.layout = "list";
  main.news.readerFontScale = normalizeFontScale(main.news.readerFontScale);
  main.news.readerWidth = normalizeWidth(main.news.readerWidth);
  if (main.news.notifyNew == null) main.news.notifyNew = false;
  if (main.news.lastSeenPublishedMs === undefined) {
    main.news.lastSeenPublishedMs = null;
  }
  return main.news;
}

/** Resolve article source string (built-in or custom:…). Never invent flayrah for custom ids. */
function resolveSource(
  id: string,
  source?: string,
): string {
  if (source && parseCustomNewsSourceKey(source)) return source;
  if (isNewsSource(source)) return source;
  const custom = parseCustomNewsId(id);
  if (custom) return customNewsSourceKey(custom.feedId);
  if (source && typeof source === "string" && source.startsWith("custom:")) {
    return source;
  }
  const migrated = migrateLegacyNewsId(id);
  if (migrated) {
    const parsed = parseNewsId(migrated);
    if (parsed) return parsed.source;
  }
  if (isCustomNewsId(id)) {
    const p = parseCustomNewsId(id);
    return p ? customNewsSourceKey(p.feedId) : id;
  }
  return "flayrah";
}

export const useNewsStore = defineStore("news", () => {
  const main = useMainStore();

  const layout = computed({
    get: (): NewsFeedLayout => ensureState(main).layout,
    set: (value: NewsFeedLayout) => {
      ensureState(main).layout = value === "magazine" ? "magazine" : "list";
    },
  });

  const readerFontScale = computed({
    get: (): NewsReaderFontScale =>
      normalizeFontScale(ensureState(main).readerFontScale),
    set: (value: NewsReaderFontScale) => {
      ensureState(main).readerFontScale = normalizeFontScale(value);
    },
  });

  const readerWidth = computed({
    get: (): NewsReaderWidth => normalizeWidth(ensureState(main).readerWidth),
    set: (value: NewsReaderWidth) => {
      ensureState(main).readerWidth = normalizeWidth(value);
    },
  });

  const notifyNew = computed({
    get: (): boolean => Boolean(ensureState(main).notifyNew),
    set: (value: boolean) => {
      ensureState(main).notifyNew = Boolean(value);
    },
  });

  const lastSeenPublishedMs = computed(
    () => ensureState(main).lastSeenPublishedMs ?? null,
  );

  const watchedAuthors = computed(() => [
    ...(ensureState(main).watchedAuthors || []),
  ]);

  const customFeeds = computed(() => [
    ...(ensureState(main).customFeeds || []),
  ]);

  const getCustomFeed = (feedId: string): NewsCustomFeed | undefined =>
    (ensureState(main).customFeeds || []).find((f) => f.id === feedId);

  const addCustomFeed = (opts: {
    url: string;
    label: string;
  }): NewsCustomFeed => {
    const checked = validatePublicHttpsUrl(opts.url);
    if (!checked.ok) throw new Error(checked.error);
    const state = ensureState(main);
    const feeds = state.customFeeds || [];
    if (feeds.length >= CUSTOM_NEWS_FEED_CAP) {
      throw new Error(`At most ${CUSTOM_NEWS_FEED_CAP} custom feeds`);
    }
    if (feeds.some((f) => f.url === checked.href)) {
      throw new Error("Feed already added");
    }
    const label = (opts.label || checked.hostname).trim().slice(0, 80) || checked.hostname;
    const entry: NewsCustomFeed = {
      id: makeCustomFeedId(),
      url: checked.href,
      label,
      addedAt: Date.now(),
    };
    state.customFeeds = [...feeds, entry];
    return entry;
  };

  const updateCustomFeedLabel = (feedId: string, label: string) => {
    const state = ensureState(main);
    const feeds = state.customFeeds || [];
    const idx = feeds.findIndex((f) => f.id === feedId);
    if (idx < 0) return;
    const next = { ...feeds[idx], label: label.trim().slice(0, 80) || feeds[idx].label };
    state.customFeeds = [
      ...feeds.slice(0, idx),
      next,
      ...feeds.slice(idx + 1),
    ];
  };

  const removeCustomFeed = (feedId: string) => {
    const state = ensureState(main);
    state.customFeeds = (state.customFeeds || []).filter((f) => f.id !== feedId);
  };

  const customFeedLabel = (feedId: string): string =>
    getCustomFeed(feedId)?.label || feedId;

  const saved = computed(() =>
    [...ensureState(main).saved].sort((a, b) => b.savedAt - a.savedAt),
  );

  const savedCount = computed(() => ensureState(main).saved.length);

  const readCount = computed(() => ensureState(main).readIds.length);

  const isRead = (id: string) => ensureState(main).readIds.includes(id);

  const markRead = (id: string) => {
    if (!id) return;
    const state = ensureState(main);
    const next = [id, ...state.readIds.filter((x) => x !== id)];
    state.readIds = next.slice(0, READ_CAP);
  };

  const markUnread = (id: string) => {
    const state = ensureState(main);
    state.readIds = state.readIds.filter((x) => x !== id);
  };

  const markAllRead = (ids: string[]) => {
    if (!ids.length) return;
    const state = ensureState(main);
    const set = new Set(ids);
    const kept = state.readIds.filter((id) => !set.has(id));
    state.readIds = [...ids, ...kept].slice(0, READ_CAP);
  };

  const isSaved = (id: string) =>
    ensureState(main).saved.some((e) => e.id === id);

  const isWatchedAuthor = (author: string) => {
    const key = normalizeAuthorKey(author);
    if (!key) return false;
    return (ensureState(main).watchedAuthors || []).some(
      (a) => normalizeAuthorKey(a) === key,
    );
  };

  const watchAuthor = (author: string) => {
    const name = author.trim();
    if (!name) return;
    const state = ensureState(main);
    const key = normalizeAuthorKey(name);
    const rest = (state.watchedAuthors || []).filter(
      (a) => normalizeAuthorKey(a) !== key,
    );
    state.watchedAuthors = [name, ...rest].slice(0, WATCH_AUTHOR_CAP);
  };

  const unwatchAuthor = (author: string) => {
    const key = normalizeAuthorKey(author);
    if (!key) return;
    const state = ensureState(main);
    state.watchedAuthors = (state.watchedAuthors || []).filter(
      (a) => normalizeAuthorKey(a) !== key,
    );
  };

  const toggleWatchAuthor = (author: string) => {
    if (isWatchedAuthor(author)) {
      unwatchAuthor(author);
      return false;
    }
    watchAuthor(author);
    return true;
  };

  /**
   * First visit with a cursor missing: baseline so the whole feed does not
   * light up as "new".
   */
  const ensureFeedSeenBaseline = (maxPublishedMs: number) => {
    const state = ensureState(main);
    if (state.lastSeenPublishedMs != null) return;
    if (!Number.isFinite(maxPublishedMs) || maxPublishedMs <= 0) return;
    state.lastSeenPublishedMs = maxPublishedMs;
  };

  const markFeedSeen = (maxPublishedMs: number) => {
    if (!Number.isFinite(maxPublishedMs) || maxPublishedMs <= 0) return;
    const state = ensureState(main);
    const prev = state.lastSeenPublishedMs;
    if (prev == null || maxPublishedMs > prev) {
      state.lastSeenPublishedMs = maxPublishedMs;
    }
  };

  const countNewerThanSeen = (publishedMsList: number[]): number => {
    const seen = ensureState(main).lastSeenPublishedMs;
    if (seen == null) return 0;
    return publishedMsList.filter((ms) => ms > seen).length;
  };

  const isNewerThanSeen = (publishedMs: number): boolean => {
    if (!ensureState(main).notifyNew) return false;
    const seen = ensureState(main).lastSeenPublishedMs;
    if (seen == null || !publishedMs) return false;
    return publishedMs > seen;
  };

  const saveArticle = (article: {
    id: string;
    title: string;
    link: string;
    author: string;
    thumbUrl: string | null;
    source?: string;
    descriptionHtml?: string;
    excerpt?: string;
    tags?: string[];
    publishedAt?: string;
    publishedMs?: number;
    customFeedId?: string;
  }) => {
    if (!article.id) return;
    const state = ensureState(main);
    const source = resolveSource(article.id, article.source);
    const customFeedId =
      article.customFeedId ||
      parseCustomNewsId(article.id)?.feedId ||
      parseCustomNewsSourceKey(source) ||
      undefined;
    const entry: NewsSavedArticle = {
      id: article.id,
      title: article.title,
      link: article.link,
      author: article.author,
      thumbUrl: article.thumbUrl,
      savedAt: Date.now(),
      source,
      descriptionHtml: article.descriptionHtml || undefined,
      excerpt: article.excerpt || undefined,
      tags: article.tags?.length ? [...article.tags] : undefined,
      publishedAt: article.publishedAt || undefined,
      publishedMs: article.publishedMs || undefined,
      customFeedId,
    };
    state.saved = [
      entry,
      ...state.saved.filter((e) => e.id !== article.id),
    ].slice(0, SAVED_CAP);

    if (article.descriptionHtml) {
      const offline: NewsArticle = {
        id: article.id,
        source,
        title: article.title,
        link: article.link,
        author: article.author,
        publishedAt: article.publishedAt || "",
        publishedMs: article.publishedMs || Date.now(),
        tags: article.tags ? [...article.tags] : [],
        descriptionHtml: article.descriptionHtml,
        excerpt: article.excerpt || "",
        thumbUrl: article.thumbUrl,
        customFeedId,
      };
      void saveNewsArticleOffline(offline);
    }
  };

  const unsaveArticle = (id: string) => {
    const state = ensureState(main);
    state.saved = state.saved.filter((e) => e.id !== id);
  };

  const toggleSaved = (article: {
    id: string;
    title: string;
    link: string;
    author: string;
    thumbUrl: string | null;
    source?: string;
    descriptionHtml?: string;
    excerpt?: string;
    tags?: string[];
    publishedAt?: string;
    publishedMs?: number;
    customFeedId?: string;
  }) => {
    if (isSaved(article.id)) {
      unsaveArticle(article.id);
      return false;
    }
    saveArticle(article);
    return true;
  };

  /** Rebuild a NewsArticle from a saved snapshot (may lack body if legacy). */
  const articleFromSaved = (s: NewsSavedArticle): NewsArticle => {
    const source = resolveSource(s.id, s.source);
    const customFeedId =
      s.customFeedId ||
      parseCustomNewsId(s.id)?.feedId ||
      parseCustomNewsSourceKey(source) ||
      undefined;
    return {
      id: s.id,
      source,
      title: s.title,
      link: s.link,
      author: s.author,
      publishedAt: s.publishedAt || "",
      publishedMs: s.publishedMs || s.savedAt,
      tags: s.tags ? [...s.tags] : [],
      descriptionHtml: s.descriptionHtml || "",
      excerpt:
        s.excerpt ||
        (s.descriptionHtml
          ? excerptFromDescription(s.descriptionHtml)
          : "Saved article — open to read full text."),
      thumbUrl: s.thumbUrl,
      customFeedId,
    };
  };

  return {
    layout,
    readerFontScale,
    readerWidth,
    notifyNew,
    lastSeenPublishedMs,
    watchedAuthors,
    customFeeds,
    getCustomFeed,
    addCustomFeed,
    updateCustomFeedLabel,
    removeCustomFeed,
    customFeedLabel,
    saved,
    savedCount,
    readCount,
    isRead,
    markRead,
    markUnread,
    markAllRead,
    isSaved,
    isWatchedAuthor,
    watchAuthor,
    unwatchAuthor,
    toggleWatchAuthor,
    ensureFeedSeenBaseline,
    markFeedSeen,
    countNewerThanSeen,
    isNewerThanSeen,
    saveArticle,
    unsaveArticle,
    toggleSaved,
    articleFromSaved,
  };
});

/** @deprecated */
export const useFlayrahNewsStore = useNewsStore;
