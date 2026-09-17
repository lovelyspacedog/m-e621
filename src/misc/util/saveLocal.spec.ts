import { describe, expect, it, vi } from "vitest";

vi.mock("localforage", () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => null),
    setDriver: vi.fn(async () => undefined),
  },
}));

import { allocateUniqueFileName } from "./saveLocal";

describe("allocateUniqueFileName", () => {
  it("returns original when free", async () => {
    expect(await allocateUniqueFileName(async () => false, "a.jpg")).toBe(
      "a.jpg",
    );
  });

  it("suffixes (1), (2) on collision", async () => {
    const taken = new Set(["wolf.jpg", "wolf (1).jpg"]);
    const name = await allocateUniqueFileName(
      async (n) => taken.has(n),
      "wolf.jpg",
    );
    expect(name).toBe("wolf (2).jpg");
  });
});
