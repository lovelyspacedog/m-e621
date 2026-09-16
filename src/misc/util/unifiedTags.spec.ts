import { describe, expect, it } from "vitest";
import { prepareUnifiedChildTags } from "./unifiedTags";

describe("prepareUnifiedChildTags", () => {
  it("keeps following:me only on Itaku/SoFurry", () => {
    expect(
      prepareUnifiedChildTags("itaku", ["following:me", "fox"]).tags,
    ).toEqual(["following:me", "fox"]);
    expect(
      prepareUnifiedChildTags("e621", ["following:me"]).stripped,
    ).toContain("following:me");
    expect(
      prepareUnifiedChildTags("furaffinity", ["following:me"]).tags,
    ).toContain("following:me");
    expect(
      prepareUnifiedChildTags("inkbunny", ["following:me"]).tags,
    ).toContain("following:me");
    expect(
      prepareUnifiedChildTags("weasyl", ["following:me"]).stripped,
    ).toContain("following:me");
  });

  it("passes most e621 tags unchanged", () => {
    const tags = ["fox", "order:score", "rating:e", "species:canine"];
    expect(prepareUnifiedChildTags("e621", tags)).toEqual({
      tags,
      stripped: [],
    });
  });

  it("maps favs:me to my:faves on Furbooru and strips foreign order", () => {
    const { tags, stripped } = prepareUnifiedChildTags("furbooru", [
      "fox",
      "favs:me",
      "order:comment_bumped",
      "order:score",
      "rating:safe",
    ]);
    expect(tags).toEqual(["fox", "my:faves", "order:score", "safe"]);
    expect(stripped).toContain("favs:me");
    expect(stripped).toContain("order:comment_bumped");
    expect(stripped).toContain("rating:safe");
  });

  it("strips rating on Inkbunny and unwraps species:", () => {
    const { tags, stripped } = prepareUnifiedChildTags("inkbunny", [
      "species:fox",
      "rating:explicit",
      "order:score",
    ]);
    expect(tags).toEqual(["fox", "order:score"]);
    expect(stripped).toContain("species:fox");
    expect(stripped).toContain("rating:explicit");
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
    expect(prepareUnifiedChildTags("e621", ["type:audio"]).stripped).toContain(
      "type:audio",
    );
    expect(prepareUnifiedChildTags("itaku", ["type:audio"]).stripped).toContain(
      "type:audio",
    );
  });
});
