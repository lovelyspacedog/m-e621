import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type { NewsFeedLayout, NewsSavedArticle, NewsState } from "./types";
import { migrateLegacyNewsId } from "@/worker/news/ids";

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

  const isSaved = (id: string) =>
    ensureState(main).saved.some((e) => e.id === id);

  const saveArticle = (article: {
    id: string;
    title: string;
    link: string;
    author: string;
    thumbUrl: string | null;
    source?: string;
  }) => {
    if (!article.id) return;
    const state = ensureState(main);
    const entry: NewsSavedArticle = {
      id: article.id,
      title: article.title,
      link: article.link,
      author: article.author,
      thumbUrl: article.thumbUrl,
      savedAt: Date.now(),
      source:
        article.source === "dogpatch" || article.source === "flayrah"
          ? article.source
          : migrateLegacyNewsId(article.id)?.startsWith("dogpatch:")
            ? "dogpatch"
            : "flayrah",
    };
    state.saved = [
      entry,
      ...state.saved.filter((e) => e.id !== article.id),
    ].slice(0, SAVED_CAP);
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
  }) => {
    if (isSaved(article.id)) {
      unsaveArticle(article.id);
      return false;
    }
    saveArticle(article);
    return true;
  };

  return {
    layout,
    saved,
    savedCount,
    readCount,
    isRead,
    markRead,
    markUnread,
    isSaved,
    saveArticle,
    unsaveArticle,
    toggleSaved,
  };
});

/** @deprecated */
export const useFlayrahNewsStore = useNewsStore;
