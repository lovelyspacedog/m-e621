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

const MAX_RADAR_CURSORS = 400;
const MAX_WAKE_CURSORS = 200;

/** Placeholder newestKey when opened without a fetched top post. */
export const SAVED_SEARCH_OPENED_KEY = "__opened__";

export const useDiscoveryStore = defineStore("discovery", () => {
  const main = useMainStore();

  const artistCursors = computed(() => main.discovery.artistRadar.cursors);
  const wakeById = computed(() => main.discovery.savedSearchWake.byId);

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
  };
});
