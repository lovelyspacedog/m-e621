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
};

const MAX_RADAR_CURSORS = 400;
const MAX_WAKE_CURSORS = 200;

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

  const markSavedSearchOpened = (
    id: string,
    extras?: Partial<SavedSearchWakeCursor>,
  ) => {
    const prev = getWakeCursor(id);
    setWakeCursor(id, {
      lastOpenedAt: Date.now(),
      newestKey: extras?.newestKey ?? prev?.newestKey,
      createdMs: extras?.createdMs ?? prev?.createdMs,
      lastHitCount: extras?.lastHitCount ?? prev?.lastHitCount,
    });
  };

  return {
    artistCursors,
    wakeById,
    getArtistCursor,
    setArtistCursor,
    getWakeCursor,
    setWakeCursor,
    markSavedSearchOpened,
  };
});
