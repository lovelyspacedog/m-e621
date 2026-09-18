import { describe, expect, it, vi } from "vitest";

// localMedia configures localforage at import — jsdom has no IndexedDB driver.
vi.mock("localforage", () => {
  const store = new Map<string, unknown>();
  return {
    default: {
      config: vi.fn(),
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
        return value;
      }),
      removeItem: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      ready: vi.fn(async () => undefined),
      INDEXEDDB: "asyncStorage",
      LOCALSTORAGE: "localStorageWrapper",
    },
  };
});

import { flattenPostTagsForSidecar } from "./localMedia";

describe("flattenPostTagsForSidecar", () => {
  it("flattens and lowercases category buckets", () => {
    expect(
      flattenPostTagsForSidecar({
        tags: {
          artist: ["Artist_Name"],
          general: ["solo", "male"],
          character: [],
          copyright: ["some_series"],
          species: ["canine"],
          invalid: [],
          lore: [],
          meta: ["hi_res"],
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        "artist_name",
        "solo",
        "male",
        "some_series",
        "canine",
        "hi_res",
      ]),
    );
  });

  it("returns empty for missing tags", () => {
    expect(flattenPostTagsForSidecar(null)).toEqual([]);
    expect(flattenPostTagsForSidecar({})).toEqual([]);
  });
});
