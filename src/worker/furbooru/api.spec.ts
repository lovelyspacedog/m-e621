import { describe, expect, it } from "vitest";
import {
  adaptGallery,
  adaptImage,
  expandPhilomenaIdQuery,
  mapPoolListQuery,
  stillRepUrl,
  stripPoolGlob,
  type PhilomenaGallery,
  type PhilomenaImage,
} from "./api";

const baseReps = {
  full: "https://furrycdn.org/img/view/2026/9/16/600867.webm",
  large: "https://furrycdn.org/img/2026/9/16/600867/full.webm",
  medium: "https://furrycdn.org/img/2026/9/16/600867/full.webm",
  small: "https://furrycdn.org/img/2026/9/16/600867/small.webm",
  tall: "https://furrycdn.org/img/2026/9/16/600867/full.webm",
  thumb: "https://furrycdn.org/img/2026/9/16/600867/thumb.webm",
  thumb_small: "https://furrycdn.org/img/2026/9/16/600867/thumb_small.webm",
  thumb_tiny: "https://furrycdn.org/img/2026/9/16/600867/thumb_tiny.webm",
};

const videoImage = (over: Partial<PhilomenaImage> = {}): PhilomenaImage =>
  ({
    id: 600867,
    created_at: "2026-09-16T00:00:00Z",
    updated_at: "2026-09-16T00:00:00Z",
    tags: ["safe", "webm", "animated"],
    tag_ids: [],
    score: 1,
    upvotes: 1,
    downvotes: 0,
    faves: 1,
    comment_count: 0,
    description: "",
    mime_type: "video/webm",
    format: "webm",
    width: 640,
    height: 480,
    view_url: "https://furbooru.org/600867",
    representations: { ...baseReps },
    spoilered: false,
    ...over,
  }) as PhilomenaImage;

describe("stillRepUrl", () => {
  it("rewrites webm/mp4 to gif and keeps query strings", () => {
    expect(stillRepUrl("https://cdn/x/thumb.webm")).toBe(
      "https://cdn/x/thumb.gif",
    );
    expect(stillRepUrl("https://cdn/x/thumb.mp4?v=1")).toBe(
      "https://cdn/x/thumb.gif?v=1",
    );
    expect(stillRepUrl("https://cdn/x/thumb.jpg")).toBe(
      "https://cdn/x/thumb.jpg",
    );
    expect(stillRepUrl("")).toBe("");
  });
});

describe("adaptImage video stills", () => {
  it("maps webm thumb representations to gif for card preview/sample", () => {
    const post = adaptImage(videoImage());
    expect(post.file.url).toBe(baseReps.full);
    expect(post.file.ext).toBe("webm");
    expect(post.preview.url).toBe(
      "https://furrycdn.org/img/2026/9/16/600867/thumb_small.gif",
    );
    // Prefer thumb.gif over rewriting full.webm → full.gif (404).
    expect(post.sample.url).toBe(
      "https://furrycdn.org/img/2026/9/16/600867/thumb.gif",
    );
  });

  it("leaves still image representation URLs unchanged", () => {
    const post = adaptImage(
      videoImage({
        format: "jpg",
        mime_type: "image/jpeg",
        representations: {
          full: "https://furrycdn.org/img/x/full.jpg",
          large: "https://furrycdn.org/img/x/large.jpg",
          medium: "https://furrycdn.org/img/x/medium.jpg",
          small: "https://furrycdn.org/img/x/small.jpg",
          tall: "https://furrycdn.org/img/x/tall.jpg",
          thumb: "https://furrycdn.org/img/x/thumb.jpg",
          thumb_small: "https://furrycdn.org/img/x/thumb_small.jpg",
          thumb_tiny: "https://furrycdn.org/img/x/thumb_tiny.jpg",
        },
      }),
    );
    expect(post.preview.url).toBe(
      "https://furrycdn.org/img/x/thumb_small.jpg",
    );
    expect(post.sample.url).toBe("https://furrycdn.org/img/x/large.jpg");
  });
});

describe("expandPhilomenaIdQuery", () => {
  it("expands e621 comma id lists to Philomena OR clauses", () => {
    expect(expandPhilomenaIdQuery("id:1,2,3")).toBe("id:1 OR id:2 OR id:3");
    expect(expandPhilomenaIdQuery("id:505462")).toBe("id:505462");
    expect(expandPhilomenaIdQuery("id:1, 2, score.gt:0")).toBe(
      "id:1 OR id:2, score.gt:0",
    );
    expect(expandPhilomenaIdQuery("gallery_id:1820")).toBe("gallery_id:1820");
  });
});

describe("mapPoolListQuery / adaptGallery", () => {
  it("strips e621 globs and builds Philomena gallery queries", () => {
    expect(stripPoolGlob("*fox*")).toBe("fox");
    expect(mapPoolListQuery({})).toBe("*");
    expect(mapPoolListQuery({ query: "*comic*" })).toBe("title:comic*");
    expect(mapPoolListQuery({ descriptionMatches: "*arc*" })).toBe(
      "description:arc*",
    );
    expect(mapPoolListQuery({ creatorName: "tony" })).toBe("user:tony");
    expect(mapPoolListQuery({ ids: [3, 9] })).toBe("id:3 OR id:9");
    expect(mapPoolListQuery({ postTagsMatch: "wolf" })).toBeNull();
  });

  it("maps gallery fields and uses thumbnail as cover post id", () => {
    const g: PhilomenaGallery = {
      id: 42,
      title: "Mean Gallery",
      description: "desc",
      thumbnail_id: 99,
      user: "artist",
      user_id: 7,
    };
    const pool = adaptGallery(g);
    expect(pool.id).toBe(42);
    expect(pool.name).toBe("Mean Gallery");
    expect(pool.creator_name).toBe("artist");
    expect(pool.creator_id).toBe(7);
    expect(pool.post_ids).toEqual([99]);
    expect(pool.post_count).toBe(0);
  });
});
