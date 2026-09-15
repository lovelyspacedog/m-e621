import { postFeedKey } from "@/misc/util/postOrigin";
import type { UnifiedChildMode } from "@/services/types";

export type MergeablePost = {
  id: number;
  created_at?: string | number;
  __meta?: {
    originMode?: string;
    pageNumber?: number;
    [key: string]: unknown;
  };
};

export type UnifiedChildBuffer<T extends MergeablePost = MergeablePost> = {
  mode: UnifiedChildMode;
  nextPage: number;
  buffer: T[];
  exhausted: boolean;
};

export type UnifiedMergeState<T extends MergeablePost = MergeablePost> = {
  key: string;
  lastEmittedPage: number;
  children: UnifiedChildBuffer<T>[];
};

export const postCreatedAtMs = (post: MergeablePost): number => {
  const raw = post.created_at;
  if (!raw) return 0;
  const ms = Date.parse(typeof raw === "string" ? raw : String(raw));
  return Number.isFinite(ms) ? ms : 0;
};

/** Newest-first by created_at, then id. */
export const sortByCreatedAtDesc = <T extends MergeablePost>(posts: T[]): T[] =>
  [...posts].sort(
    (a, b) => postCreatedAtMs(b) - postCreatedAtMs(a) || b.id - a.id,
  );

/**
 * Take up to `limit` posts from child buffers (chronological merge).
 * Leftovers stay in their buffers for the next Unified page.
 */
export const takeMergedFromBuffers = <T extends MergeablePost>(
  buffers: T[][],
  limit: number,
): { taken: T[]; remaining: T[][] } => {
  const taken = sortByCreatedAtDesc(buffers.flat()).slice(0, limit);
  const keys = new Set(taken.map((p) => postFeedKey(p)));
  const remaining = buffers.map((buf) =>
    buf.filter((p) => !keys.has(postFeedKey(p))),
  );
  return { taken, remaining };
};

export const bufferedCount = <T extends MergeablePost>(
  state: UnifiedMergeState<T>,
): number => state.children.reduce((n, c) => n + c.buffer.length, 0);

export const initUnifiedMergeState = <T extends MergeablePost>(
  key: string,
  modes: UnifiedChildMode[],
): UnifiedMergeState<T> => ({
  key,
  lastEmittedPage: 0,
  children: modes.map((mode) => ({
    mode,
    nextPage: 1,
    buffer: [],
    exhausted: false,
  })),
});

/** Seed cursors after a non-sequential (legacy) page so forward scroll can resume. */
export const seedUnifiedMergeAfterLegacy = <T extends MergeablePost>(
  key: string,
  modes: UnifiedChildMode[],
  emittedPage: number,
): UnifiedMergeState<T> => ({
  key,
  lastEmittedPage: emittedPage,
  children: modes.map((mode) => ({
    mode,
    nextPage: emittedPage + 1,
    buffer: [],
    exhausted: false,
  })),
});
