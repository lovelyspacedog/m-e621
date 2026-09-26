import type { U18chanImage, U18chanPost } from "@/worker/u18chan/types";

/** One page in a leading u18chan image dump (gallery / scroll). */
export interface U18chanDumpPage {
  /** Stable key: post id + image index within that post. */
  key: string;
  postId: number;
  pageNumber: number;
  image: U18chanImage;
  name: string;
}

/**
 * Leading image dump for Gallery / Scroll.
 *
 * u18chan uploads one file per post, so comic "dumps" are almost always a run
 * of consecutive posts by the OP's display name (often Furrynomous), each with
 * one image — not a multi-image OP post. Text-only posts by the same name are
 * skipped; the run stops at the first post by a different name.
 */
export const extractU18chanImageDump = (
  posts: U18chanPost[] | null | undefined,
): U18chanDumpPage[] => {
  if (!posts?.length) return [];
  const opName = posts[0].name;
  const pages: U18chanDumpPage[] = [];
  for (const post of posts) {
    if (post.name !== opName) break;
    for (let i = 0; i < post.images.length; i++) {
      pages.push({
        key: `${post.id}:${i}`,
        postId: post.id,
        pageNumber: pages.length + 1,
        image: post.images[i],
        name: post.name,
      });
    }
  }
  return pages;
};

export type U18chanThreadViewMode = "thread" | "gallery" | "scroll";

export const isU18chanThreadViewMode = (
  value: unknown,
): value is U18chanThreadViewMode =>
  value === "thread" || value === "gallery" || value === "scroll";

/** Comics live boards where a leading dump is the usual first read. */
export const isU18chanComicsLiveBoard = (liveBoard: string): boolean => {
  const b = liveBoard.toLowerCase();
  return b === "c" || b === "gc";
};

export const defaultU18chanThreadViewMode = (
  liveBoard: string,
  dumpPageCount: number,
): U18chanThreadViewMode => {
  if (isU18chanComicsLiveBoard(liveBoard) && dumpPageCount > 1) return "gallery";
  return "thread";
};
