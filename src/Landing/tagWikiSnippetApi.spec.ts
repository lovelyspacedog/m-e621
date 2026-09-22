import { describe, expect, it } from "vitest";
import {
  displayWikiTitle,
  firstWikiParagraph,
  isTagWikiCandidate,
  stripDtext,
  WIKI_CATEGORY_ARTIST,
  wikiHomeUrl,
  wikiPageUrl,
} from "./tagWikiSnippetApi";

describe("tagWikiSnippetApi", () => {
  it("builds wiki URLs", () => {
    expect(wikiHomeUrl()).toBe("https://e621.net/wiki_pages/204");
    expect(wikiPageUrl("hi_res")).toBe("https://e621.net/wiki_pages/hi_res");
    expect(wikiPageUrl("2d_eyes")).toBe("https://e621.net/wiki_pages/2d_eyes");
  });

  it("rejects artist-category wiki pages", () => {
    const base = {
      title: "some_artist",
      body: "A portfolio page with enough prose to pass the paragraph filter.",
      is_deleted: false,
    };
    expect(
      isTagWikiCandidate({ ...base, category_id: WIKI_CATEGORY_ARTIST }),
    ).toBe(false);
    expect(isTagWikiCandidate({ ...base, category_id: 0 })).toBe(true);
    expect(isTagWikiCandidate({ ...base, category_id: 5 })).toBe(true);
  });

  it("displays underscores as spaces", () => {
    expect(displayWikiTitle("inner_ear_fluff")).toBe("inner ear fluff");
  });

  it("strips common DText markup", () => {
    expect(stripDtext('Anthro is a [[tag_group:body_types|body type]]')).toBe(
      "Anthro is a body type",
    );
    expect(stripDtext('[b]"Mammals":[https://en.wikipedia.org/wiki/Mammal][/b]')).toBe(
      "Mammals",
    );
    expect(stripDtext("see [[fur]] and [[scales]]")).toBe("see fur and scales");
  });

  it("takes the first prose paragraph and skips thumbs/headings", () => {
    const body = [
      "h1. Title",
      "",
      "thumb #1 thumb #2",
      "",
      "When a character has [[lipstick]] on their lips that has a purple color.",
      "",
      "h3. See also",
      "more stuff that should not appear",
    ].join("\n");
    expect(firstWikiParagraph(body)).toBe(
      "When a character has lipstick on their lips that has a purple color.",
    );
  });

  it("returns empty when only thumbs/headings exist", () => {
    expect(firstWikiParagraph("h1. X\n\nthumb #1\nthumb #2")).toBe("");
  });
});
