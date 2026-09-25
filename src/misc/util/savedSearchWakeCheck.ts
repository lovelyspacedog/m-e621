import {
  countNewerThanCursor,
  type PostCursorLike,
} from "@/misc/util/discoveryTools";
import type { SavedSearchWakeCursor } from "@/services/DiscoveryStore";
import type { SiteMode } from "@/services/types";

export type SavedSearchWakeCheckResult = {
  newer: number;
  newestKey: string | null;
  newestCreatedMs: number | null;
};

export type SavedSearchWakeCheckArgs = {
  mode: SiteMode;
  cursor: SavedSearchWakeCursor | undefined;
  /** Remote gallery modes. */
  fetchRemote?: () => Promise<{ posts: PostCursorLike[] }>;
  /** Local mode page fetch. */
  fetchLocal?: () => Promise<{ posts: PostCursorLike[] }>;
};

/**
 * Fetch page 1 for a saved search and count posts newer than the wake cursor.
 */
export const checkSavedSearchWake = async (
  args: SavedSearchWakeCheckArgs,
): Promise<SavedSearchWakeCheckResult> => {
  const posts =
    args.mode === "local"
      ? ((await args.fetchLocal?.())?.posts ?? [])
      : ((await args.fetchRemote?.())?.posts ?? []);
  return countNewerThanCursor(posts, args.cursor);
};

/** Stale if never checked or older than this. */
export const WAKE_CHECK_STALE_MS = 15 * 60 * 1000;

/** Cap background sidebar sweeps so we do not hammer adapters. */
export const WAKE_SIDEBAR_CHECK_LIMIT = 12;

export const wakeCursorIsStale = (
  cursor: SavedSearchWakeCursor | undefined,
  now = Date.now(),
): boolean => {
  if (!cursor?.checkedAt) return true;
  return now - cursor.checkedAt >= WAKE_CHECK_STALE_MS;
};
