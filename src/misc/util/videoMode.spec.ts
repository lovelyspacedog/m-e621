import { describe, expect, it } from "vitest";
import {
  defaultVideoSites,
  isLegacyXtraMode,
  isVideoChildMode,
  isVideoMode,
  videoModeSelectable,
} from "./videoMode";

describe("videoMode", () => {
  it("isVideoMode / isVideoChildMode / isLegacyXtraMode", () => {
    expect(isVideoMode("video")).toBe(true);
    expect(isVideoMode("murrtube")).toBe(false);
    expect(isVideoChildMode("murrtube")).toBe(true);
    expect(isVideoChildMode("badpups")).toBe(true);
    expect(isVideoChildMode("video")).toBe(false);
    expect(isLegacyXtraMode("murrtube")).toBe(true);
    expect(isLegacyXtraMode("e621")).toBe(false);
  });

  it("videoModeSelectable requires flag and not SFW", () => {
    expect(videoModeSelectable({ videoModeEnabled: true, sfwOnly: false })).toBe(true);
    expect(videoModeSelectable({ videoModeEnabled: true, sfwOnly: true })).toBe(false);
    expect(videoModeSelectable({ videoModeEnabled: false, sfwOnly: false })).toBe(false);
  });

  it("defaultVideoSites both on", () => {
    expect(defaultVideoSites()).toEqual({ murrtube: true, badpups: true });
  });
});
