import { describe, expect, it } from "vitest";
import {
  formatUnifiedTagWarning,
  prepareUnifiedChildTags,
} from "./unifiedTags";

describe("prepareUnifiedChildTags", () => {
  it("keeps following:me only on Itaku/SoFurry/FA/Inkbunny", () => {
    expect(
      prepareUnifiedChildTags("itaku", ["following:me", "fox"]).tags,
    ).toEqual(["following:me", "fox"]);
    expect(
      prepareUnifiedChildTags("e621", ["following:me"]).dropped,
    ).toContain("following:me");
    expect(
      prepareUnifiedChildTags("furaffinity", ["following:me"]).tags,
    ).toContain("following:me");
    expect(
      prepareUnifiedChildTags("inkbunny", ["following:me"]).tags,
    ).toContain("following:me");
    expect(
      prepareUnifiedChildTags("weasyl", ["following:me"]).dropped,
    ).toContain("following:me");
  });

  it("passes most e621 tags unchanged", () => {
    const tags = ["fox", "order:score", "rating:e", "species:canine"];
    expect(prepareUnifiedChildTags("e621", tags)).toEqual({
      tags,
      remapped: [],
      dropped: [],
      stripped: [],
    });
  });

  it("maps favs:me to my:faves on Furbooru and drops foreign order", () => {
    const { tags, remapped, dropped, stripped } = prepareUnifiedChildTags(
      "furbooru",
      ["fox", "favs:me", "order:comment_bumped", "order:score", "rating:safe"],
    );
    expect(tags).toEqual(["fox", "my:faves", "order:score", "safe"]);
    expect(remapped).toContain("favs:me");
    expect(remapped).toContain("rating:safe");
    expect(dropped).toContain("order:comment_bumped");
    expect(stripped).toEqual(expect.arrayContaining(["favs:me", "order:comment_bumped"]));
  });

  it("drops rating on Inkbunny and remaps species:", () => {
    const { tags, remapped, dropped } = prepareUnifiedChildTags("inkbunny", [
      "species:fox",
      "rating:explicit",
      "order:score",
    ]);
    expect(tags).toEqual(["fox", "order:score"]);
    expect(remapped).toContain("species:fox");
    expect(dropped).toContain("rating:explicit");
  });

  it("maps artist: to artist: on FA", () => {
    const { tags } = prepareUnifiedChildTags("furaffinity", [
      "artist:someone",
      "order:score",
    ]);
    expect(tags).toEqual(["artist:someone", "order:score"]);
  });

  it("keeps type:audio on music-capable children only", () => {
    expect(prepareUnifiedChildTags("furaffinity", ["type:audio"]).tags).toEqual([
      "type:audio",
    ]);
    expect(prepareUnifiedChildTags("inkbunny", ["type:audio"]).tags).toEqual([
      "type:audio",
    ]);
    expect(prepareUnifiedChildTags("weasyl", ["type:audio"]).tags).toEqual([
      "type:audio",
    ]);
    expect(prepareUnifiedChildTags("sofurry", ["type:audio"]).tags).toEqual([
      "type:audio",
    ]);
    expect(prepareUnifiedChildTags("e621", ["type:audio"]).dropped).toContain(
      "type:audio",
    );
    expect(prepareUnifiedChildTags("itaku", ["type:audio"]).dropped).toContain(
      "type:audio",
    );
  });

  it("formatUnifiedTagWarning distinguishes dropped vs remapped", () => {
    const prepared = prepareUnifiedChildTags("furbooru", [
      "favs:me",
      "order:comment_bumped",
    ]);
    expect(formatUnifiedTagWarning("Furbooru", prepared)).toMatch(
      /Furbooru: dropped order:comment_bumped; remapped favs:me/,
    );
  });
});
