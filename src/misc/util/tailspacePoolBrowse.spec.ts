import { describe, expect, it } from "vitest";
import {
  coerceTailspaceTimestamp,
  poolOrderToTailspaceSort,
  tailspaceComicToPoolListItem,
  tailspaceCoverKey,
  isTailspacePoolItem,
} from "./tailspacePoolBrowse";
import { sortPoolsByOrder } from "./poolOrigin";
import type { TailspaceComic } from "@/worker/tailspace/types";

const sampleComic = (overrides: Partial<TailspaceComic> = {}): TailspaceComic => ({
  id: 42,
  name: "Example_Comic",
  category: "Male",
  artistName: "artist_slug",
  displayName: "Artist Name",
  thumbnailVersion: 3,
  numberOfPages: 12,
  state: "finished",
  sumStars: 10,
  numTimesStarred: 2,
  avgStars: 4,
  avgStarsPercent: 80,
  commentCount: 1,
  updated: 1_700_000_000_000,
  published: 1_600_000_000_000,
  tags: [],
  isArtistVerified: true,
  additionalArtistNames: null,
  ...overrides,
});

describe("poolOrderToTailspaceSort", () => {
  it("maps Federated pool orders to Tailspace sort labels", () => {
    expect(poolOrderToTailspaceSort("updated_at")).toBe("Updated");
    expect(poolOrderToTailspaceSort("created_at")).toBe("Newest");
    expect(poolOrderToTailspaceSort("name")).toBe("Alphabetical");
    expect(poolOrderToTailspaceSort("post_count")).toBe("Rating");
  });
});

describe("coerceTailspaceTimestamp", () => {
  it("parses ISO strings from the live Tailspace API", () => {
    const d = coerceTailspaceTimestamp("2026-09-17T17:00:51.000Z");
    expect(d.toISOString()).toBe("2026-09-17T17:00:51.000Z");
  });

  it("accepts unix ms and seconds", () => {
    expect(coerceTailspaceTimestamp(1_700_000_000_000).getTime()).toBe(
      1_700_000_000_000,
    );
    expect(coerceTailspaceTimestamp(1_700_000_000).getTime()).toBe(
      1_700_000_000_000,
    );
  });

  it("does not collapse ISO strings to epoch via Number.isFinite", () => {
    expect(
      coerceTailspaceTimestamp("2026-09-17T17:00:51.000Z").getTime(),
    ).not.toBe(0);
  });
});

describe("tailspaceComicToPoolListItem", () => {
  it("maps comic fields into a Tailspace pool browse row", () => {
    const item = tailspaceComicToPoolListItem(sampleComic());
    expect(item.originMode).toBe("tailspace");
    expect(item.comicName).toBe("Example_Comic");
    expect(item.id).toBe(42);
    expect(item.post_count).toBe(12);
    expect(item.creator_name).toBe("Artist Name");
    expect(item.is_active).toBe(true);
    expect(item.post_ids).toEqual([]);
    expect(item.updated_at.getTime()).toBe(1_700_000_000_000);
    expect(item.created_at.getTime()).toBe(1_600_000_000_000);
    expect(isTailspacePoolItem(item)).toBe(true);
  });

  it("parses ISO updated/published so Federated Updated sort can interleave", () => {
    const item = tailspaceComicToPoolListItem(
      sampleComic({
        updated: "2026-09-17T17:00:51.000Z",
        published: "2026-09-14T16:37:06.000Z",
      }),
    );
    expect(item.updated_at.toISOString()).toBe("2026-09-17T17:00:51.000Z");
    expect(item.created_at.toISOString()).toBe("2026-09-14T16:37:06.000Z");

    const sorted = sortPoolsByOrder(
      [
        {
          id: 1,
          name: "old_e621",
          post_count: 5,
          updated_at: "2026-09-01T00:00:00.000Z",
          created_at: "2026-01-01T00:00:00.000Z",
          originMode: "e621" as const,
        },
        item,
        {
          id: 2,
          name: "mid_e6ai",
          post_count: 5,
          updated_at: "2026-09-16T00:00:00.000Z",
          created_at: "2026-01-01T00:00:00.000Z",
          originMode: "e6ai" as const,
        },
      ],
      "updated_at",
    );
    expect(sorted.map((p) => p.id)).toEqual([42, 2, 1]);
  });

  it("marks cancelled comics inactive and prefers artist slug when display missing", () => {
    const item = tailspaceComicToPoolListItem(
      sampleComic({ state: "cancelled", displayName: null }),
    );
    expect(item.is_active).toBe(false);
    expect(item.is_deleted).toBe(true);
    expect(item.creator_name).toBe("artist_slug");
  });
});

describe("tailspaceCoverKey", () => {
  it("keys covers by origin and comic id", () => {
    expect(tailspaceCoverKey(7)).toBe("tailspace:7");
  });
});
