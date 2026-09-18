import { describe, expect, it, vi } from "vitest";

// Module imports localforage; jsdom has no IndexedDB — mock before import.
vi.mock("localforage", () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async (_k: string, v: unknown) => v),
    removeItem: vi.fn(async () => undefined),
    ready: vi.fn(async () => undefined),
    INDEXEDDB: "asyncStorage",
    LOCALSTORAGE: "localStorageWrapper",
  },
}));

import { isLikelyNetworkSaveError } from "./offlineSaveQueue";

describe("isLikelyNetworkSaveError", () => {
  it("treats TypeError and fetch failures as network", () => {
    expect(isLikelyNetworkSaveError(new TypeError("Failed to fetch"))).toBe(
      true,
    );
    expect(isLikelyNetworkSaveError(new Error("NetworkError when attempting"))).toBe(
      true,
    );
    expect(isLikelyNetworkSaveError(new Error("Download failed (404)"))).toBe(
      false,
    );
  });
});
