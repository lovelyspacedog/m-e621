import { describe, expect, it } from "vitest";
import type { Post } from "./returnTypes";
import { adaptE621ApiPost, isLegacyE621Post } from "./e621AdaptPost";
import { normalizeE621PostsPayload } from "./index";

const newFormatRow = {
  id: 42,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  change_seq: 1,
  rating: "s",
  description: "hi",
  uploader_id: 9,
  uploader_name: "artist",
  tags: ["wolf", "canine"],
  flags: {
    pending: false,
    flagged: false,
    note_locked: false,
    status_locked: false,
    rating_locked: false,
    deleted: false,
  },
  files: {
    meta: { md5: "abc", ext: "jpg", size: 100, has_sample: true },
    original: { width: 800, height: 600, url: "https://e621.net/original.jpg" },
    preview: {
      width: 150,
      height: 150,
      jpg: "https://e621.net/preview.jpg",
    },
    sample: {
      width: 400,
      height: 300,
      jpg: "https://e621.net/sample.jpg",
    },
  },
  stats: {
    score: { up: 10, down: -2, total: 8 },
    fav_count: 3,
    comment_count: 1,
    is_favorited: true,
  },
  has: { notes: true, children: false, active_children: false },
  relationships: { parent_id: null, children: [] },
  sources: [],
  pools: [],
  locked_tags: [],
};

const legacyPost: Post = {
  id: 1,
  created_at: "",
  updated_at: "",
  change_seq: 0,
  file: {
    width: 1,
    height: 1,
    ext: "png",
    size: 1,
    md5: "x",
    url: "https://example.test/a.png",
  },
  preview: { width: 1, height: 1, url: "https://example.test/p.png" },
  sample: { has: false, width: 1, height: 1, url: "" },
  score: { up: 1, down: 0, total: 1 },
  tags: {
    general: ["tag"],
    species: [],
    character: [],
    copyright: [],
    artist: [],
    invalid: [],
    lore: [],
    meta: [],
  },
  locked_tags: [],
  flags: newFormatRow.flags,
  rating: "s",
  fav_count: 0,
  sources: [],
  pools: [],
  relationships: {
    has_children: false,
    has_active_children: false,
    children: [],
  },
  uploader_id: 1,
  description: "",
  comment_count: 0,
  is_favorited: false,
  has_notes: false,
};

describe("adaptE621ApiPost", () => {
  it("maps stats.score and files.* into Material post fields", () => {
    const post = adaptE621ApiPost(newFormatRow);
    expect(post.score).toEqual({ up: 10, down: 2, total: 8 });
    expect(post.file.url).toBe("https://e621.net/original.jpg");
    expect(post.preview.url).toBe("https://e621.net/preview.jpg");
    expect(post.sample.url).toBe("https://e621.net/sample.jpg");
    expect(post.tags.general).toEqual(["wolf", "canine"]);
    expect(post.fav_count).toBe(3);
    expect(post.is_favorited).toBe(true);
    expect(post.has_notes).toBe(true);
  });

  it("passes through legacy posts", () => {
    expect(isLegacyE621Post(legacyPost)).toBe(true);
    expect(adaptE621ApiPost(legacyPost)).toBe(legacyPost);
  });
});

describe("normalizeE621PostsPayload", () => {
  it("adapts new-format bare arrays", () => {
    const { posts } = normalizeE621PostsPayload([newFormatRow]);
    expect(posts[0]?.score.down).toBe(2);
  });

  it("returns empty posts for missing shapes", () => {
    expect(normalizeE621PostsPayload(undefined)).toEqual({ posts: [] });
  });
});