import { describe, expect, it } from "vitest";
import {
  applyOutlierFilter,
  buildCommunityPerPostMetrics,
  DASHBOARD_POST_LIMIT,
  isDashboardTruncated,
  metricForTag,
  pickTopPostsByFavorites,
  recordRecentArtist,
  sliceTopTags,
  weeklyUploadRate,
  type DashboardTag,
  type ITagCount,
} from "./dashboardMetrics";

const counts = (partial: Partial<ITagCount> & { count: number }): ITagCount => ({
  favorites: 0,
  up: 0,
  down: 0,
  ...partial,
});

const tag = (
  name: string,
  c: ITagCount,
  category = "general",
): DashboardTag => ({
  name,
  category,
  post_count: c.count,
  counts: c,
  metricValue: 0,
  metricLabel: "",
});

describe("weeklyUploadRate", () => {
  it("divides window uploads by weeks", () => {
    expect(weeklyUploadRate(52, 364)).toBe(1);
  });

  it("returns 0 for empty window", () => {
    expect(weeklyUploadRate(10, 0)).toBe(0);
  });
});

describe("isDashboardTruncated", () => {
  it("flags the post limit", () => {
    expect(isDashboardTruncated(DASHBOARD_POST_LIMIT)).toBe(true);
    expect(isDashboardTruncated(DASHBOARD_POST_LIMIT - 1)).toBe(false);
  });
});

describe("recordRecentArtist", () => {
  it("moves existing name to front and caps", () => {
    expect(recordRecentArtist(["a", "b", "c"], "b", 3)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(recordRecentArtist(["a", "b"], "z", 2)).toEqual(["z", "a"]);
  });

  it("ignores blank names", () => {
    expect(recordRecentArtist(["a"], "  ", 10)).toEqual(["a"]);
  });
});

describe("tag ranking", () => {
  const tags = [
    tag("common", counts({ count: 100, favorites: 200, up: 90, down: 10 })),
    tag("rare_hot", counts({ count: 2, favorites: 200, up: 20, down: 0 })),
    tag("mid", counts({ count: 20, favorites: 40, up: 10, down: 10 })),
  ];

  it("computes favs per post", () => {
    expect(metricForTag("fav", counts({ count: 2, favorites: 200 })).value).toBe(
      100,
    );
  });

  it("drops rare tags for rate sorts", () => {
    const filtered = applyOutlierFilter(tags, "fav", 100, 0.02);
    expect(filtered.map((t) => t.name)).toEqual(["common", "mid"]);
  });

  it("keeps count ranking unfiltered", () => {
    const top = sliceTopTags(tags, "count", 100, 0.02, 2);
    expect(top.map((t) => t.name)).toEqual(["common", "mid"]);
  });
});

describe("pickTopPostsByFavorites", () => {
  it("sorts by favs then score", () => {
    const posts = [
      { id: 1, fav_count: 10, score: { total: 5 } },
      { id: 2, fav_count: 20, score: { total: 1 } },
      { id: 3, fav_count: 20, score: { total: 9 } },
    ];
    expect(pickTopPostsByFavorites(posts, 2).map((p) => p.id)).toEqual([
      3, 2,
    ]);
  });
});

describe("buildCommunityPerPostMetrics", () => {
  it("averages against post count", () => {
    const metrics = buildCommunityPerPostMetrics({
      upvotes: 100,
      downvotes: 10,
      favorites: 50,
      comments: 20,
      postCount: 10,
    });
    expect(metrics.find((m) => m.display.includes("Upvotes"))?.value).toBe(10);
    expect(metrics.find((m) => m.display.includes("Ratio"))?.value).toBe(10);
  });
});
