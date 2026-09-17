import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type {
  FlayrahFeedLayout,
  FlayrahNewsState,
  FlayrahSavedArticle,
} from "./types";

const READ_CAP = 500;
const SAVED_CAP = 200;

function ensureState(main: ReturnType<typeof useMainStore>): FlayrahNewsState {
  if (!main.flayrahNews) {
    main.flayrahNews = { readIds: [], saved: [], layout: "list" };
  }
  if (!Array.isArray(main.flayrahNews.readIds)) main.flayrahNews.readIds = [];
  if (!Array.isArray(main.flayrahNews.saved)) main.flayrahNews.saved = [];
  if (main.flayrahNews.layout !== "magazine") main.flayrahNews.layout = "list";
  return main.flayrahNews;
}

export const useFlayrahNewsStore = defineStore("flayrah-news", () => {
  const main = useMainStore();

  const layout = computed({
    get: (): FlayrahFeedLayout => ensureState(main).layout,
    set: (value: FlayrahFeedLayout) => {
      ensureState(main).layout = value === "magazine" ? "magazine" : "list";
    },
  });

  const saved = computed(() =>
    [...ensureState(main).saved].sort((a, b) => b.savedAt - a.savedAt),
  );

  const savedCount = computed(() => ensureState(main).saved.length);

  const readCount = computed(() => ensureState(main).readIds.length);

  const isRead = (id: number) => ensureState(main).readIds.includes(id);

  const markRead = (id: number) => {
    if (!id) return;
    const state = ensureState(main);
    const next = [id, ...state.readIds.filter((x) => x !== id)];
    state.readIds = next.slice(0, READ_CAP);
  };

  const markUnread = (id: number) => {
    const state = ensureState(main);
    state.readIds = state.readIds.filter((x) => x !== id);
  };

  const isSaved = (id: number) =>
    ensureState(main).saved.some((e) => e.id === id);

  const saveArticle = (article: {
    id: number;
    title: string;
    link: string;
    author: string;
    thumbUrl: string | null;
  }) => {
    if (!article.id) return;
    const state = ensureState(main);
    const entry: FlayrahSavedArticle = {
      id: article.id,
      title: article.title,
      link: article.link,
      author: article.author,
      thumbUrl: article.thumbUrl,
      savedAt: Date.now(),
    };
    state.saved = [
      entry,
      ...state.saved.filter((e) => e.id !== article.id),
    ].slice(0, SAVED_CAP);
  };

  const unsaveArticle = (id: number) => {
    const state = ensureState(main);
    state.saved = state.saved.filter((e) => e.id !== id);
  };

  const toggleSaved = (article: {
    id: number;
    title: string;
    link: string;
    author: string;
    thumbUrl: string | null;
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
