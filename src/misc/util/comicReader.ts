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
