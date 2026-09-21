import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useMainStore } from "./state";
import { useNewsStore } from "./NewsStore";

describe("NewsStore unread", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("markUnread removes an id from persisted readIds", () => {
    const main = useMainStore();
    const news = useNewsStore();
    news.markRead("flayrah:1");
    news.markRead("dogpatch:2");
    expect(news.isRead("flayrah:1")).toBe(true);
    news.markUnread("flayrah:1");
    expect(news.isRead("flayrah:1")).toBe(false);
    expect(main.news?.readIds).toEqual(["dogpatch:2"]);
  });

  it("markAllRead prepends ids and persists on main.news", () => {
    const main = useMainStore();
    const news = useNewsStore();
    news.markRead("flayrah:9");
    news.markAllRead(["dogpatch:1", "infurnation:2"]);
    expect(news.isRead("dogpatch:1")).toBe(true);
    expect(news.isRead("infurnation:2")).toBe(true);
    expect(news.isRead("flayrah:9")).toBe(true);
    expect(main.news?.readIds.slice(0, 2)).toEqual([
      "dogpatch:1",
      "infurnation:2",
    ]);
  });
});

describe("NewsStore watched authors and new-since", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("toggles watched authors case-insensitively", () => {
    const news = useNewsStore();
    expect(news.toggleWatchAuthor("Patch")).toBe(true);
    expect(news.isWatchedAuthor("patch")).toBe(true);
    expect(news.toggleWatchAuthor("PATCH")).toBe(false);
    expect(news.watchedAuthors).toEqual([]);
  });

  it("counts new since lastSeen and markFeedSeen advances the cursor", () => {
    const news = useNewsStore();
    expect(news.countNewerThanSeen([100, 200, 50])).toBe(0);
    news.ensureFeedSeenBaseline(150);
    expect(news.lastSeenPublishedMs).toBe(150);
    expect(news.countNewerThanSeen([50, 150, 200, 250])).toBe(2);
    news.markFeedSeen(250);
    expect(news.lastSeenPublishedMs).toBe(250);
    expect(news.countNewerThanSeen([50, 150, 200, 250])).toBe(0);
  });
});
