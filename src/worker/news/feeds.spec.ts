import { describe, expect, it } from "vitest";
import { resolveNewsRssUrl } from "./feeds";

describe("resolveNewsRssUrl", () => {
  it("serves the Dogpatch site feed and category slugs", () => {
    expect(resolveNewsRssUrl("dogpatch", "full", 1)).toBe(
      "https://dogpatch.press/feed/",
    );
    expect(resolveNewsRssUrl("dogpatch", "opinion", 1)).toBe(
      "https://dogpatch.press/category/opinion/feed/",
    );
    expect(resolveNewsRssUrl("dogpatch", "opinion", 2)).toBe(
      "https://dogpatch.press/category/opinion/feed/?paged=2",
    );
  });

  it("rejects unknown Dogpatch slugs and Flayrah paging", () => {
    expect(resolveNewsRssUrl("dogpatch", "not-a-real-slug", 1)).toBeNull();
    expect(resolveNewsRssUrl("flayrah", "reviews", 2)).toBeNull();
    expect(resolveNewsRssUrl("dogpatch", "opinion", 99)).toBeNull();
  });

  it("keeps Flayrah taxonomy allowlist on page 1", () => {
    expect(resolveNewsRssUrl("flayrah", "reviews", 1)).toBe(
      "https://www.flayrah.com/taxonomy/term/37/0/feed",
    );
    expect(resolveNewsRssUrl("flayrah", "nope", 1)).toBeNull();
  });

  it("serves InFurNation and FWG full feeds with paging", () => {
    expect(resolveNewsRssUrl("infurnation", "full", 1)).toBe(
      "https://www.infurnation.com/feed/",
    );
    expect(resolveNewsRssUrl("fwg", "full", 2)).toBe(
      "https://furrywritersguild.com/feed/?paged=2",
    );
    expect(resolveNewsRssUrl("infurnation", "reviews", 1)).toBeNull();
  });
});
