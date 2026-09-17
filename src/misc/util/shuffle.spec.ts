import { describe, expect, it, vi } from "vitest";
import { shuffleInPlace, shuffled } from "./shuffle";

describe("shuffle", () => {
  it("shuffleInPlace mutates and returns the same array", () => {
    const items = [1, 2, 3];
    const random = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0) // i=2 → j=0: [3, 2, 1]
      .mockReturnValueOnce(0); // i=1 → j=0: [2, 3, 1]
    const out = shuffleInPlace(items);
    expect(out).toBe(items);
    expect(items).toEqual([2, 3, 1]);
    random.mockRestore();
  });

  it("shuffled returns a new array and leaves the source unchanged", () => {
    const source = [1, 2, 3];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const out = shuffled(source);
    expect(out).not.toBe(source);
    expect(source).toEqual([1, 2, 3]);
    expect(out).toHaveLength(3);
    expect(new Set(out)).toEqual(new Set(source));
    random.mockRestore();
  });

  it("handles empty and singleton arrays", () => {
    expect(shuffled([])).toEqual([]);
    expect(shuffled([7])).toEqual([7]);
  });
});
