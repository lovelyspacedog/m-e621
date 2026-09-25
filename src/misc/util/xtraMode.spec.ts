import { describe, expect, it } from "vitest";
import { isXtraMode, xtraModesSelectable } from "./xtraMode";

describe("xtraMode", () => {
  it("isXtraMode", () => {
    expect(isXtraMode("murrtube")).toBe(true);
    expect(isXtraMode("badpups")).toBe(true);
    expect(isXtraMode("e621")).toBe(false);
    expect(isXtraMode(null)).toBe(false);
  });

  it("xtraModesSelectable requires flag and not SFW", () => {
    expect(xtraModesSelectable({ xtraModeEnabled: true, sfwOnly: false })).toBe(true);
    expect(xtraModesSelectable({ xtraModeEnabled: true, sfwOnly: true })).toBe(false);
    expect(xtraModesSelectable({ xtraModeEnabled: false, sfwOnly: false })).toBe(false);
  });
});
