import { describe, expect, it } from "vitest";
import { normalizeSavedSearches } from "./savedSearchNormalize";

describe("normalizeSavedSearches news snapshot", () => {
  it("round-trips source feed and view on a News filter", () => {
    const { entries } = normalizeSavedSearches({
      entries: [
        {
          id: "search-1",
          name: "Dogpatch unread",
          tags: [],
          groupId: "ungrouped",
          order: 0,
          news: { source: "dogpatch", feed: "opinion", view: "unread" },
        },
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].news).toEqual({
      source: "dogpatch",
      feed: "opinion",
      view: "unread",
    });
  });

  it("drops empty news blobs and keeps source-only snapshots", () => {
    const { entries } = normalizeSavedSearches({
      entries: [
        {
          name: "InFurNation",
          tags: ["con"],
          news: { source: "infurnation" },
        },
        {
          name: "Broken",
          tags: [],
          news: { source: 12 as unknown as string },
        },
      ],
    });
    expect(entries[0].news).toEqual({ source: "infurnation" });
    expect(entries[1].news).toBeUndefined();
  });
});
