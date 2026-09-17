import { describe, expect, it } from "vitest";
import { buildChunkButtons, GALLERY_CHUNK_SIZE, SCROLL_CHUNK_SIZE } from "./comicReader";

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
