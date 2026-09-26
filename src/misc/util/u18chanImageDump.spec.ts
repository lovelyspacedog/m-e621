import { describe, expect, it } from "vitest";
import type { U18chanPost } from "@/worker/u18chan/types";
import {
  defaultU18chanThreadViewMode,
  extractU18chanImageDump,
  isU18chanComicsLiveBoard,
} from "./u18chanImageDump";

const img = (n: number) => ({
  fullUrl: `https://u18chan.com/uploads/data/${n}.jpg`,
  thumbUrl: `https://u18chan.com/uploads/data/thumb_${n}.jpg`,
});

const post = (
  id: number,
  name: string,
  imageCount: number,
  isOp = false,
): U18chanPost => ({
  id,
  name,
  subject: isOp ? "Comic" : "",
  timestamp: "",
  comment: "",
  images: Array.from({ length: imageCount }, (_, i) => img(id * 10 + i)),
  isOp,
});

describe("extractU18chanImageDump", () => {
  it("returns empty for empty input", () => {
    expect(extractU18chanImageDump([])).toEqual([]);
    expect(extractU18chanImageDump(null)).toEqual([]);
  });

  it("takes consecutive same-name image posts, not OP-only", () => {
    const posts = [
      post(1, "Furrynomous", 1, true),
      post(2, "Furrynomous", 1),
      post(3, "Furrynomous", 1),
      post(4, "Other", 1),
      post(5, "Furrynomous", 1),
    ];
    const dump = extractU18chanImageDump(posts);
    expect(dump.map((p) => p.postId)).toEqual([1, 2, 3]);
    expect(dump.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    // Later same-name image after a different poster is excluded
    expect(dump.some((p) => p.postId === 5)).toBe(false);
  });

  it("skips text-only same-name posts without ending the dump", () => {
    const posts = [
      post(1, "Meowser", 1, true),
      { ...post(2, "Meowser", 0), comment: "page break note" },
      post(3, "Meowser", 1),
      post(4, "Furrynomous", 0),
      post(5, "Meowser", 1),
    ];
    expect(extractU18chanImageDump(posts).map((p) => p.postId)).toEqual([
      1, 3,
    ]);
  });

  it("flattens multi-image posts into pages", () => {
    const posts = [post(1, "OP", 3, true), post(2, "Other", 1)];
    const dump = extractU18chanImageDump(posts);
    expect(dump).toHaveLength(3);
    expect(dump.map((p) => p.key)).toEqual(["1:0", "1:1", "1:2"]);
  });
});

describe("u18chan comics defaults", () => {
  it("recognizes comics live boards", () => {
    expect(isU18chanComicsLiveBoard("c")).toBe(true);
    expect(isU18chanComicsLiveBoard("gc")).toBe(true);
    expect(isU18chanComicsLiveBoard("fur")).toBe(false);
  });

  it("defaults comics with a dump to gallery", () => {
    expect(defaultU18chanThreadViewMode("gc", 12)).toBe("gallery");
    expect(defaultU18chanThreadViewMode("c", 1)).toBe("thread");
    expect(defaultU18chanThreadViewMode("fur", 4)).toBe("thread");
  });
});
