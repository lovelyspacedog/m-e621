import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWatchedPoolsStore } from "./WatchedPoolsStore";

describe("WatchedPoolsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("keeps equal pool ids from different sites distinct", () => {
    const store = useWatchedPoolsStore();

    store.add("e621", 42);
    store.add("e6ai", 42);

    expect(store.isWatched("e621", 42)).toBe(true);
    expect(store.isWatched("e6ai", 42)).toBe(true);
    expect(store.entriesFor("e621")).toHaveLength(1);
    expect(store.entriesFor("e6ai")).toHaveLength(1);
  });

  it("toggles only the selected site entry", () => {
    const store = useWatchedPoolsStore();
    store.add("e621", 7);
    store.add("e6ai", 7);

    expect(store.toggle("e621", 7)).toBe(false);

    expect(store.isWatched("e621", 7)).toBe(false);
    expect(store.isWatched("e6ai", 7)).toBe(true);
  });

  it("does not add a duplicate watch", () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    const store = useWatchedPoolsStore();

    store.add("e621", 9);
    store.add("e621", 9);

    expect(store.entries).toEqual([{ originMode: "e621", id: 9, watchedAt: 100 }]);
  });
});
