import { describe, expect, it } from "vitest";
import { e621PostsRequestNeedsAuth } from "./e621PostsRequestNeedsAuth";

describe("e621PostsRequestNeedsAuth", () => {
  it("requires auth for own-favorites tags", () => {
    expect(e621PostsRequestNeedsAuth("favs:me")).toBe(true);
    expect(e621PostsRequestNeedsAuth("order:rank favs:me")).toBe(true);
  });

  it("does not require auth for public browse", () => {
    expect(e621PostsRequestNeedsAuth("order:rank")).toBe(false);
    expect(e621PostsRequestNeedsAuth(["wolf", "order:score"])).toBe(false);
    expect(e621PostsRequestNeedsAuth("fav:someuser")).toBe(false);
  });
});