import { describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useMainStore } from "@/services/state";
import {
  u18chanWatchKey,
  useWatchedU18chanStore,
} from "./WatchedU18chanStore";

describe("WatchedU18chanStore", () => {
  it("keys liveBoard:topicId", () => {
    expect(u18chanWatchKey("GC", 12)).toBe("gc:12");
  });

  it("toggles watch and computes +N from post count", () => {
    setActivePinia(createPinia());
    const main = useMainStore();
    main.watchedU18chan = { entries: [] };
    const store = useWatchedU18chanStore();

    expect(store.isWatched("gc", 1)).toBe(false);
    store.toggle("gc", 1, "Comic", "igc", { postCount: 10 });
    expect(store.isWatched("gc", 1)).toBe(true);
    expect(store.newCount("gc", 1, 10)).toBe(0);
    expect(store.newCount("gc", 1, 13)).toBe(3);
    store.markSeen("gc", 1, { postCount: 13 });
    expect(store.newCount("gc", 1, 13)).toBe(0);
    store.toggle("gc", 1, "Comic", "igc");
    expect(store.isWatched("gc", 1)).toBe(false);
  });
});
