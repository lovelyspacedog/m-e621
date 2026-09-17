import { describe, expect, it } from "vitest";
import {
  isE621FamilyMode,
  modeSupportsPools,
} from "./siteCapabilities";
import type { SiteMode } from "@/services/types";

describe("modeSupportsPools", () => {
  it("matches e621-family only", () => {
    expect(modeSupportsPools("e621")).toBe(true);
    expect(modeSupportsPools("e6ai")).toBe(true);
    const blocked: SiteMode[] = [
      "inkbunny",
      "furaffinity",
      "furbooru",
      "weasyl",
      "itaku",
      "sofurry",
      "local",
      "unified",
      "tailspace",
    ];
    for (const mode of blocked) {
      expect(modeSupportsPools(mode)).toBe(false);
      expect(isE621FamilyMode(mode)).toBe(false);
    }
  });
});
