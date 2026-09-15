import { defineStore } from "pinia";
import { computed } from "vue";
import { originModeOf, postFeedKey } from "@/misc/util/postOrigin";
import { useMainStore } from "./state";
import type { SavedPostEntry, UnifiedChildMode } from "./types";
import { UNIFIED_CHILD_MODES } from "./types";

const isUnifiedChild = (mode: string | undefined): mode is UnifiedChildMode =>
  !!mode && (UNIFIED_CHILD_MODES as string[]).includes(mode);

export const useSavedPostsStore = defineStore("saved-posts", () => {
  const main = useMainStore();

  const entries = computed(() =>
    [...(main.savedPosts?.entries || [])].sort((a, b) => b.savedAt - a.savedAt),
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

  const add = (originMode: UnifiedChildMode, id: number) => {
    if (!main.savedPosts) main.savedPosts = { entries: [] };
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
      (e) => postFeedKey({ id: e.id, __meta: { originMode: e.originMode } }) === feedKey,
    );

  return {
    entries,
    count,
    isSaved,
    isSavedByKey,
    add,
    remove,
    toggle,
  };
});
