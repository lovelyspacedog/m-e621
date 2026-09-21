import { describe, expect, it } from "vitest";
import { blockedToolRedirectName } from "./blockedToolRedirect";

describe("blockedToolRedirectName", () => {
  it("sends Tailspace supports* fallback to TailspacePosts", () => {
    expect(blockedToolRedirectName("tailspace")).toBe("TailspacePosts");
  });

  it("keeps Flayrah on FlayrahFeed and others on Posts", () => {
    expect(blockedToolRedirectName("flayrah")).toBe("FlayrahFeed");
    expect(blockedToolRedirectName("e621")).toBe("Posts");
    expect(blockedToolRedirectName("sofurry")).toBe("Posts");
    expect(blockedToolRedirectName("local")).toBe("Posts");
  });
});
