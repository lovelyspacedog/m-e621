import { countNewerThanCursor, type PostCursorLike } from "@/misc/util/discoveryTools";
import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";

export type ArtistRadarCursor = {
  newestKey: string;
  createdMs?: number;
  checkedAt: number;
};

export type SavedSearchWakeCursor = {
  lastOpenedAt: number;
  newestKey?: string;
  createdMs?: number;
  lastHitCount?: number;
  checkedAt?: number;
};

export type FeedSeenCursor = {
  createdMs?: number;
  newestKey?: string;
  lastHitCount?: number;
  checkedAt?: number;
  checkedNewestMs?: number;
};

const MAX_RADAR_CURSORS = 400;
const MAX_WAKE_CURSORS = 200;

/** Placeholder newestKey when opened without a fetched top post. */
export const SAVED_SEARCH_OPENED_KEY = "__opened__";

export const useDiscoveryStore = defineStore("discovery", () => {
  const main = useMainStore();

  const artistCursors = computed(() => main.discovery.artistRadar.cursors);
  const wakeById = computed(() => main.discovery.savedSearchWake.byId);
  const feedSeenByKey = computed(() => main.discovery.feedSeen?.byKey || {});

  const getArtistCursor = (key: string): ArtistRadarCursor | undefined =>
    main.discovery.artistRadar.cursors[key];

  const setArtistCursor = (key: string, cursor: ArtistRadarCursor) => {
    const next = {
      ...main.discovery.artistRadar.cursors,
      [key]: cursor,
    };
    const keys = Object.keys(next);
    if (keys.length > MAX_RADAR_CURSORS) {
      const sorted = keys.sort(
        (a, b) => (next[a]?.checkedAt || 0) - (next[b]?.checkedAt || 0),
      );
      for (const drop of sorted.slice(0, keys.length - MAX_RADAR_CURSORS)) {
        delete next[drop];
      }
    }
    main.discovery.artistRadar.cursors = next;
  };

  const getWakeCursor = (id: string): SavedSearchWakeCursor | undefined =>
    main.discovery.savedSearchWake.byId[id];

  const setWakeCursor = (id: string, cursor: SavedSearchWakeCursor) => {
    const next = {
      ...main.discovery.savedSearchWake.byId,
      [id]: cursor,
    };
    const keys = Object.keys(next);
    if (keys.length > MAX_WAKE_CURSORS) {
      const sorted = keys.sort(
        (a, b) =>
          (next[a]?.lastOpenedAt || 0) - (next[b]?.lastOpenedAt || 0),
      );
      for (const drop of sorted.slice(0, keys.length - MAX_WAKE_CURSORS)) {
        delete next[drop];
      }
    }
    main.discovery.savedSearchWake.byId = next;
  };

  /** Newer-post count for sidebar badges (0 when caught up / never checked). */
  const newCountFor = (id: string): number => {
    const n = getWakeCursor(id)?.lastHitCount;
    return typeof n === "number" && n > 0 ? Math.floor(n) : 0;
  };

  /**
   * Persist a wake check. First observation seeds the cursor with no badge;
   * later checks only update lastHitCount / checkedAt (last-seen stays put).
   */
  const recordWakeCheck = (
    id: string,
    result: {
      newer: number;
      newestKey: string | null;
      newestCreatedMs: number | null;
    },
  ) => {
    const prev = getWakeCursor(id);
    const now = Date.now();
    const needsBaseline = !prev?.newestKey && prev?.createdMs == null;
    if (needsBaseline) {
      setWakeCursor(id, {
        lastOpenedAt: prev?.lastOpenedAt ?? 0,
        newestKey: result.newestKey || undefined,
        createdMs: result.newestCreatedMs ?? undefined,
        lastHitCount: 0,
        checkedAt: now,
      });
      return;
    }
    setWakeCursor(id, {
      ...prev!,
      lastHitCount: Math.max(0, result.newer),
      checkedAt: now,
    });
  };

  /**
   * Mark a saved search as opened / seen. Clears the sidebar badge.
   * Pass newestKey/createdMs from a fresh page-1 fetch when available.
   */
  const getFeedSeen = (key: string): FeedSeenCursor | undefined =>
    main.discovery.feedSeen?.byKey[key];

  const writeFeedSeen = (key: string, cursor: FeedSeenCursor) => {
    if (!main.discovery.feedSeen) main.discovery.feedSeen = { byKey: {} };
    main.discovery.feedSeen.byKey = {
      ...main.discovery.feedSeen.byKey,
      [key]: cursor,
    };
  };

  /** First observation of a feed. Does not move an existing watermark. */
  const baselineFeedSeen = (
    key: string,
    createdMs: number,
    newestKey?: string,
  ) => {
    const prev = getFeedSeen(key);
    if (prev?.createdMs != null) return;
    writeFeedSeen(key, {
      ...prev,
      createdMs,
      newestKey: newestKey || prev?.newestKey,
      lastHitCount: prev?.lastHitCount ?? 0,
    });
  };

  /** Raise the watermark. Never moves it backward. Clears +N once the check's newest post is past. */
  const raiseFeedSeen = (key: string, createdMs: number) => {
    const prev = getFeedSeen(key);
    if (!prev || prev.createdMs == null) return;
    if (createdMs <= prev.createdMs) return;
    const caughtUp =
      prev.checkedNewestMs != null && createdMs >= prev.checkedNewestMs;
    writeFeedSeen(key, {
      ...prev,
      createdMs,
      lastHitCount: caughtUp ? 0 : prev.lastHitCount,
    });
  };

  /**
   * Persist a page-1 check. First observation seeds the watermark with no badge.
   * Later checks update lastHitCount and do not move the scroll watermark.
   */
  const recordFeedSeenCheck = (key: string, posts: PostCursorLike[]) => {
    const prev = getFeedSeen(key);
    const now = Date.now();
    if (prev?.createdMs == null) {
      const seeded = countNewerThanCursor(posts, undefined);
      writeFeedSeen(key, {
        createdMs: seeded.newestCreatedMs ?? undefined,
        newestKey: seeded.newestKey || undefined,
        lastHitCount: 0,
        checkedAt: now,
        checkedNewestMs: seeded.newestCreatedMs ?? undefined,
      });
      return;
    }
    const counted = countNewerThanCursor(posts, prev);
    writeFeedSeen(key, {
      ...prev,
      lastHitCount: Math.max(0, counted.newer),
      checkedAt: now,
      checkedNewestMs: counted.newestCreatedMs ?? prev.checkedNewestMs,
    });
  };

  const feedSeenCount = (key: string): number => {
    const n = feedSeenByKey.value[key]?.lastHitCount;
    return typeof n === "number" && n > 0 ? Math.floor(n) : 0;
  };

  const markSavedSearchOpened = (
    id: string,
    extras?: Partial<
      Pick<SavedSearchWakeCursor, "newestKey" | "createdMs" | "checkedAt">
    >,
  ) => {
    const prev = getWakeCursor(id);
    const now = Date.now();
    setWakeCursor(id, {
      lastOpenedAt: now,
      newestKey:
        extras?.newestKey ?? prev?.newestKey ?? SAVED_SEARCH_OPENED_KEY,
      createdMs: extras?.createdMs ?? now,
      lastHitCount: 0,
      checkedAt: extras?.checkedAt ?? prev?.checkedAt,
    });
  };

  return {
    artistCursors,
    wakeById,
    getArtistCursor,
    setArtistCursor,
    getWakeCursor,
    setWakeCursor,
    newCountFor,
    recordWakeCheck,
    markSavedSearchOpened,
    feedSeenByKey,
    getFeedSeen,
    baselineFeedSeen,
    raiseFeedSeen,
    recordFeedSeenCheck,
    feedSeenCount,
  };
});
