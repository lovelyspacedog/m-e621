import { describe, expect, it } from "vitest";
import {
  applySfwTagOverride,
  isIdOnlyQuery,
  isRatingTag,
  isSafeRating,
  stripConflictingRatingTags,
} from "./sfwMode";

describe("sfwMode", () => {
  it("isSafeRating only accepts s", () => {
    expect(isSafeRating({ rating: "s" })).toBe(true);
    expect(isSafeRating({ rating: "q" })).toBe(false);
    expect(isSafeRating({ rating: "e" })).toBe(false);
    expect(isSafeRating({})).toBe(false);
  });

  it("isIdOnlyQuery", () => {
    expect(isIdOnlyQuery(["id:1,2,3"])).toBe(true);
    expect(isIdOnlyQuery(["id:1", "id:2"])).toBe(true);
    expect(isIdOnlyQuery(["id:1", "rating:safe"])).toBe(false);
    expect(isIdOnlyQuery(["wolf"])).toBe(false);
    expect(isIdOnlyQuery([])).toBe(false);
  });

  it("isRatingTag covers e621 FA Philomena", () => {
    expect(isRatingTag("rating:safe")).toBe(true);
    expect(isRatingTag("-rating:e")).toBe(true);
    expect(isRatingTag("rating:adult")).toBe(true);
    expect(isRatingTag("explicit")).toBe(true);
    expect(isRatingTag("-suggestive")).toBe(true);
    expect(isRatingTag("wolf")).toBe(false);
    expect(isRatingTag("order:score")).toBe(false);
  });

  it("stripConflictingRatingTags", () => {
    expect(
      stripConflictingRatingTags([
        "wolf",
        "rating:e",
        "-rating:q",
        "explicit",
        "order:score",
      ]),
    ).toEqual(["wolf", "order:score"]);
  });

  it("applySfwTagOverride per mode", () => {
    expect(applySfwTagOverride(["wolf", "rating:e"], "e621")).toEqual([
      "wolf",
      "rating:safe",
    ]);
    expect(applySfwTagOverride(["fox", "explicit"], "furbooru")).toEqual([
      "fox",
      "safe",
      "-suggestive",
      "-questionable",
      "-explicit",
    ]);
    expect(applySfwTagOverride(["dog", "rating:adult"], "furaffinity")).toEqual([
      "dog",
      "rating:general",
    ]);
    expect(applySfwTagOverride(["cat", "rating:e"], "none")).toEqual(["cat"]);
  });
});
