import { describe, expect, it } from "vitest";
import {
  buildChunkButtons,
  chunkForIndex,
  GALLERY_CHUNK_SIZE,
  parsePositiveIntQuery,
  SCROLL_CHUNK_SIZE,
} from "./comicReader";

describe("buildChunkButtons", () => {
  it("returns [1] for single chunk", () => {
    expect(buildChunkButtons(1, 1)).toEqual([1]);
  });

  it("ellipsis around current", () => {
    expect(buildChunkButtons(10, 5)).toEqual([1, "...", 4, 5, 6, "...", 10]);
  });

  it("keeps gallery/scroll sizes stable", () => {
    expect(GALLERY_CHUNK_SIZE).toBe(24);
    expect(SCROLL_CHUNK_SIZE).toBe(10);
  });
});

describe("chunkForIndex", () => {
  it("maps indices into 1-based chunks", () => {
    expect(chunkForIndex(0, 10)).toBe(1);
    expect(chunkForIndex(9, 10)).toBe(1);
    expect(chunkForIndex(10, 10)).toBe(2);
  });
});

describe("parsePositiveIntQuery", () => {
  it("accepts positive ints only", () => {
    expect(parsePositiveIntQuery("42")).toBe(42);
    expect(parsePositiveIntQuery(["7"])).toBe(7);
    expect(parsePositiveIntQuery("0")).toBe(0);
    expect(parsePositiveIntQuery("nope")).toBe(0);
  });
});
