import { describe, expect, it } from "vitest";
import {
  bufferedCount,
  initUnifiedMergeState,
  takeMergedFromBuffers,
} from "./unifiedMerge";
import type { MergeablePost } from "./unifiedMerge";

const post = (
  originMode: string,
  id: number,
  created_at: string,
): MergeablePost => ({
  id,
  created_at,
  __meta: { originMode },
});

describe("takeMergedFromBuffers", () => {
  it("keeps sparse-child leftovers for the next page", () => {
    const dense = [
      post("e621", 10, "2026-01-10T00:00:00Z"),
      post("e621", 9, "2026-01-09T00:00:00Z"),
      post("e621", 8, "2026-01-08T00:00:00Z"),
    ];
    const sparse = [
      post("furbooru", 1, "2026-01-07T00:00:00Z"),
      post("furbooru", 2, "2026-01-06T00:00:00Z"),
    ];
    const { taken, remaining } = takeMergedFromBuffers([dense, sparse], 3);
    expect(taken.map((p) => `${p.__meta?.originMode}:${p.id}`)).toEqual([
      "e621:10",
      "e621:9",
      "e621:8",
    ]);
    expect(remaining[0]).toEqual([]);
    expect(remaining[1].map((p) => p.id)).toEqual([1, 2]);
  });

  it("interleaves by created_at across sites", () => {
    const a = [post("e621", 1, "2026-01-05T00:00:00Z")];
    const b = [post("furbooru", 2, "2026-01-06T00:00:00Z")];
    const { taken, remaining } = takeMergedFromBuffers([a, b], 2);
    expect(taken.map((p) => p.id)).toEqual([2, 1]);
    expect(remaining[0]).toEqual([]);
    expect(remaining[1]).toEqual([]);
  });
});

describe("initUnifiedMergeState", () => {
  it("starts each child at page 1", () => {
    const state = initUnifiedMergeState("k", ["e621", "furbooru"]);
    expect(state.lastEmittedPage).toBe(0);
    expect(state.children.map((c) => c.nextPage)).toEqual([1, 1]);
    expect(bufferedCount(state)).toBe(0);
  });
});
