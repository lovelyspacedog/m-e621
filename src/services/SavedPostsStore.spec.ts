import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSavedPostsStore } from "./SavedPostsStore";
import { useMainStore } from "./state";

describe("SavedPostsStore collections", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("creates collections and membership without dropping All saved", () => {
    const saved = useSavedPostsStore();
    saved.add("e621", 10);
    saved.add("furbooru", 20);
    const col = saved.createCollection("Read later");
    expect(col?.name).toBe("Read later");
    saved.setInCollection(col!.id, "e621:10", true);
    expect(saved.isInCollection(col!.id, "e621:10")).toBe(true);
    expect(saved.entriesForCollection(col!.id)).toHaveLength(1);
    expect(saved.entriesForCollection(null)).toHaveLength(2);
  });

  it("remove from bookmarks also strips collection keys", () => {
    const saved = useSavedPostsStore();
    saved.add("e621", 1);
    const col = saved.createCollection("Refs")!;
    saved.setInCollection(col.id, "e621:1", true);
    saved.remove("e621", 1);
    expect(saved.isInCollection(col.id, "e621:1")).toBe(false);
    expect(useMainStore().savedPosts.collections[0]?.postKeys).toEqual([]);
  });

  it("replaceCollectionKeys bookmarks missing posts", () => {
    const saved = useSavedPostsStore();
    const col = saved.createCollection("Pack")!;
    saved.replaceCollectionKeys(col.id, ["e621:99", "itaku:3"]);
    expect(saved.count).toBe(2);
    expect(saved.isInCollection(col.id, "itaku:3")).toBe(true);
  });
});
