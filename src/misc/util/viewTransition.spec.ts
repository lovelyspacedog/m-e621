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
      shouldSkipViewTransition({ name: "Landing" }, { name: "Posts" }),
    ).toBe(false);
  });
});
