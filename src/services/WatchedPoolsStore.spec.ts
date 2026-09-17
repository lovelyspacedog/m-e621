import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { newPostCountFor, useWatchedPoolsStore } from "./WatchedPoolsStore";

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

  it("snapshots last-seen on add and markSeen", () => {
    vi.spyOn(Date, "now").mockReturnValue(200);
    const store = useWatchedPoolsStore();

    store.add("e621", 3, { postCount: 10, updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(store.findEntry("e621", 3)).toMatchObject({
      lastSeenPostCount: 10,
      lastSeenUpdatedAt: "2026-01-01T00:00:00.000Z",
    });

    store.markSeen("e621", 3, {
      postCount: 14,
      updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    expect(store.findEntry("e621", 3)?.lastSeenPostCount).toBe(14);
    expect(store.newCount("e621", 3, 16)).toBe(2);
  });

  it("ensureBaseline only fills missing lastSeen", () => {
    const store = useWatchedPoolsStore();
    store.add("e621", 5);
    store.ensureBaseline("e621", 5, { postCount: 8 });
    expect(store.findEntry("e621", 5)?.lastSeenPostCount).toBe(8);

    store.ensureBaseline("e621", 5, { postCount: 99 });
    expect(store.findEntry("e621", 5)?.lastSeenPostCount).toBe(8);
  });
});

describe("newPostCountFor", () => {
  it("returns 0 when lastSeen is missing", () => {
    expect(newPostCountFor(undefined, 12)).toBe(0);
    expect(newPostCountFor({}, 12)).toBe(0);
  });

  it("clamps negative deltas to 0", () => {
    expect(newPostCountFor({ lastSeenPostCount: 20 }, 12)).toBe(0);
  });
});
