import { describe, expect, it } from "vitest";
import { cookieByName, cookieHeader, normalizeDesktopToken } from "@/misc/util/desktopLogin";

describe("desktopLogin", () => {
  it("builds a cookie header from allowlisted pairs", () => {
    expect(
      cookieHeader([
        { name: "a", value: "ay" },
        { name: "b", value: "bee" },
      ]),
    ).toBe("a=ay; b=bee");
    expect(cookieByName([{ name: "A", value: "ay" }], "a")).toBe("ay");
    expect(cookieByName([], "a")).toBe("");
  });

  it("normalizes an Itaku token", () => {
    expect(normalizeDesktopToken('Token abc')).toBe("abc");
    expect(normalizeDesktopToken('"abc"')).toBe("abc");
    expect(normalizeDesktopToken("")).toBe("");
  });
});
