import { describe, expect, it } from "vitest";
import { shouldSkipViewTransition } from "./viewTransition";

describe("shouldSkipViewTransition", () => {
  it("skips first load (no from.name)", () => {
    expect(shouldSkipViewTransition({}, { name: "Posts" })).toBe(true);
  });

  it("skips same-name navigations", () => {
    expect(
      shouldSkipViewTransition({ name: "Posts" }, { name: "Posts" }),
    ).toBe(true);
  });

  it("allows real route changes", () => {
    expect(
      shouldSkipViewTransition({ name: "Posts" }, { name: "Settings" }),
    ).toBe(false);
  });

  it("skips leaving LandingPage (VT + out-in blanks v-main)", () => {
    expect(
      shouldSkipViewTransition({ name: "LandingPage" }, { name: "ScentMarks" }),
    ).toBe(true);
    expect(
      shouldSkipViewTransition({ name: "LandingPage" }, { name: "Posts" }),
    ).toBe(true);
  });

  it("allows arriving at LandingPage from elsewhere", () => {
    expect(
      shouldSkipViewTransition({ name: "Posts" }, { name: "LandingPage" }),
    ).toBe(false);
  });
});
