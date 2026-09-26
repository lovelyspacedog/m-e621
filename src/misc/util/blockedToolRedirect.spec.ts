import { describe, expect, it } from "vitest";
import { blockedToolRedirectName } from "./blockedToolRedirect";

describe("blockedToolRedirectName", () => {
  it("sends Tailspace supports* fallback to TailspacePosts", () => {
    expect(blockedToolRedirectName("tailspace")).toBe("TailspacePosts");
  });

  it("sends u18chan supports* fallback to U18chanCatalog", () => {
    expect(blockedToolRedirectName("u18chan")).toBe("U18chanCatalog");
  });

  it("keeps Flayrah on NewsFeed and others on Posts", () => {
    expect(blockedToolRedirectName("news")).toBe("NewsFeed");
    expect(blockedToolRedirectName("e621")).toBe("Posts");
    expect(blockedToolRedirectName("sofurry")).toBe("Posts");
    expect(blockedToolRedirectName("local")).toBe("Posts");
  });
});
