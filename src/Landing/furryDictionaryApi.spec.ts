import { describe, expect, it } from "vitest";
import {
  dictionaryEntryUrl,
  pickRandomEntry,
  type FurryDictionaryEntry,
} from "./furryDictionaryApi";

const sample = (slug: string): FurryDictionaryEntry => ({
  slug,
  categories: ["test"],
  preview: { text: `def of ${slug}`, all: `def of ${slug}` },
});

describe("furryDictionaryApi", () => {
  it("builds entry URLs with encoded slugs", () => {
    expect(dictionaryEntryUrl("FA")).toBe(
      "https://the-furry-dictionary.avoonix.com/FA",
    );
    expect(dictionaryEntryUrl("2D eyes")).toBe(
      "https://the-furry-dictionary.avoonix.com/2D%20eyes",
    );
    expect(dictionaryEntryUrl(":3")).toBe(
      "https://the-furry-dictionary.avoonix.com/%3A3",
    );
  });

  it("returns null for an empty list", () => {
    expect(pickRandomEntry([])).toBeNull();
  });

  it("picks one of the provided entries", () => {
    const entries = [sample("a"), sample("b"), sample("c")];
    const picked = pickRandomEntry(entries);
    expect(picked).not.toBeNull();
    expect(entries).toContainEqual(picked!);
  });

  it("avoids the excluded slug when other entries exist", () => {
    const entries = [sample("a"), sample("b")];
    for (let i = 0; i < 20; i++) {
      const picked = pickRandomEntry(entries, "a");
      expect(picked?.slug).toBe("b");
    }
  });

  it("keeps the only entry when exclude matches it", () => {
    expect(pickRandomEntry([sample("solo")], "solo")?.slug).toBe("solo");
  });
});
