import { describe, expect, it } from "vitest";
import type { Post } from "@/worker/api";
import type { FavoriteTagsResult } from "@/misc/util/suggestionScoring";
import {
  artistRadarCursorKey,
  countNewerThanCursor,
  diffFavoriteTagCounts,
  previewBlacklistHitCount,
  rankFavoriteArtists,
  rankHistoryTags,
  suggestBlacklistTags,
} from "./discoveryTools";

const emptyTags = {
  general: [] as string[],
  artist: [] as string[],
  copyright: [] as string[],
  character: [] as string[],
  species: [] as string[],
  invalid: [] as string[],
  meta: [] as string[],
  lore: [] as string[],
};

const post = (
  id: number,
  tags: Partial<Post["tags"]>,
  created_at = "2026-01-01T00:00:00Z",
): Post =>
  ({
    id,
    created_at,
    tags: { ...emptyTags, ...tags },
    score: { up: 0, down: 0, total: 0 },
    fav_count: 0,
    file: { width: 1, height: 1, ext: "jpg", size: 1, md5: "", url: "" },
    preview: { width: 1, height: 1, url: "" },
    sample: { has: false, height: 1, width: 1, url: "" },
    rating: "s",
    flags: {
      pending: false,
      flagged: false,
      deleted: false,
    },
  }) as Post;

describe("rankFavoriteArtists", () => {
  it("prefers artist category", () => {
    const counts = {
      artist: { alice: 5, bob: 2 },
      general: { noise: 99 },
    };
    expect(rankFavoriteArtists(counts, 10).map((t) => t.name)).toEqual([
      "alice",
      "bob",
    ]);
  });
});

describe("diffFavoriteTagCounts", () => {
  it("splits shared / left / right", () => {
    const left: FavoriteTagsResult = {
      counts: { general: { fox: 10, wolf: 3 } },
      favoriteKeys: [],
    };
    const right: FavoriteTagsResult = {
      counts: { general: { fox: 4, dragon: 8 } },
      favoriteKeys: [],
    };
    const diff = diffFavoriteTagCounts(left, right);
    expect(diff.shared.map((r) => r.tag)).toEqual(["fox"]);
    expect(diff.leftOnly.map((r) => r.tag)).toEqual(["wolf"]);
    expect(diff.rightOnly.map((r) => r.tag)).toEqual(["dragon"]);
  });
});

describe("rankHistoryTags", () => {
  it("counts unique tags per history entry", () => {
    const ranked = rankHistoryTags([
      ["fox", "male"],
      ["fox", "fox"],
      ["dragon"],
    ]);
    expect(ranked[0]).toMatchObject({ name: "fox", count: 2 });
    expect(ranked.find((t) => t.name === "dragon")?.count).toBe(1);
  });
});

describe("suggestBlacklistTags", () => {
  it("suggests tags common on blacklisted posts", () => {
    const posts = [
      post(1, { general: ["gore", "blood"] }),
      post(2, { general: ["gore", "violence"] }),
      post(3, { general: ["cute"] }),
    ];
    const blacklist = [["gore"]];
    const suggestions = suggestBlacklistTags(posts, blacklist, 10);
    // gore already a single-tag line — suggest blood/violence from blacklisted set
    expect(suggestions.every((s) => s.tag !== "gore")).toBe(true);
    expect(suggestions.some((s) => s.tag === "blood")).toBe(true);
  });
});

describe("previewBlacklistHitCount", () => {
  it("counts hits with an extra line", () => {
    const posts = [post(1, { general: ["a"] }), post(2, { general: ["b"] })];
    expect(previewBlacklistHitCount(posts, [], ["a"])).toEqual({
      hits: 1,
      total: 2,
    });
  });
});

describe("countNewerThanCursor", () => {
  it("counts all when no cursor", () => {
    const posts = [post(3, {}), post(2, {}), post(1, {})];
    const r = countNewerThanCursor(posts, null);
    expect(r.newer).toBe(3);
    expect(r.newestKey).toContain("3");
  });

  it("stops at matching newestKey", () => {
    const withKeys = [
      post(5, {}, "2026-02-01T00:00:00Z"),
      post(4, {}, "2026-01-15T00:00:00Z"),
      post(3, {}, "2026-01-01T00:00:00Z"),
    ].map((p) => ({ ...p, __meta: { originMode: "e621" } }));
    const r2 = countNewerThanCursor(withKeys, {
      newestKey: "e621:3",
      createdMs: Date.parse("2026-01-01T00:00:00Z"),
    });
    expect(r2.newer).toBe(2);
  });
});

describe("artistRadarCursorKey", () => {
  it("namespaces mode and optional origin", () => {
    expect(artistRadarCursorKey("e621", "Alice")).toBe("e621:alice");
    expect(artistRadarCursorKey("unified", "Alice", "furbooru")).toBe(
      "unified:furbooru:alice",
    );
  });
});
