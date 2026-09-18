import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWatchedComicsStore } from "./WatchedComicsStore";

describe("WatchedComicsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("toggles watch by comic id", () => {
    const store = useWatchedComicsStore();
    expect(store.toggle(7, "alpha")).toBe(true);
    expect(store.isWatched(7)).toBe(true);
    expect(store.toggle(7, "alpha")).toBe(false);
    expect(store.isWatched(7)).toBe(false);
  });

  it("does not add a duplicate watch", () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    const store = useWatchedComicsStore();

    store.add(9, "nine");
    store.add(9, "nine");

    expect(store.entries).toEqual([{ id: 9, name: "nine", watchedAt: 100 }]);
  });

  it("updates slug name on re-add of existing watch", () => {
    const store = useWatchedComicsStore();
    store.add(3, "old-slug");
    store.add(3, "new-slug");
    expect(store.findEntry(3)?.name).toBe("new-slug");
  });

  it("snapshots last-seen on add and markSeen", () => {
    vi.spyOn(Date, "now").mockReturnValue(200);
    const store = useWatchedComicsStore();

    store.add(3, "comic", {
      pageCount: 10,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(store.findEntry(3)).toMatchObject({
      lastSeenPageCount: 10,
      lastSeenUpdatedAt: "2026-01-01T00:00:00.000Z",
    });

    store.markSeen(3, {
      pageCount: 14,
      updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    expect(store.findEntry(3)?.lastSeenPageCount).toBe(14);
    expect(store.newCount(3, 16)).toBe(2);
  });

  it("ensureBaseline only fills missing lastSeen", () => {
    const store = useWatchedComicsStore();
    store.add(5, "five");
    store.ensureBaseline(5, { pageCount: 8 });
    expect(store.findEntry(5)?.lastSeenPageCount).toBe(8);

    store.ensureBaseline(5, { pageCount: 99 });
    expect(store.findEntry(5)?.lastSeenPageCount).toBe(8);
  });

  it("clearAll removes every watch", () => {
    const store = useWatchedComicsStore();
    store.add(1, "a");
    store.add(2, "b");
    store.clearAll();
    expect(store.entries).toEqual([]);
  });
});
