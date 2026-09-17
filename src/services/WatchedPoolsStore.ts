import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type { PoolOriginMode, WatchedPoolEntry } from "./types";

export type WatchedPoolSnapshot = {
  postCount: number;
  updatedAt?: string | Date | null;
};

const toIso = (value: string | Date | null | undefined): string | undefined => {
  if (value == null) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  const trimmed = String(value).trim();
  return trimmed || undefined;
};

export const newPostCountFor = (
  entry: Pick<WatchedPoolEntry, "lastSeenPostCount"> | undefined,
  postCount: number,
): number => {
  if (entry?.lastSeenPostCount == null) return 0;
  return Math.max(0, postCount - entry.lastSeenPostCount);
};

export const useWatchedPoolsStore = defineStore("watched-pools", () => {
  const main = useMainStore();

  const entries = computed(() =>
    [...(main.watchedPools?.entries || [])].sort((a, b) => b.watchedAt - a.watchedAt),
  );

  const keyOf = (originMode: PoolOriginMode, id: number) => `${originMode}:${id}`;

  const entriesFor = (originMode: PoolOriginMode) =>
    entries.value.filter((entry) => entry.originMode === originMode);

  const findEntry = (originMode: PoolOriginMode, id: number) => {
    const key = keyOf(originMode, id);
    return (main.watchedPools?.entries || []).find(
      (entry) => keyOf(entry.originMode, entry.id) === key,
    );
  };

  const isWatched = (originMode: PoolOriginMode, id: number) => !!findEntry(originMode, id);

  const applySnapshot = (entry: WatchedPoolEntry, snapshot?: WatchedPoolSnapshot) => {
    if (!snapshot) return;
    if (Number.isFinite(snapshot.postCount)) {
      entry.lastSeenPostCount = Math.max(0, Math.floor(snapshot.postCount));
    }
    const iso = toIso(snapshot.updatedAt);
    if (iso) entry.lastSeenUpdatedAt = iso;
  };

  const add = (originMode: PoolOriginMode, id: number, snapshot?: WatchedPoolSnapshot) => {
    if (!main.watchedPools) main.watchedPools = { entries: [] };
    const existing = findEntry(originMode, id);
    if (existing) {
      applySnapshot(existing, snapshot);
      return;
    }
    const entry: WatchedPoolEntry = {
      originMode,
      id,
      watchedAt: Date.now(),
    };
    applySnapshot(entry, snapshot);
    main.watchedPools.entries.push(entry);
  };

  const remove = (originMode: PoolOriginMode, id: number) => {
    if (!main.watchedPools?.entries) return;
    const key = keyOf(originMode, id);
    main.watchedPools.entries = main.watchedPools.entries.filter(
      (entry) => keyOf(entry.originMode, entry.id) !== key,
    );
  };

  const toggle = (originMode: PoolOriginMode, id: number, snapshot?: WatchedPoolSnapshot) => {
    if (isWatched(originMode, id)) {
      remove(originMode, id);
      return false;
    }
    add(originMode, id, snapshot);
    return true;
  };

  /** Baseline or clear "new" after the user opens the pool. */
  const markSeen = (originMode: PoolOriginMode, id: number, snapshot: WatchedPoolSnapshot) => {
    const entry = findEntry(originMode, id);
    if (!entry) return;
    applySnapshot(entry, snapshot);
  };

  /**
   * First hydrate after upgrade: if lastSeen is missing, baseline to current
   * count so old watches do not all show false "new" badges.
   */
  const ensureBaseline = (originMode: PoolOriginMode, id: number, snapshot: WatchedPoolSnapshot) => {
    const entry = findEntry(originMode, id);
    if (!entry) return;
    if (entry.lastSeenPostCount != null) return;
    applySnapshot(entry, snapshot);
  };

  const newCount = (originMode: PoolOriginMode, id: number, postCount: number) =>
    newPostCountFor(findEntry(originMode, id), postCount);

  return {
    entries,
    entriesFor,
    findEntry,
    isWatched,
    add,
    remove,
    toggle,
    markSeen,
    ensureBaseline,
    newCount,
  };
});
