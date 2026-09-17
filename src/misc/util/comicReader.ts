/** Shared comic/pool reader primitives. Do not route Tailspace through `/pools`. */

/** Thumbs are cheap — show more per chunk. */
export const GALLERY_CHUNK_SIZE = 24;
/** Full-res scroll images are heavy — smaller chunks. */
export const SCROLL_CHUNK_SIZE = 10;

export type ComicReaderViewMode = "gallery" | "scroll";

/** Ellipsis pager: `1 … cur-1 cur cur+1 … n`. */
export const buildChunkButtons = (
  chunkCount: number,
  currentChunk: number,
): (number | "...")[] => {
  const n = Math.max(1, chunkCount);
  const cur = Math.min(Math.max(1, currentChunk), n);
  const add = (pages: (number | "...")[], p: number) => {
    if (!pages.includes(p)) pages.push(p);
  };
  const pages: (number | "...")[] = [];
  add(pages, 1);
  if (cur > 3) pages.push("...");
  for (let p = Math.max(2, cur - 1); p <= Math.min(n - 1, cur + 1); p++) {
    add(pages, p);
  }
  if (cur < n - 2) pages.push("...");
  if (n > 1) add(pages, n);
  return pages;
};

export const loadComicViewMode = (
  storageKey: string,
  fallback: ComicReaderViewMode = "gallery",
): ComicReaderViewMode => {
  try {
    const v = localStorage.getItem(storageKey);
    if (v === "scroll" || v === "gallery") return v;
  } catch {
    /* ignore */
  }
  return fallback;
};

export const saveComicViewMode = (
  storageKey: string,
  mode: ComicReaderViewMode,
) => {
  try {
    localStorage.setItem(storageKey, mode);
  } catch {
    /* ignore */
  }
};

export const loadComicFullWidthScroll = (storageKey: string): boolean => {
  try {
    return localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
};

export const saveComicFullWidthScroll = (storageKey: string, on: boolean) => {
  try {
    localStorage.setItem(storageKey, on ? "1" : "0");
  } catch {
    /* ignore */
  }
};

/** 1-based chunk that contains a 0-based index into `post_ids`. */
export const chunkForIndex = (index: number, chunkSize: number): number => {
  const size = Math.max(1, chunkSize);
  return Math.floor(Math.max(0, index) / size) + 1;
};

export const parsePositiveIntQuery = (raw: unknown): number => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export const poolResumeStorageKey = (originMode: string, poolId: number) =>
  `pools-resume:${originMode}:${poolId}`;

export const loadPoolResumePost = (
  originMode: string,
  poolId: number,
): number => {
  try {
    const raw = localStorage.getItem(poolResumeStorageKey(originMode, poolId));
    return parsePositiveIntQuery(raw);
  } catch {
    return 0;
  }
};

export const savePoolResumePost = (
  originMode: string,
  poolId: number,
  postId: number,
) => {
  if (!poolId || !postId) return;
  try {
    localStorage.setItem(
      poolResumeStorageKey(originMode, poolId),
      String(postId),
    );
  } catch {
    /* ignore */
  }
};
