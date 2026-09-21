import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type { NewsFeedLayout, NewsSavedArticle, NewsState } from "./types";
import { migrateLegacyNewsId } from "@/worker/news/ids";
import { saveNewsArticleOffline } from "@/worker/news/offlineCache";
import {
  excerptFromDescription,
  type NewsArticle,
} from "@/worker/news/parseRss";

const READ_CAP = 500;
const SAVED_CAP = 200;

function ensureState(main: ReturnType<typeof useMainStore>): NewsState {
  if (!main.news) {
    main.news = { readIds: [], saved: [], layout: "list" };
  }
  if (!Array.isArray(main.news.readIds)) main.news.readIds = [];
  if (!Array.isArray(main.news.saved)) main.news.saved = [];
  if (main.news.layout !== "magazine") main.news.layout = "list";
  return main.news;
}

function resolveSource(
  id: string,
  source?: string,
): "flayrah" | "dogpatch" {
  if (source === "dogpatch" || source === "flayrah") return source;
  return migrateLegacyNewsId(id)?.startsWith("dogpatch:")
    ? "dogpatch"
    : "flayrah";
}

export const useNewsStore = defineStore("news", () => {
  const main = useMainStore();

  const layout = computed({
    get: (): NewsFeedLayout => ensureState(main).layout,
    set: (value: NewsFeedLayout) => {
      ensureState(main).layout = value === "magazine" ? "magazine" : "list";
    },
  });

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
  }) => {
    if (!article.id) return;
    const state = ensureState(main);
    const source = resolveSource(article.id, article.source);
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
    };
    state.saved = [
      entry,
      ...state.saved.filter((e) => e.id !== article.id),
    ].slice(0, SAVED_CAP);

    // Keep a durable offline copy so Saved opens even after RSS expiry.
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
    };
  };

  return {
    layout,
    saved,
    savedCount,
    readCount,
    isRead,
    markRead,
    markUnread,
    markAllRead,
    isSaved,
    saveArticle,
    unsaveArticle,
    toggleSaved,
    articleFromSaved,
  };
});

/** @deprecated */
export const useFlayrahNewsStore = useNewsStore;
