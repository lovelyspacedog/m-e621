import { describe, expect, it } from "vitest";
import { serializePoolSearchIds } from "./index";

describe("serializePoolSearchIds", () => {
  it("joins positive ids", () => {
    expect(serializePoolSearchIds([1, 2, 0, -3, 9])).toBe("1,2,9");
  });

  it("passes through string ids", () => {
    expect(serializePoolSearchIds("3,4")).toBe("3,4");
  });
});
