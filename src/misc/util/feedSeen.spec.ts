import { describe, expect, it } from "vitest";
import { feedSeenKeyFor, feedSeenKeysForMode } from "./feedSeen";

describe("feedSeenKeyFor", () => {
  it("tracks empty browse and following:me only", () => {
    expect(feedSeenKeyFor({ mode: "e621", tags: [] })).toBe("e621:posts");
    expect(feedSeenKeyFor({ mode: "furaffinity", tags: ["following:me"] })).toBe(
      "furaffinity:following",
    );
    expect(feedSeenKeyFor({ mode: "e621", tags: ["following:me"] })).toBeNull();
    expect(feedSeenKeyFor({ mode: "e621", tags: ["order:score"] })).toBeNull();
    expect(feedSeenKeyFor({ mode: "e621", tags: ["wolf"] })).toBeNull();
  });

  it("uses one Federated key per feed source", () => {
    expect(
      feedSeenKeyFor({
        mode: "unified",
        tags: [],
        unifiedFeedSource: "search",
      }),
    ).toBe("unified:posts");
    expect(
      feedSeenKeyFor({
        mode: "unified",
        tags: [],
        unifiedFeedSource: "following",
      }),
    ).toBe("unified:following");
    expect(
      feedSeenKeyFor({
        mode: "unified",
        tags: ["wolf"],
        unifiedFeedSource: "following",
      }),
    ).toBeNull();
  });

  it("skips dedicated chrome and Local", () => {
    expect(feedSeenKeyFor({ mode: "local", tags: [] })).toBeNull();
    expect(feedSeenKeyFor({ mode: "news", tags: [] })).toBeNull();
    expect(feedSeenKeyFor({ mode: "tailspace", tags: [] })).toBeNull();
    expect(feedSeenKeyFor({ mode: "u18chan", tags: [] })).toBeNull();
  });

  it("offers a Following key only where that feed exists", () => {
    expect(feedSeenKeysForMode("e621")).toEqual(["e621:posts"]);
    expect(feedSeenKeysForMode("inkbunny")).toEqual([
      "inkbunny:posts",
      "inkbunny:following",
    ]);
    expect(feedSeenKeysForMode("unified")).toEqual([
      "unified:posts",
      "unified:following",
    ]);
    expect(feedSeenKeysForMode("local")).toEqual([]);
  });
});
