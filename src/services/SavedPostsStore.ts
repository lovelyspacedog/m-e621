import { defineStore } from "pinia";
import { computed } from "vue";
import { originModeOf, postFeedKey } from "@/misc/util/postOrigin";
import {
  parseU18chanSavedKey,
  savedEntryFeedKey,
  type U18chanSavedMeta,
} from "@/misc/util/u18chanSavedPosts";
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

const ensureBookmarkFromFeedKey = (
  main: ReturnType<typeof useMainStore>,
  feedKey: string,
  addUnified: (originMode: UnifiedChildMode, id: number) => void,
  addU18: (liveBoard: string, topicId: number) => void,
) => {
  const u18 = parseU18chanSavedKey(feedKey);
  if (u18) {
    addU18(u18.liveBoard, u18.topicId);
    return;
  }
  const [originMode, idRaw] = feedKey.split(":");
  const id = Number(idRaw);
  if (isUnifiedChild(originMode) && Number.isFinite(id)) {
    addUnified(originMode, id);
  }
};

export const useSavedPostsStore = defineStore("saved-posts", () => {
  const main = useMainStore();

  const entries = computed(() =>
    [...(main.savedPosts?.entries || [])].sort((a, b) => b.savedAt - a.savedAt),
  );

  const u18chanEntries = computed(() =>
    entries.value.filter((e) => e.originMode === "u18chan"),
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
      (e) =>
        e.originMode !== "u18chan" &&
        keyOf(e.originMode as UnifiedChildMode, e.id) === key,
    );
  };

  const isU18chanThreadSaved = (liveBoard: string, topicId: number) =>
    (main.savedPosts?.entries || []).some(
      (e) =>
        e.originMode === "u18chan" &&
        e.u18chanLiveBoard === liveBoard &&
        e.id === topicId,
    );

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
    if (
      main.savedPosts.entries.some(
        (e) =>
          e.originMode !== "u18chan" &&
          keyOf(e.originMode as UnifiedChildMode, e.id) === key,
      )
    ) {
      return;
    }
    const entry: SavedPostEntry = {
      originMode,
      id,
      savedAt: Date.now(),
    };
    main.savedPosts.entries.push(entry);
  };

  const addU18chan = (
    liveBoard: string,
    topicId: number,
    meta?: U18chanSavedMeta,
  ) => {
    ensureSavedPosts(main);
    if (isU18chanThreadSaved(liveBoard, topicId)) return;
    const entry: SavedPostEntry = {
      originMode: "u18chan",
      id: topicId,
      savedAt: Date.now(),
      u18chanLiveBoard: liveBoard,
      u18chanIndexBoard: meta?.indexBoard,
      u18chanSubject: meta?.subject,
      u18chanThumbUrl: meta?.thumbUrl ?? null,
    };
    main.savedPosts.entries.push(entry);
  };

  const remove = (originMode: UnifiedChildMode, id: number) => {
    if (!main.savedPosts?.entries) return;
    const key = keyOf(originMode, id);
    main.savedPosts.entries = main.savedPosts.entries.filter(
      (e) =>
        e.originMode === "u18chan" ||
        keyOf(e.originMode as UnifiedChildMode, e.id) !== key,
    );
    stripKeyFromCollections(key);
  };

  const removeU18chan = (liveBoard: string, topicId: number) => {
    if (!main.savedPosts?.entries) return;
    const key = savedEntryFeedKey({
      originMode: "u18chan",
      id: topicId,
      savedAt: 0,
      u18chanLiveBoard: liveBoard,
    });
    main.savedPosts.entries = main.savedPosts.entries.filter(
      (e) => savedEntryFeedKey(e) !== key,
    );
    stripKeyFromCollections(key);
  };

  const toggle = (post: {
    id: number;
    __meta?: { originMode?: string };
  }) => {
    const mode = resolveOrigin(post);
    if (!mode) return false;
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

  const toggleU18chan = (
    liveBoard: string,
    topicId: number,
    meta?: U18chanSavedMeta,
  ) => {
    if (isU18chanThreadSaved(liveBoard, topicId)) {
      removeU18chan(liveBoard, topicId);
      return false;
    }
    addU18chan(liveBoard, topicId, meta);
    return true;
  };

  const isSavedByKey = (feedKey: string) =>
    (main.savedPosts?.entries || []).some(
      (e) => savedEntryFeedKey(e) === feedKey,
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
      ensureBookmarkFromFeedKey(main, feedKey, add, (lb, id) =>
        addU18chan(lb, id),
      );
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
      ensureBookmarkFromFeedKey(main, key, add, (lb, id) => addU18chan(lb, id));
    }
    col.postKeys = unique;
  };

  const entriesForCollection = (collectionId: string | null) => {
    if (!collectionId) return entries.value;
    const col = main.savedPosts?.collections?.find((c) => c.id === collectionId);
    if (!col) return [];
    const set = new Set(col.postKeys);
    return entries.value.filter((e) => set.has(savedEntryFeedKey(e)));
  };

  const u18chanEntriesForCollection = (collectionId: string | null) => {
    const list = entriesForCollection(collectionId).filter(
      (e) => e.originMode === "u18chan",
    );
    return list;
  };

  return {
    entries,
    u18chanEntries,
    collections,
    count,
    isSaved,
    isU18chanThreadSaved,
    isSavedByKey,
    add,
    addU18chan,
    remove,
    removeU18chan,
    toggle,
    toggleU18chan,
    clearAll,
    createCollection,
    renameCollection,
    deleteCollection,
    isInCollection,
    setInCollection,
    replaceCollectionKeys,
    entriesForCollection,
    u18chanEntriesForCollection,
    keyOf,
    savedEntryFeedKey,
  };
});
