import { describe, expect, it } from "vitest";
import {
  isDedicatedChromeMode,
  isE621FamilyMode,
  modeSupportsFavoriteAnalyzer,
  modeSupportsOtherUserFavorites,
  modeSupportsPools,
  modeSupportsSuggester,
} from "./siteCapabilities";
import type { SiteMode } from "@/services/types";

describe("modeSupportsPools", () => {
  it("matches e621-family, Furbooru, Inkbunny, and Federated", () => {
    expect(modeSupportsPools("e621")).toBe(true);
    expect(modeSupportsPools("e6ai")).toBe(true);
    expect(modeSupportsPools("furbooru")).toBe(true);
    expect(modeSupportsPools("inkbunny")).toBe(true);
    expect(modeSupportsPools("unified")).toBe(true);
    expect(isE621FamilyMode("unified")).toBe(false);
    expect(isE621FamilyMode("inkbunny")).toBe(false);
    expect(isE621FamilyMode("furbooru")).toBe(false);
    const blocked: SiteMode[] = [
      "furaffinity",
      "weasyl",
      "itaku",
      "sofurry",
      "local",
      "tailspace",
      "news",
    ];
    for (const mode of blocked) {
      expect(modeSupportsPools(mode)).toBe(false);
      expect(isE621FamilyMode(mode)).toBe(false);
    }
  });
});

describe("modeSupportsSuggester", () => {
  it("allows all modes except dedicated chrome", () => {
    const modes: SiteMode[] = [
      "e621",
      "e6ai",
      "furbooru",
      "inkbunny",
      "furaffinity",
      "weasyl",
      "itaku",
      "sofurry",
      "local",
      "unified",
    ];
    for (const mode of modes) {
      expect(modeSupportsSuggester(mode)).toBe(true);
      expect(modeSupportsFavoriteAnalyzer(mode)).toBe(true);
    }
    expect(modeSupportsSuggester("tailspace")).toBe(false);
    expect(modeSupportsFavoriteAnalyzer("tailspace")).toBe(false);
    expect(modeSupportsSuggester("news")).toBe(false);
    expect(modeSupportsFavoriteAnalyzer("news")).toBe(false);
    expect(isDedicatedChromeMode("tailspace")).toBe(true);
    expect(isDedicatedChromeMode("news")).toBe(true);
    expect(isDedicatedChromeMode("e621")).toBe(false);
  });
});

describe("modeSupportsOtherUserFavorites", () => {
  it("is true only for public-fav modes", () => {
    expect(modeSupportsOtherUserFavorites("e621")).toBe(true);
    expect(modeSupportsOtherUserFavorites("e6ai")).toBe(true);
    expect(modeSupportsOtherUserFavorites("furaffinity")).toBe(true);
    expect(modeSupportsOtherUserFavorites("sofurry")).toBe(true);
    expect(modeSupportsOtherUserFavorites("furbooru")).toBe(false);
    expect(modeSupportsOtherUserFavorites("unified")).toBe(false);
    expect(modeSupportsOtherUserFavorites("local")).toBe(false);
  });
});
