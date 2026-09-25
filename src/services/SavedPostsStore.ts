import { defineStore } from "pinia";
import { computed } from "vue";
import { originModeOf, postFeedKey } from "@/misc/util/postOrigin";
import { useMainStore } from "./state";
import type {
  SavedPostCollection,
  SavedPostEntry,
  UnifiedChildMode,
} from "./types";
import { UNIFIED_CHILD_MODES } from "./types";

const isUnifiedChild = (mode: string | undefined): mode is UnifiedChildMode =>
  !!mode && (UNIFIED_CHILD_MODES as string[]).includes(mode);

const makeCollectionId = () =>
  `scol-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const ensureSavedPosts = (main: ReturnType<typeof useMainStore>) => {
  if (!main.savedPosts) {
    main.savedPosts = { entries: [], collections: [] };
  }
  if (!Array.isArray(main.savedPosts.collections)) {
    main.savedPosts.collections = [];
  }
  if (!Array.isArray(main.savedPosts.entries)) {
    main.savedPosts.entries = [];
  }
};

export const useSavedPostsStore = defineStore("saved-posts", () => {
  const main = useMainStore();

  const entries = computed(() =>
    [...(main.savedPosts?.entries || [])].sort((a, b) => b.savedAt - a.savedAt),
  );

  const collections = computed(() =>
    [...(main.savedPosts?.collections || [])].sort((a, b) => a.order - b.order),
  );

  const count = computed(() => main.savedPosts?.entries?.length || 0);

  const keyOf = (originMode: UnifiedChildMode, id: number) =>
    `${originMode}:${id}`;

  const resolveOrigin = (post: {
    id: number;
    __meta?: { originMode?: string };
  }): UnifiedChildMode | null => {
    const mode = originModeOf(post, main.activeMode);
    return isUnifiedChild(mode) ? mode : null;
  };

  const isSaved = (
    post: { id: number; __meta?: { originMode?: string } } | null | undefined,
  ) => {
    if (!post) return false;
    const mode = resolveOrigin(post);
    if (!mode) return false;
    const key = keyOf(mode, post.id);
    return (main.savedPosts?.entries || []).some(
      (e) => keyOf(e.originMode, e.id) === key,
    );
  };

  const stripKeyFromCollections = (feedKey: string) => {
    ensureSavedPosts(main);
    for (const col of main.savedPosts.collections) {
      if (col.postKeys.includes(feedKey)) {
        col.postKeys = col.postKeys.filter((k) => k !== feedKey);
      }
    }
  };

  const add = (originMode: UnifiedChildMode, id: number) => {
    ensureSavedPosts(main);
    const key = keyOf(originMode, id);
    if (main.savedPosts.entries.some((e) => keyOf(e.originMode, e.id) === key)) {
      return;
    }
    const entry: SavedPostEntry = {
      originMode,
      id,
      savedAt: Date.now(),
    };
    main.savedPosts.entries.push(entry);
  };

  const remove = (originMode: UnifiedChildMode, id: number) => {
    if (!main.savedPosts?.entries) return;
    const key = keyOf(originMode, id);
    main.savedPosts.entries = main.savedPosts.entries.filter(
      (e) => keyOf(e.originMode, e.id) !== key,
    );
    stripKeyFromCollections(key);
  };

  const toggle = (post: {
    id: number;
    __meta?: { originMode?: string };
  }) => {
    const mode = resolveOrigin(post);
    if (!mode) return false;
    // Stamp origin so postFeedKey stays unambiguous after save from single-site feed.
    if (post.__meta && !post.__meta.originMode) {
      post.__meta.originMode = mode;
    }
    if (isSaved(post)) {
      remove(mode, post.id);
      return false;
    }
    add(mode, post.id);
    return true;
  };

  const isSavedByKey = (feedKey: string) =>
    (main.savedPosts?.entries || []).some(
      (e) =>
        postFeedKey({ id: e.id, __meta: { originMode: e.originMode } }) ===
        feedKey,
    );

  const clearAll = () => {
    ensureSavedPosts(main);
    main.savedPosts.entries = [];
    for (const col of main.savedPosts.collections) {
      col.postKeys = [];
    }
  };

  const createCollection = (name: string): SavedPostCollection | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    ensureSavedPosts(main);
    const maxOrder = main.savedPosts.collections.length
      ? Math.max(...main.savedPosts.collections.map((c) => c.order))
      : -1;
    const col: SavedPostCollection = {
      id: makeCollectionId(),
      name: trimmed,
      order: maxOrder + 1,
      postKeys: [],
    };
    main.savedPosts.collections.push(col);
    return col;
  };

  const renameCollection = (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    ensureSavedPosts(main);
    const col = main.savedPosts.collections.find((c) => c.id === id);
    if (col) col.name = trimmed;
  };

  const deleteCollection = (id: string) => {
    ensureSavedPosts(main);
    main.savedPosts.collections = main.savedPosts.collections.filter(
      (c) => c.id !== id,
    );
  };

  const isInCollection = (collectionId: string, feedKey: string) => {
    const col = main.savedPosts?.collections?.find((c) => c.id === collectionId);
    return !!col?.postKeys.includes(feedKey);
  };

  const setInCollection = (
    collectionId: string,
    feedKey: string,
    present: boolean,
  ) => {
    ensureSavedPosts(main);
    const col = main.savedPosts.collections.find((c) => c.id === collectionId);
    if (!col) return;
    const has = col.postKeys.includes(feedKey);
    if (present && !has) {
      // Ensure the post is bookmarked when added to a collection.
      const [originMode, idRaw] = feedKey.split(":");
      const id = Number(idRaw);
      if (isUnifiedChild(originMode) && Number.isFinite(id)) {
        add(originMode, id);
      }
      col.postKeys = [...col.postKeys, feedKey];
    } else if (!present && has) {
      col.postKeys = col.postKeys.filter((k) => k !== feedKey);
    }
  };

  const replaceCollectionKeys = (collectionId: string, keys: string[]) => {
    ensureSavedPosts(main);
    const col = main.savedPosts.collections.find((c) => c.id === collectionId);
    if (!col) return;
    const unique = [...new Set(keys.filter(Boolean))];
    for (const key of unique) {
      const [originMode, idRaw] = key.split(":");
      const id = Number(idRaw);
      if (isUnifiedChild(originMode) && Number.isFinite(id)) {
        add(originMode, id);
      }
    }
    col.postKeys = unique;
  };

  const entriesForCollection = (collectionId: string | null) => {
    if (!collectionId) return entries.value;
    const col = main.savedPosts?.collections?.find((c) => c.id === collectionId);
    if (!col) return [];
    const set = new Set(col.postKeys);
    return entries.value.filter((e) => set.has(keyOf(e.originMode, e.id)));
  };

  return {
    entries,
    collections,
    count,
    isSaved,
    isSavedByKey,
    add,
    remove,
    toggle,
    clearAll,
    createCollection,
    renameCollection,
    deleteCollection,
    isInCollection,
    setInCollection,
    replaceCollectionKeys,
    entriesForCollection,
    keyOf,
  };
});
