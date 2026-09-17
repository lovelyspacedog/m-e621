import type { PoolBrowseOrigin } from "@/services/types";
import type { Pool } from "@/worker/api";
import type { TailspaceComic } from "@/worker/tailspace/types";
import { comicThumb } from "@/worker/tailspace/api";
import type { PoolBrowseOrder } from "@/misc/util/poolOrigin";

export type TailspacePoolListItem = Pool & {
  originMode: "tailspace";
  /** Tailspace comic slug for `/tailspace/comic/:name`. */
  comicName: string;
};

/** Map Federated Pools sort to Tailspace comics API sort keys. */
export const poolOrderToTailspaceSort = (order: PoolBrowseOrder): string => {
  switch (order) {
    case "created_at":
      return "Newest";
    case "name":
      return "Alphabetical";
    case "post_count":
      return "Rating";
    case "updated_at":
    default:
      return "Updated";
  }
};

export const isTailspacePoolItem = (
  pool: { originMode?: PoolBrowseOrigin; comicName?: string },
): pool is TailspacePoolListItem => pool.originMode === "tailspace";

/** Map a Tailspace comic list row into a Federated Pools browse card shape. */
export const tailspaceComicToPoolListItem = (
  comic: TailspaceComic,
): TailspacePoolListItem => {
  const creator =
    (comic.displayName || "").trim() ||
    (comic.artistName || "").trim() ||
    "Unknown";
  const updated = Number.isFinite(comic.updated)
    ? new Date(comic.updated)
    : new Date(0);
  const created = Number.isFinite(comic.published)
    ? new Date(comic.published)
    : updated;
  const cancelled = comic.state === "cancelled";
  return {
    id: comic.id,
    name: comic.name,
    created_at: created,
    updated_at: updated,
    creator_id: 0,
    description: "",
    is_active: !cancelled,
    category: comic.category || comic.state || "",
    is_deleted: cancelled,
    post_ids: [],
    creator_name: creator,
    post_count: comic.numberOfPages || 0,
    originMode: "tailspace",
    comicName: comic.name,
  };
};

export const tailspaceComicCoverUrl = (comic: TailspaceComic): string =>
  comicThumb(comic.id, comic.thumbnailVersion);

export const tailspaceCoverKey = (id: number) =>
  `tailspace:${id}` as const;

export type { PoolBrowseOrigin };
