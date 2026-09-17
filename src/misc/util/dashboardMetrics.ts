import { round } from "@/misc/util/round";
import type { ITag } from "@/Tag/ITag";

export const DASHBOARD_POST_LIMIT = 3200;
export const DASHBOARD_RECENT_ARTISTS_MAX = 10;
export const DASHBOARD_TAG_CANDIDATE_LIMIT = 50;
export const DASHBOARD_DEFAULT_OUTLIER_RATIO = 0.02;

export interface IMetric {
  display: string;
  value: number;
}

export interface ITagCount {
  count: number;
  favorites: number;
  up: number;
  down: number;
}

export type DashboardTag = ITag & {
  counts: ITagCount;
  metricValue: number;
  metricLabel: string;
};

export type TagSortKind = "count" | "fav" | "up" | "down";

/** Weekly upload rate from heatmap-window uploads only (last ~year days). */
export function weeklyUploadRate(
  uploadsInWindow: number,
  windowDays: number,
): number {
  const weeks = windowDays / 7;
  if (weeks <= 0) return 0;
  return round(uploadsInWindow / weeks);
}

export function isDashboardTruncated(sampledPostCount: number): boolean {
  return sampledPostCount >= DASHBOARD_POST_LIMIT;
}

export function metricForTag(kind: TagSortKind, counts: ITagCount): {
  value: number;
  label: string;
} {
  if (kind === "count") {
    return { value: counts.count, label: "posts" };
  }
  if (kind === "fav") {
    const value = counts.count ? round(counts.favorites / counts.count) : 0;
    return { value, label: "favs/post" };
  }
  const total = counts.up + counts.down;
  if (kind === "up") {
    const value = total ? round(counts.up / total) : 0;
    return { value, label: "up rate" };
  }
  const value = total ? round(counts.down / total) : 0;
  return { value, label: "down rate" };
}

export function sortDashboardTags(
  tags: DashboardTag[],
  kind: TagSortKind,
): DashboardTag[] {
  const scored = tags.map((t) => {
    const { value, label } = metricForTag(kind, t.counts);
    return { ...t, metricValue: value, metricLabel: label };
  });
  if (kind === "count") {
    return scored.sort((a, b) => b.counts.count - a.counts.count);
  }
  if (kind === "fav") {
    return scored.sort((a, b) => {
      const aa = a.counts.count
        ? a.counts.favorites / a.counts.count
        : 0;
      const bb = b.counts.count
        ? b.counts.favorites / b.counts.count
        : 0;
      return bb - aa;
    });
  }
  if (kind === "up") {
    return scored.sort((a, b) => {
      const aTot = a.counts.up + a.counts.down;
      const bTot = b.counts.up + b.counts.down;
      return (
        (bTot ? b.counts.up / bTot : 0) - (aTot ? a.counts.up / aTot : 0)
      );
    });
  }
  return scored.sort((a, b) => {
    const aTot = a.counts.up + a.counts.down;
    const bTot = b.counts.up + b.counts.down;
    return (
      (bTot ? b.counts.down / bTot : 0) - (aTot ? a.counts.down / aTot : 0)
    );
  });
}

/** Drop rare tags for rate rankings; always keep count ranking unfiltered. */
export function applyOutlierFilter(
  tags: DashboardTag[],
  kind: TagSortKind,
  postCount: number,
  outlierRatio: number,
): DashboardTag[] {
  if (kind === "count") return tags;
  const min = Math.max(1, postCount * outlierRatio);
  return tags.filter((t) => t.counts.count > min);
}

export function sliceTopTags(
  tags: DashboardTag[],
  kind: TagSortKind,
  postCount: number,
  outlierRatio: number,
  limit = 10,
): DashboardTag[] {
  return applyOutlierFilter(
    sortDashboardTags(tags, kind),
    kind,
    postCount,
    outlierRatio,
  ).slice(0, limit);
}

/** MRU list: move name to front, unique, capped. */
export function recordRecentArtist(
  existing: string[],
  name: string,
  max = DASHBOARD_RECENT_ARTISTS_MAX,
): string[] {
  const trimmed = name.trim();
  if (!trimmed || max <= 0) return existing.slice(0, max);
  const next = [trimmed, ...existing.filter((n) => n !== trimmed)];
  return next.slice(0, max);
}

export function pickTopPostsByFavorites<
  T extends { fav_count: number; score: { total: number } },
>(posts: T[], limit = 12): T[] {
  return [...posts]
    .sort((a, b) => {
      if (b.fav_count !== a.fav_count) return b.fav_count - a.fav_count;
      return b.score.total - a.score.total;
    })
    .slice(0, limit);
}

export function buildUploadMetrics(args: {
  sampledPostCount: number;
  rating: { s: number; q: number; e: number };
  pending: number;
  uploadRateWeekly: number;
}): IMetric[] {
  return [
    { display: "Artwork Uploaded", value: args.sampledPostCount },
    { display: "Pending Posts", value: args.pending },
    { display: "Average Uploads per Week", value: args.uploadRateWeekly },
  ];
}

export function buildCommunityMetrics(args: {
  upvotes: number;
  downvotes: number;
  favorites: number;
  comments: number;
}): IMetric[] {
  return [
    { display: "Upvotes Received", value: args.upvotes },
    { display: "Downvotes Received", value: args.downvotes },
    { display: "Favorites Received", value: args.favorites },
    { display: "Comments Received", value: args.comments },
  ];
}

export function buildCommunityPerPostMetrics(args: {
  upvotes: number;
  downvotes: number;
  favorites: number;
  comments: number;
  postCount: number;
}): IMetric[] {
  const n = args.postCount || 1;
  return [
    {
      display: "Average Upvotes per Post",
      value: round(args.upvotes / n),
    },
    {
      display: "Average Downvotes per Post",
      value: round(args.downvotes / n),
    },
    {
      display: "Average Favorites per Post",
      value: round(args.favorites / n),
    },
    {
      display: "Average Comments per Post",
      value: round(args.comments / n),
    },
    {
      display: "Upvote to Downvote Ratio",
      value: args.downvotes ? round(args.upvotes / args.downvotes) : 0,
    },
  ];
}
