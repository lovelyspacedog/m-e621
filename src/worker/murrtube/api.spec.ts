import { describe, expect, it } from "vitest";
import { adaptMedium, murrtubeNumericId } from "./api";

describe("murrtube adapter", () => {
  it("murrtubeNumericId is stable", () => {
    expect(murrtubeNumericId("abc")).toBe(murrtubeNumericId("abc"));
    expect(murrtubeNumericId("abc")).not.toBe(murrtubeNumericId("abd"));
  });

  it("adaptMedium maps inertia medium", () => {
    const post = adaptMedium({
      id: "06c2ed6c-b4ef-43bd-89b7-afb8ace7bb6a",
      short_code: "P0U4",
      title: "Test",
      url: "/v/P0U4",
      duration: 197,
      thumbnail_url: "https://storage.murrtube.net/x/thumbnail.jpg",
      hls_url: "https://storage.murrtube.net/x/index.m3u8",
      likes_count: 3,
      views_count: 6287,
      published_at: "2026-09-19T09:13:48Z",
      tags: [
        { name: "dragon", category: "species" },
        { name: "cum", category: "general" },
      ],
      user: { slug: "ddcave", name: "The dragon" },
    });
    expect(post.file.ext).toBe("m3u8");
    expect(post.file.url).toContain("/api/murrtube/media?url=");
    expect(post.rating).toBe("e");
    expect(post.tags.artist).toEqual(["ddcave"]);
    expect(post.tags.species).toContain("dragon");
    expect(post.tags.general).toContain("cum");
    expect(post.uploader_name).toBe("The dragon");
    const meta = (post as { __meta?: { murrtube?: { shortCode?: string; viewsCount?: number; detailsLoaded?: boolean } } }).__meta?.murrtube;
    expect(meta?.shortCode).toBe("P0U4");
    expect(meta?.viewsCount).toBe(6287);
    expect(meta?.detailsLoaded).toBe(true);
  });

  it("adaptMedium list cards keep artist without tags", () => {
    const post = adaptMedium({
      id: "x",
      short_code: "Ab12",
      title: "List only",
      user: { slug: "ontorii", name: "Ontorii" },
      views_count: 10,
      thumbnail_url: "https://storage.murrtube.net/x/thumbnail.jpg",
    });
    expect(post.tags.artist).toEqual(["ontorii"]);
    expect(post.tags.general).toEqual([]);
    expect(
      (post as { __meta?: { murrtube?: { detailsLoaded?: boolean; viewsCount?: number } } }).__meta
        ?.murrtube?.detailsLoaded,
    ).toBe(false);
    expect(
      (post as { __meta?: { murrtube?: { viewsCount?: number } } }).__meta?.murrtube
        ?.viewsCount,
    ).toBe(10);
  });
});
