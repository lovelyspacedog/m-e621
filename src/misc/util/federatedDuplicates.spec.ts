import { describe, expect, it } from "vitest";
import {
  collapseFederatedDuplicates,
  duplicateMatchKeys,
  filterPostsAgainstDupKeys,
  parseSourcePostRef,
} from "./federatedDuplicates";
import type { DupCollapsePost } from "./federatedDuplicates";

const post = (
  originMode: string,
  id: number,
  extras: Partial<DupCollapsePost> = {},
): DupCollapsePost => ({
  id,
  score: extras.score ?? { total: id },
  fav_count: extras.fav_count ?? 0,
  file: {
    md5: extras.file?.md5,
    size: extras.file?.size ?? 1000,
    width: extras.file?.width ?? 100,
    height: extras.file?.height ?? 100,
  },
  sources: extras.sources || [],
  tags: extras.tags || { artist: ["wolfy"] },
  __meta: { originMode, ...(extras.__meta || {}) },
});

describe("parseSourcePostRef", () => {
  it("parses e621 and FA urls", () => {
    expect(parseSourcePostRef("https://e621.net/posts/42")).toEqual({
      mode: "e621",
      id: 42,
    });
    expect(parseSourcePostRef("https://www.furaffinity.net/view/99/")).toEqual({
      mode: "furaffinity",
      id: 99,
    });
  });
});

describe("collapseFederatedDuplicates", () => {
  it("collapses by md5 keeping higher score", () => {
    const a = post("e621", 1, {
      score: { total: 10 },
      file: { md5: "abc1234567890def", size: 1, width: 1, height: 1 },
    });
    const b = post("furbooru", 2, {
      score: { total: 50 },
      file: { md5: "abc1234567890def", size: 1, width: 1, height: 1 },
    });
    const { posts, newKeys } = collapseFederatedDuplicates([a, b]);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.__meta?.originMode).toBe("furbooru");
    expect(posts[0]!.__meta?.duplicateOrigins).toEqual([
      { originMode: "e621", id: 1, score: 10 },
    ]);
    expect(newKeys.some((k) => k.startsWith("md5:"))).toBe(true);
  });

  it("collapses when source points at the other post", () => {
    const e621 = post("e621", 100, { score: { total: 5 } });
    const fa = post("furaffinity", 7, {
      score: { total: 1 },
      sources: ["https://e621.net/posts/100"],
    });
    const { posts } = collapseFederatedDuplicates([fa, e621]);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.id).toBe(100);
    expect(posts[0]!.__meta?.duplicateOrigins?.[0]?.originMode).toBe(
      "furaffinity",
    );
  });

  it("does not collapse unrelated posts", () => {
    const a = post("e621", 1, {
      file: { md5: "aaaaaaaaaaaaaaaa", size: 10, width: 10, height: 10 },
      tags: { artist: ["a"] },
    });
    const b = post("e621", 2, {
      file: { md5: "bbbbbbbbbbbbbbbb", size: 20, width: 20, height: 20 },
      tags: { artist: ["b"] },
    });
    expect(collapseFederatedDuplicates([a, b]).posts).toHaveLength(2);
  });

  it("filters later pages against seen keys", () => {
    const a = post("e621", 1, {
      file: { md5: "cccccccccccccccc", size: 1, width: 1, height: 1 },
    });
    const { newKeys } = collapseFederatedDuplicates([a]);
    const seen = new Set(newKeys);
    const b = post("furbooru", 9, {
      file: { md5: "cccccccccccccccc", size: 1, width: 1, height: 1 },
    });
    expect(filterPostsAgainstDupKeys([b], seen)).toEqual([]);
  });
});

describe("duplicateMatchKeys", () => {
  it("includes ref for own origin", () => {
    const keys = duplicateMatchKeys(post("e621", 3)).map((k) => k.key);
    expect(keys).toContain("ref:e621:3");
  });
});
