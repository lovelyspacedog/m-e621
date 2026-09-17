import { describe, expect, it, vi } from "vitest";

vi.mock("localforage", () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => null),
    setDriver: vi.fn(async () => undefined),
  },
}));

import { reactive } from "vue";
import { toPlain } from "./PersistanceService";

describe("toPlain", () => {
  it("clones nested objects without reactive proxies", () => {
    const state = reactive({
      posts: { videoVolume: 0.5, nested: { a: 1 } },
      list: [1, { x: 2 }],
    });
    const plain = toPlain(state) as typeof state;
    expect(plain).toEqual({
      posts: { videoVolume: 0.5, nested: { a: 1 } },
      list: [1, { x: 2 }],
    });
    plain.posts.videoVolume = 1;
    expect(state.posts.videoVolume).toBe(0.5);
  });
});
