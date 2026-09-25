import { describe, expect, it } from "vitest";
import {
  artistTagsFromFluffle,
  e6IdFromUrl,
  pickE6FluffleHit,
} from "./localFluffleTag";
import type { FluffleResult } from "./fluffleSearch";

const hit = (
  partial: Partial<FluffleResult> & Pick<FluffleResult, "id" | "match">,
): FluffleResult => ({
  distance: 0,
  platform: "",
  url: "",
  isSfw: true,
  thumbnail: null,
  authors: [],
  ...partial,
});

describe("e6IdFromUrl / pickE6FluffleHit", () => {
  it("parses e621 and e6ai post URLs", () => {
    expect(e6IdFromUrl("https://e621.net/posts/123")).toEqual({
      mode: "e621",
      id: 123,
    });
    expect(e6IdFromUrl("https://e6ai.net/posts/9")).toEqual({
      mode: "e6ai",
      id: 9,
    });
    expect(e6IdFromUrl("https://furaffinity.net/view/1")).toBeNull();
  });

  it("prefers exact e6 hits", () => {
    const results = [
      hit({
        id: "fa",
        match: "exact",
        platform: "furaffinity",
        url: "https://www.furaffinity.net/view/1/",
      }),
      hit({
        id: "456",
        match: "exact",
        platform: "e621",
        url: "https://e621.net/posts/456",
      }),
    ];
    expect(pickE6FluffleHit(results)).toEqual({ mode: "e621", id: 456 });
  });
});

describe("artistTagsFromFluffle", () => {
  it("builds artist: tags from authors", () => {
    const tags = artistTagsFromFluffle([
      hit({
        id: "1",
        match: "exact",
        authors: [{ id: "a", name: "Cool Artist" }],
      }),
      hit({
        id: "2",
        match: "unlikely",
        authors: [{ id: "b", name: "skip" }],
      }),
    ]);
    expect(tags).toEqual(["artist:cool_artist"]);
  });
});
