import { describe, expect, it, vi } from "vitest";

vi.mock("localforage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => null),
    removeItem: vi.fn(async () => null),
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
    extraTags: [],
    folderKey: partial.folderKey || "id:test",
    folderLabel: partial.folderLabel || "Test",
    ...partial,
  }) as LocalMediaEntry;

describe("fuzzyTagsMatch", () => {
  it("matches exact and fuzzy sidecar tags", () => {
    expect(fuzzyTagsMatch(["red_wolf", "canine"], "wolf")).toBe(true);
    expect(fuzzyTagsMatch(["canine"], "canin")).toBe(true);
    expect(fuzzyTagsMatch(["canine"], "dragon")).toBe(false);
  });

  it("does not fuzzy-match folder: meta tags", () => {
    expect(fuzzyTagsMatch(["folder:artwork", "canine"], "art")).toBe(false);
    expect(fuzzyTagsMatch(["folder:artwork"], "artwork")).toBe(false);
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

  it("matches folder: with exact label (case-insensitive)", () => {
    const index = [
      entry({
        relativePath: "a.jpg",
        folderKey: "id:1",
        folderLabel: "Artwork",
        tags: ["folder:Artwork", "canine"],
      }),
      entry({
        relativePath: "b.jpg",
        folderKey: "id:2",
        folderLabel: "Photos",
        tags: ["folder:Photos", "canine"],
      }),
    ];
    const hit = filterLocalMedia(index, ["folder:artwork"]);
    expect(hit.map((e) => e.relativePath)).toEqual(["a.jpg"]);
  });

  it("excludes with -folder:", () => {
    const index = [
      entry({
        relativePath: "a.jpg",
        folderKey: "id:1",
        folderLabel: "Artwork",
        tags: ["folder:Artwork"],
      }),
      entry({
        relativePath: "b.jpg",
        folderKey: "id:2",
        folderLabel: "Photos",
        tags: ["folder:Photos"],
      }),
    ];
    const hit = filterLocalMedia(index, ["-folder:Artwork"]);
    expect(hit.map((e) => e.relativePath)).toEqual(["b.jpg"]);
  });

  it("does not match fuzzy term via folder tag alone", () => {
    const index = [
      entry({
        relativePath: "unrelated/file.jpg",
        folderKey: "id:1",
        folderLabel: "artwork",
        tags: ["folder:artwork"],
        name: "file.jpg",
      }),
      entry({
        relativePath: "other/art_piece.jpg",
        folderKey: "id:2",
        folderLabel: "Photos",
        tags: ["folder:Photos"],
        name: "art_piece.jpg",
      }),
    ];
    const hit = filterLocalMedia(index, ["art"]);
    expect(hit.map((e) => e.relativePath)).toEqual(["other/art_piece.jpg"]);
  });
});
