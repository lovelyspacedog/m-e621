import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  SAVED_SEARCH_OPENED_KEY,
  useDiscoveryStore,
} from "./DiscoveryStore";
import {
  wakeCursorIsStale,
  WAKE_CHECK_STALE_MS,
} from "@/misc/util/savedSearchWakeCheck";

describe("DiscoveryStore saved-search wake", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("newCountFor is 0 until a positive lastHitCount is recorded", () => {
    const discovery = useDiscoveryStore();
    expect(discovery.newCountFor("a")).toBe(0);
    discovery.setWakeCursor("a", {
      lastOpenedAt: 1,
      newestKey: "e621:1",
      lastHitCount: 3,
    });
    expect(discovery.newCountFor("a")).toBe(3);
  });

  it("recordWakeCheck seeds first observation with no badge", () => {
    const discovery = useDiscoveryStore();
    discovery.recordWakeCheck("s1", {
      newer: 24,
      newestKey: "e621:99",
      newestCreatedMs: 1000,
    });
    expect(discovery.getWakeCursor("s1")).toMatchObject({
      newestKey: "e621:99",
      createdMs: 1000,
      lastHitCount: 0,
    });
    expect(discovery.newCountFor("s1")).toBe(0);
  });

  it("recordWakeCheck after open placeholder still counts newer", () => {
    vi.spyOn(Date, "now").mockReturnValue(6000);
    const discovery = useDiscoveryStore();
    discovery.setWakeCursor("s1", {
      lastOpenedAt: 5000,
      newestKey: SAVED_SEARCH_OPENED_KEY,
      createdMs: 5000,
      lastHitCount: 0,
    });
    discovery.recordWakeCheck("s1", {
      newer: 2,
      newestKey: "e621:50",
      newestCreatedMs: 5500,
    });
    expect(discovery.getWakeCursor("s1")).toMatchObject({
      newestKey: SAVED_SEARCH_OPENED_KEY,
      createdMs: 5000,
      lastHitCount: 2,
    });
  });

  it("recordWakeCheck updates hit count without moving last-seen key", () => {
    vi.spyOn(Date, "now").mockReturnValue(5000);
    const discovery = useDiscoveryStore();
    discovery.setWakeCursor("s1", {
      lastOpenedAt: 100,
      newestKey: "e621:10",
      createdMs: 900,
      lastHitCount: 0,
    });
    discovery.recordWakeCheck("s1", {
      newer: 4,
      newestKey: "e621:50",
      newestCreatedMs: 4000,
    });
    expect(discovery.getWakeCursor("s1")).toMatchObject({
      newestKey: "e621:10",
      createdMs: 900,
      lastHitCount: 4,
      checkedAt: 5000,
    });
  });

  it("markSavedSearchOpened clears the badge", () => {
    vi.spyOn(Date, "now").mockReturnValue(8000);
    const discovery = useDiscoveryStore();
    discovery.setWakeCursor("s1", {
      lastOpenedAt: 100,
      newestKey: "e621:10",
      lastHitCount: 7,
    });
    discovery.markSavedSearchOpened("s1");
    expect(discovery.getWakeCursor("s1")).toMatchObject({
      lastOpenedAt: 8000,
      lastHitCount: 0,
      createdMs: 8000,
    });
    expect(discovery.newCountFor("s1")).toBe(0);
  });

  it("markSavedSearchOpened can set top-of-page cursor", () => {
    vi.spyOn(Date, "now").mockReturnValue(9000);
    const discovery = useDiscoveryStore();
    discovery.markSavedSearchOpened("s1", {
      newestKey: "e621:77",
      createdMs: 1234,
    });
    expect(discovery.getWakeCursor("s1")).toMatchObject({
      newestKey: "e621:77",
      createdMs: 1234,
      lastHitCount: 0,
    });
  });

  it("uses opened placeholder when no prior key", () => {
    vi.spyOn(Date, "now").mockReturnValue(1);
    const discovery = useDiscoveryStore();
    discovery.markSavedSearchOpened("fresh");
    expect(discovery.getWakeCursor("fresh")?.newestKey).toBe(
      SAVED_SEARCH_OPENED_KEY,
    );
  });
});

describe("wakeCursorIsStale", () => {
  it("is stale when missing checkedAt", () => {
    expect(wakeCursorIsStale(undefined)).toBe(true);
    expect(wakeCursorIsStale({ lastOpenedAt: 1 })).toBe(true);
  });

  it("is fresh within the window", () => {
    const now = 1_000_000;
    expect(
      wakeCursorIsStale({ lastOpenedAt: 1, checkedAt: now - 1000 }, now),
    ).toBe(false);
    expect(
      wakeCursorIsStale(
        { lastOpenedAt: 1, checkedAt: now - WAKE_CHECK_STALE_MS },
        now,
      ),
    ).toBe(true);
  });
});

describe("DiscoveryStore feed seen", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const post = (id: number, createdMs: number) => ({
    id,
    created_at: new Date(createdMs).toISOString(),
    __meta: { originMode: "e621" },
  });

  it("recordFeedSeenCheck seeds the first observation with no badge", () => {
    const discovery = useDiscoveryStore();
    discovery.recordFeedSeenCheck("e621:posts", [post(9, 5000), post(8, 4000)]);
    expect(discovery.getFeedSeen("e621:posts")).toMatchObject({
      newestKey: "e621:9",
      createdMs: 5000,
      lastHitCount: 0,
      checkedNewestMs: 5000,
    });
    expect(discovery.feedSeenCount("e621:posts")).toBe(0);
  });

  it("a later check counts posts newer than the watermark", () => {
    const discovery = useDiscoveryStore();
    discovery.baselineFeedSeen("e621:posts", 1000, "e621:1");
    discovery.recordFeedSeenCheck("e621:posts", [post(4, 4000), post(1, 1000)]);
    expect(discovery.feedSeenCount("e621:posts")).toBe(1);
    expect(discovery.getFeedSeen("e621:posts")?.createdMs).toBe(1000);
  });

  it("raiseFeedSeen never moves backward and clears the badge at the checked newest", () => {
    const discovery = useDiscoveryStore();
    discovery.baselineFeedSeen("e621:posts", 1000, "e621:1");
    discovery.recordFeedSeenCheck("e621:posts", [post(4, 4000), post(1, 1000)]);
    discovery.raiseFeedSeen("e621:posts", 500);
    expect(discovery.getFeedSeen("e621:posts")?.createdMs).toBe(1000);
    discovery.raiseFeedSeen("e621:posts", 4000);
    expect(discovery.getFeedSeen("e621:posts")?.createdMs).toBe(4000);
    expect(discovery.feedSeenCount("e621:posts")).toBe(0);
  });
});
