import { describe, expect, it } from "vitest";
import { adaptDetails, hashidToNumericId } from "./api";

describe("sofurry adaptDetails", () => {
  it("maps isLiked and likeCount onto favorited state", () => {
    const post = adaptDetails({
      id: "Rno7w7xn",
      title: "Wolf and Wolf",
      type: "drawing",
      category: "artwork",
      description: "A wolf.",
      thumbUrl: "https://cdn.sofurryfiles.com/submissions/thumbnails/x.jpg",
      content: [
        {
          id: "c1",
          type: "file",
          extension: "jpg",
          displayUrl: "https://cdn.sofurryfiles.com/submissions/contents/x.jpg",
          meta: { width: 100, height: 80 },
        },
      ],
      likes: 12,
      likeCount: 12,
      isLiked: true,
      tags: ["Wolf"],
      author: { username: "hunterwolf", handle: "hunterwolf" },
    });
    expect(post).toBeTruthy();
    expect(post!.id).toBe(hashidToNumericId("Rno7w7xn"));
    expect(post!.is_favorited).toBe(true);
    expect(post!.fav_count).toBe(12);
    expect(post!.score.total).toBe(12);
  });

  it("marks shortstory submissions as document stories with title meta", () => {
    const post = adaptDetails({
      id: "rn67oWE1",
      title: "The Story of Kody Grey Part II",
      type: "shortstory",
      category: "writing",
      description: "Short blurb about Kody.",
      thumbUrl: "https://cdn.sofurryfiles.com/submissions/thumbnails/y.jpg",
      content: [
        {
          id: "c2",
          type: "file",
          extension: "txt",
          displayUrl:
            "https://s3.sofurryfiles.com/sfx-source/submissions/contents/original/y.txt?X-Amz-Signature=1",
          meta: { wordCount: 8489 },
        },
      ],
      likes: 0,
      isLiked: false,
      tags: ["Wolf"],
      author: { username: "hyenafur", handle: "hyenafur" },
    });
    expect(post).toBeTruthy();
    expect(post!.file.ext).toBe("txt");
    expect(post!.is_favorited).toBe(false);
    const meta = (post as any).__meta;
    expect(meta.kind).toBe("story");
    expect(meta.sofurry.title).toBe("The Story of Kody Grey Part II");
    expect(meta.sofurry.contentUrl).toContain("s3.sofurryfiles.com");
    expect(String(post!.file.url)).toContain("/api/sofurry/media");
  });
});
