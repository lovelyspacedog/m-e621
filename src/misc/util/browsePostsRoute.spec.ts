import { describe, expect, it } from "vitest";
import { browsePostsRoute } from "./browsePostsRoute";

describe("browsePostsRoute", () => {
  it("maps dedicated chrome to their feed routes", () => {
    expect(browsePostsRoute("tailspace")).toEqual({ name: "TailspacePosts" });
    expect(browsePostsRoute("u18chan")).toEqual({ name: "U18chanCatalog" });
    expect(browsePostsRoute("news")).toEqual({ name: "NewsFeed" });
  });

  it("maps gallery modes to Posts", () => {
    expect(browsePostsRoute("e621")).toEqual({ name: "Posts" });
    expect(browsePostsRoute("unified")).toEqual({ name: "Posts" });
    expect(browsePostsRoute("local")).toEqual({ name: "Posts" });
  });
});
