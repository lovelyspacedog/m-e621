import { describe, expect, it } from "vitest";
import {
  applySfwTagOverride,
  isIdOnlyQuery,
  isRatingTag,
  isSafeRating,
  isSfwSafeRatingTag,
  removeSfwTagOverride,
  stripConflictingRatingTags,
  tagsIncludeSfwSafeRating,
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

  it("isSfwSafeRatingTag / tagsIncludeSfwSafeRating", () => {
    expect(isSfwSafeRatingTag("rating:safe")).toBe(true);
    expect(isSfwSafeRatingTag("rating:s")).toBe(true);
    expect(isSfwSafeRatingTag("Rating:Safe")).toBe(true);
    // Exclude-safe must not trip SFW or get rewritten to rating:safe
    expect(isSfwSafeRatingTag("-rating:safe")).toBe(false);
    expect(isSfwSafeRatingTag("-rating:s")).toBe(false);
    expect(isSfwSafeRatingTag("rating:explicit")).toBe(false);
    expect(isSfwSafeRatingTag("safe")).toBe(false);
    expect(tagsIncludeSfwSafeRating(["fox", "rating:s"])).toBe(true);
    expect(tagsIncludeSfwSafeRating(["fox", "-rating:safe"])).toBe(false);
    expect(tagsIncludeSfwSafeRating(["fox"])).toBe(false);
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

  it("removeSfwTagOverride drops injected markers", () => {
    expect(
      removeSfwTagOverride(["wolf", "rating:safe", "order:score"], "e621"),
    ).toEqual(["wolf", "order:score"]);
    expect(removeSfwTagOverride(["fox", "Rating:S"], "e621")).toEqual(["fox"]);
    expect(
      removeSfwTagOverride(
        ["fox", "safe", "-suggestive", "-questionable", "-explicit"],
        "furbooru",
      ),
    ).toEqual(["fox"]);
    expect(
      removeSfwTagOverride(["dog", "rating:general"], "furaffinity"),
    ).toEqual(["dog"]);
    expect(removeSfwTagOverride(["cat", "rating:safe"], "none")).toEqual([
      "cat",
      "rating:safe",
    ]);
  });
});
