import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type { WatchedU18chanEntry } from "./types";
import { newPostCountFor } from "./WatchedPoolsStore";

export type WatchedU18chanSnapshot = {
  postCount?: number;
  updatedAt?: string | Date | null;
  subject?: string;
  thumbUrl?: string | null;
  indexBoard?: string;
};

export const u18chanWatchKey = (liveBoard: string, topicId: number) =>
  `${String(liveBoard || "").toLowerCase()}:${Math.floor(topicId)}`;

const toIso = (value: string | Date | null | undefined): string | undefined => {
  if (value == null) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  const trimmed = String(value).trim();
  return trimmed || undefined;
};

export const useWatchedU18chanStore = defineStore("watched-u18chan", () => {
  const main = useMainStore();

  const entries = computed(() =>
    [...(main.watchedU18chan?.entries || [])].sort(
      (a, b) => b.watchedAt - a.watchedAt,
    ),
  );

  const findEntry = (liveBoard: string, topicId: number) => {
    const key = u18chanWatchKey(liveBoard, topicId);
    return (main.watchedU18chan?.entries || []).find(
      (entry) => u18chanWatchKey(entry.liveBoard, entry.topicId) === key,
    );
  };

  const isWatched = (liveBoard: string, topicId: number) =>
    !!findEntry(liveBoard, topicId);

  const applySnapshot = (
    entry: WatchedU18chanEntry,
    snapshot?: WatchedU18chanSnapshot,
  ) => {
    if (!snapshot) return;
    if (snapshot.postCount != null && Number.isFinite(snapshot.postCount)) {
      entry.lastSeenPostCount = Math.max(0, Math.floor(snapshot.postCount));
    }
    const iso = toIso(snapshot.updatedAt);
    if (iso) entry.lastSeenUpdatedAt = iso;
    if (snapshot.subject) entry.subject = snapshot.subject;
    if (snapshot.thumbUrl !== undefined) entry.thumbUrl = snapshot.thumbUrl;
    if (snapshot.indexBoard) entry.indexBoard = snapshot.indexBoard;
  };

  const add = (
    liveBoard: string,
    topicId: number,
    subject: string,
    indexBoard: string,
    snapshot?: WatchedU18chanSnapshot,
  ) => {
    if (!main.watchedU18chan) main.watchedU18chan = { entries: [] };
    const existing = findEntry(liveBoard, topicId);
    if (existing) {
      if (subject) existing.subject = subject;
      if (indexBoard) existing.indexBoard = indexBoard;
      applySnapshot(existing, snapshot);
      return;
    }
    const entry: WatchedU18chanEntry = {
      liveBoard: String(liveBoard || "").toLowerCase(),
      topicId: Math.floor(topicId),
      indexBoard: String(indexBoard || "").toLowerCase(),
      subject: subject || `Thread ${topicId}`,
      thumbUrl: snapshot?.thumbUrl ?? null,
      watchedAt: Date.now(),
    };
    applySnapshot(entry, snapshot);
    main.watchedU18chan.entries.push(entry);
  };

  const remove = (liveBoard: string, topicId: number) => {
    if (!main.watchedU18chan?.entries) return;
    const key = u18chanWatchKey(liveBoard, topicId);
    main.watchedU18chan.entries = main.watchedU18chan.entries.filter(
      (entry) => u18chanWatchKey(entry.liveBoard, entry.topicId) !== key,
    );
  };

  const toggle = (
    liveBoard: string,
    topicId: number,
    subject: string,
    indexBoard: string,
    snapshot?: WatchedU18chanSnapshot,
  ) => {
    if (isWatched(liveBoard, topicId)) {
      remove(liveBoard, topicId);
      return false;
    }
    add(liveBoard, topicId, subject, indexBoard, snapshot);
    return true;
  };

  /** Baseline or clear "new" after the user opens the thread. */
  const markSeen = (
    liveBoard: string,
    topicId: number,
    snapshot: WatchedU18chanSnapshot & { postCount: number },
  ) => {
    const entry = findEntry(liveBoard, topicId);
    if (!entry) return;
    applySnapshot(entry, snapshot);
  };

  /**
   * First hydrate after upgrade: if lastSeen is missing, baseline to current
   * count so old watches do not all show false "new" badges.
   */
  const ensureBaseline = (
    liveBoard: string,
    topicId: number,
    snapshot: WatchedU18chanSnapshot & { postCount: number },
  ) => {
    const entry = findEntry(liveBoard, topicId);
    if (!entry) return;
    if (entry.lastSeenPostCount != null) return;
    applySnapshot(entry, snapshot);
  };

  const newCount = (
    liveBoard: string,
    topicId: number,
    postCount: number,
    updatedAt?: string | Date | null,
  ) => {
    const entry = findEntry(liveBoard, topicId);
    return newPostCountFor(
      entry
        ? {
            lastSeenPostCount: entry.lastSeenPostCount,
            lastSeenUpdatedAt: entry.lastSeenUpdatedAt,
          }
        : undefined,
      postCount,
      updatedAt,
    );
  };

  const clearAll = () => {
    main.watchedU18chan = { entries: [] };
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
