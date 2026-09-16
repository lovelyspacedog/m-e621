import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type { PoolOriginMode } from "./types";

export const useWatchedPoolsStore = defineStore("watched-pools", () => {
  const main = useMainStore();

  const entries = computed(() => [...(main.watchedPools?.entries || [])].sort((a, b) => b.watchedAt - a.watchedAt));

  const keyOf = (originMode: PoolOriginMode, id: number) => `${originMode}:${id}`;

  const entriesFor = (originMode: PoolOriginMode) => entries.value.filter((entry) => entry.originMode === originMode);

  const isWatched = (originMode: PoolOriginMode, id: number) => {
    const key = keyOf(originMode, id);
    return (main.watchedPools?.entries || []).some((entry) => keyOf(entry.originMode, entry.id) === key);
  };

  const add = (originMode: PoolOriginMode, id: number) => {
    if (!main.watchedPools) main.watchedPools = { entries: [] };
    if (isWatched(originMode, id)) return;
    main.watchedPools.entries.push({
      originMode,
      id,
      watchedAt: Date.now(),
    });
  };

  const remove = (originMode: PoolOriginMode, id: number) => {
    if (!main.watchedPools?.entries) return;
    const key = keyOf(originMode, id);
    main.watchedPools.entries = main.watchedPools.entries.filter((entry) => keyOf(entry.originMode, entry.id) !== key);
  };

  const toggle = (originMode: PoolOriginMode, id: number) => {
    if (isWatched(originMode, id)) {
      remove(originMode, id);
      return false;
    }
    add(originMode, id);
    return true;
  };

  return { entries, entriesFor, isWatched, add, remove, toggle };
});
