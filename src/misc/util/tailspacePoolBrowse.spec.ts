import { describe, expect, it } from "vitest";
import {
  poolOrderToTailspaceSort,
  tailspaceComicToPoolListItem,
  tailspaceCoverKey,
  isTailspacePoolItem,
} from "./tailspacePoolBrowse";
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
