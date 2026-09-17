import { describe, expect, it } from "vitest";
import {
  defaultSuggesterWeights,
  pickSeedTags,
  resolveFavoriteTagsQuery,
  suggesterWeightCategories,
} from "./favoriteQuery";
import {
  buildFavoriteTagsResult,
  rankSuggestionPool,
  sliceScoredPool,
} from "./suggestionScoring";
import type { EnhancedPost } from "@/worker/ApiService";
import type { Post } from "@/worker/api";

const emptyTags = () => ({
  general: [] as string[],
  species: [] as string[],
  character: [] as string[],
  copyright: [] as string[],
  artist: [] as string[],
  invalid: [] as string[],
  lore: [] as string[],
  meta: [] as string[],
});

const makePost = (
  id: number,
  tags: Partial<ReturnType<typeof emptyTags>>,
  originMode?: string,
): EnhancedPost =>
  ({
    id,
    tags: { ...emptyTags(), ...tags },
    __meta: {
      isBlacklisted: false,
      pageNumber: 1,
      ...(originMode ? { originMode } : {}),
    },
  }) as EnhancedPost;

describe("resolveFavoriteTagsQuery", () => {
  it("uses fav:user on e621", () => {
    expect(resolveFavoriteTagsQuery({ mode: "e621", username: "tony" })).toEqual({
      tags: ["fav:tony"],
      requiresAuth: false,
    });
  });

  it("maps own-only sites", () => {
    expect(resolveFavoriteTagsQuery({ mode: "furbooru", username: "x" })).toEqual({
      tags: ["my:faves"],
      requiresAuth: true,
    });
    expect(resolveFavoriteTagsQuery({ mode: "inkbunny" })).toEqual({
      tags: ["favs:me"],
      requiresAuth: true,
    });
    expect(resolveFavoriteTagsQuery({ mode: "itaku" })).toEqual({
      tags: ["stars:me"],
      requiresAuth: true,
    });
    expect(resolveFavoriteTagsQuery({ mode: "local" })).toEqual({
      tags: ["type:favorited"],
      requiresAuth: false,
    });
  });

  it("supports other-user FA and SoFurry", () => {
    expect(
      resolveFavoriteTagsQuery({ mode: "furaffinity", username: "fox" }),
    ).toEqual({ tags: ["favs:fox"], requiresAuth: false });
    expect(
      resolveFavoriteTagsQuery({ mode: "sofurry", username: "soft" }),
    ).toEqual({ tags: ["user:soft", "favs:me"], requiresAuth: false });
  });
});

describe("suggesterWeightCategories", () => {
  it("hides lore on sparse modes", () => {
    expect(suggesterWeightCategories("inkbunny")).not.toContain("lore");
    expect(suggesterWeightCategories("e621")).toContain("lore");
  });

  it("zeros disallowed defaults", () => {
    expect(defaultSuggesterWeights("inkbunny").lore).toBe(0);
  });
});

describe("pickSeedTags / rankSuggestionPool", () => {
  it("picks top weighted tags and ranks excluding favorites", () => {
    const favs = [
      makePost(1, { artist: ["alice"], general: ["wolf"] }),
      makePost(2, { artist: ["alice"], general: ["wolf"] }),
      makePost(3, { character: ["bob"] }),
    ] as Post[];
    const profile = buildFavoriteTagsResult(favs);
    const seeds = pickSeedTags(
      profile.counts,
      { artist: 30, general: 5, character: 15 },
      2,
    );
    expect(seeds[0].tag).toBe("alice");

    const candidates = [
      makePost(1, { artist: ["alice"] }), // favorited — exclude
      makePost(10, { artist: ["alice"], general: ["wolf"] }),
      makePost(11, { character: ["bob"] }),
      makePost(12, { general: ["unrelated"] }),
    ];
    const ranked = rankSuggestionPool({
      tags: profile,
      weights: { artist: 30, general: 5, character: 15 },
      candidates,
    });
    expect(ranked.map((p) => p.id)).toEqual([10, 11, 12]);
    expect(ranked[0].__score).toBeGreaterThan(ranked[2].__score);

    const page1 = sliceScoredPool(ranked, 1, 2);
    expect(page1.map((p) => p.id)).toEqual([10, 11]);
    expect(page1[0].__meta.pageNumber).toBe(1);
  });
});
