import { describe, expect, it } from "vitest";
import {
  parseTailspaceQueryTerms,
  tailspacePostMatchesQuery,
} from "./tailspaceSearch";
import type { TailspacePost } from "@/worker/tailspace/types";

const post = (partial: Partial<TailspacePost> & { title: string }): TailspacePost =>
  ({
    id: 1,
    postType: "general",
    description: null,
    allowComments: true,
    releasedAt: "2026-01-01T00:00:00Z",
    creator: {
      userId: 1,
      username: "artist",
      displayName: "Artist",
      profilePictureToken: null,
    },
    tags: [],
    media: [],
    poll: null,
    likeCount: 0,
    yourLike: false,
    commentCount: 0,
    viewCount: 0,
    comicUpdate: null,
    ...partial,
  }) as TailspacePost;

describe("tailspaceSearch", () => {
  it("parses space/comma terms", () => {
    expect(parseTailspaceQueryTerms("Fox, canine  art")).toEqual([
      "fox",
      "canine",
      "art",
    ]);
  });

  it("matches title artist and tags (AND)", () => {
    const p = post({
      title: "Red Fox Study",
      tags: [{ id: 1, name: "canine" }],
      creator: {
        userId: 2,
        username: "jackaloo",
        displayName: "Jackaloo",
        profilePictureToken: null,
      },
    });
    expect(tailspacePostMatchesQuery(p, ["fox", "canine"])).toBe(true);
    expect(tailspacePostMatchesQuery(p, ["fox", "dragon"])).toBe(false);
    expect(tailspacePostMatchesQuery(p, ["jackaloo"])).toBe(true);
  });
});
