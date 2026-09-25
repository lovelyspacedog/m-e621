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
      published_at: "2026-09-19T09:13:48Z",
      tags: [{ name: "dragon" }],
      user: { slug: "ddcave", name: "The dragon" },
    });
    expect(post.file.ext).toBe("m3u8");
    expect(post.file.url).toContain("/api/murrtube/media?url=");
    expect(post.rating).toBe("e");
    expect(post.tags.artist).toEqual(["ddcave"]);
    expect(post.tags.general).toContain("dragon");
    expect((post as { __meta?: { murrtube?: { shortCode?: string } } }).__meta?.murrtube?.shortCode).toBe(
      "P0U4",
    );
  });
});
