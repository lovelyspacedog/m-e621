import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type { WatchedComicEntry } from "./types";
import { newPostCountFor } from "./WatchedPoolsStore";

export type WatchedComicSnapshot = {
  pageCount: number;
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

export const useWatchedComicsStore = defineStore("watched-comics", () => {
  const main = useMainStore();

  const entries = computed(() =>
    [...(main.watchedComics?.entries || [])].sort((a, b) => b.watchedAt - a.watchedAt),
  );

  const findEntry = (id: number) =>
    (main.watchedComics?.entries || []).find((entry) => entry.id === id);

  const isWatched = (id: number) => !!findEntry(id);

  const applySnapshot = (entry: WatchedComicEntry, snapshot?: WatchedComicSnapshot) => {
    if (!snapshot) return;
    if (Number.isFinite(snapshot.pageCount)) {
      entry.lastSeenPageCount = Math.max(0, Math.floor(snapshot.pageCount));
    }
    const iso = toIso(snapshot.updatedAt);
    if (iso) entry.lastSeenUpdatedAt = iso;
  };

  const add = (id: number, name: string, snapshot?: WatchedComicSnapshot) => {
    if (!main.watchedComics) main.watchedComics = { entries: [] };
    const existing = findEntry(id);
    if (existing) {
      if (name) existing.name = name;
      applySnapshot(existing, snapshot);
      return;
    }
    const entry: WatchedComicEntry = {
      id,
      name,
      watchedAt: Date.now(),
    };
    applySnapshot(entry, snapshot);
    main.watchedComics.entries.push(entry);
  };

  const remove = (id: number) => {
    if (!main.watchedComics?.entries) return;
    main.watchedComics.entries = main.watchedComics.entries.filter(
      (entry) => entry.id !== id,
    );
  };

  const toggle = (id: number, name: string, snapshot?: WatchedComicSnapshot) => {
    if (isWatched(id)) {
      remove(id);
      return false;
    }
    add(id, name, snapshot);
    return true;
  };

  /** Baseline or clear "new" after the user opens the comic. */
  const markSeen = (id: number, snapshot: WatchedComicSnapshot) => {
    const entry = findEntry(id);
    if (!entry) return;
    applySnapshot(entry, snapshot);
  };

  /**
   * First hydrate after upgrade: if lastSeen is missing, baseline to current
   * count so old watches do not all show false "new" badges.
   */
  const ensureBaseline = (id: number, snapshot: WatchedComicSnapshot) => {
    const entry = findEntry(id);
    if (!entry) return;
    if (entry.lastSeenPageCount != null) return;
    applySnapshot(entry, snapshot);
  };

  const newCount = (
    id: number,
    pageCount: number,
    updatedAt?: string | Date | null,
  ) => {
    const entry = findEntry(id);
    return newPostCountFor(
      entry
        ? {
            lastSeenPostCount: entry.lastSeenPageCount,
            lastSeenUpdatedAt: entry.lastSeenUpdatedAt,
          }
        : undefined,
      pageCount,
      updatedAt,
    );
  };

  const clearAll = () => {
    main.watchedComics = { entries: [] };
  };

  return {
    entries,
    findEntry,
    isWatched,
    add,
    remove,
    toggle,
    markSeen,
    ensureBaseline,
    newCount,
    clearAll,
  };
});
