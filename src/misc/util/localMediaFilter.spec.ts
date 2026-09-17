import { describe, expect, it, vi } from "vitest";

vi.mock("localforage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => null),
    config: vi.fn(),
    setDriver: vi.fn(async () => undefined),
  },
}));

import {
  filterLocalMedia,
  fuzzyTagsMatch,
  type LocalMediaEntry,
} from "./localMedia";

const entry = (partial: Partial<LocalMediaEntry> & { relativePath: string }): LocalMediaEntry =>
  ({
    name: partial.relativePath.split("/").pop() || partial.relativePath,
    ext: "jpg",
    size: 1,
    lastModified: 0,
    kind: "image",
    playable: true,
    artistTags: [],
    generalTags: [],
    tags: [],
    ...partial,
  }) as LocalMediaEntry;

describe("fuzzyTagsMatch", () => {
  it("matches exact and fuzzy sidecar tags", () => {
    expect(fuzzyTagsMatch(["red_wolf", "canine"], "wolf")).toBe(true);
    expect(fuzzyTagsMatch(["canine"], "canin")).toBe(true);
    expect(fuzzyTagsMatch(["canine"], "dragon")).toBe(false);
  });
});

describe("filterLocalMedia", () => {
  it("ranks sidecar tags equal to path for fuzzy terms", () => {
    const index = [
      entry({
        relativePath: "artist/photo.jpg",
        tags: ["species:red_wolf", "canine"],
      }),
      entry({
        relativePath: "other/unrelated.jpg",
        tags: ["bird"],
      }),
    ];
    const hit = filterLocalMedia(index, ["wolf"]);
    expect(hit.map((e) => e.relativePath)).toEqual(["artist/photo.jpg"]);
  });
});
