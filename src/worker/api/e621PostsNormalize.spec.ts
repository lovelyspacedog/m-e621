import { describe, expect, it } from "vitest";
import type { Post } from "./returnTypes";
import { normalizeE621PostsPayload } from "./index";

const stubPost = { id: 1 } as Post;

describe("normalizeE621PostsPayload", () => {
  it("wraps a bare post array from posts.json", () => {
    expect(normalizeE621PostsPayload([stubPost])).toEqual({ posts: [stubPost] });
  });

  it("preserves legacy { posts } payloads", () => {
    expect(normalizeE621PostsPayload({ posts: [stubPost] })).toEqual({
      posts: [stubPost],
    });
  });

  it("returns empty posts for missing shapes", () => {
    expect(normalizeE621PostsPayload(undefined)).toEqual({ posts: [] });
    expect(normalizeE621PostsPayload({} as { posts: Post[] })).toEqual({
      posts: [],
    });
  });
});