import { describe, expect, it } from "vitest";
import { flattenPostTagsForSidecar } from "./localMedia";

describe("flattenPostTagsForSidecar", () => {
  it("flattens and lowercases category buckets", () => {
    expect(
      flattenPostTagsForSidecar({
        tags: {
          artist: ["Artist_Name"],
          general: ["solo", "male"],
          character: [],
          copyright: ["some_series"],
          species: ["canine"],
          invalid: [],
          lore: [],
          meta: ["hi_res"],
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        "artist_name",
        "solo",
        "male",
        "some_series",
        "canine",
        "hi_res",
      ]),
    );
  });

  it("returns empty for missing tags", () => {
    expect(flattenPostTagsForSidecar(null)).toEqual([]);
    expect(flattenPostTagsForSidecar({})).toEqual([]);
  });
});
