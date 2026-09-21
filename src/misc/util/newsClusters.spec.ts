import { describe, expect, it } from "vitest";
import {
  clusterNewsArticles,
  normalizeNewsTitle,
  titleSimilarity,
} from "./newsClusters";
import type { NewsArticle } from "@/worker/news/parseRss";

function article(
  partial: Partial<NewsArticle> & Pick<NewsArticle, "id" | "source" | "title">,
): NewsArticle {
  return {
    link: "https://example.com/",
    author: "A",
    publishedAt: "",
    publishedMs: 0,
    tags: [],
    descriptionHtml: "",
    excerpt: "",
    thumbUrl: null,
    ...partial,
  };
}

describe("normalizeNewsTitle", () => {
  it("strips punctuation and case", () => {
    expect(normalizeNewsTitle("NYC Furries' Livestream!")).toBe(
      "nyc furries livestream",
    );
  });
});

describe("titleSimilarity", () => {
  it("scores near-duplicates high", () => {
    expect(
      titleSimilarity(
        "Fursuit ban proposed in Maryland",
        "Fursuit ban proposed in Maryland county",
      ),
    ).toBeGreaterThan(0.7);
  });
});

describe("clusterNewsArticles", () => {
  it("merges same-day cross-source headlines and keeps newest primary", () => {
    const day = Date.parse("2026-09-20T12:00:00Z");
    const clustered = clusterNewsArticles([
      article({
        id: "flayrah:1",
        source: "flayrah",
        title: "Convention dates announced",
        publishedMs: day,
      }),
      article({
        id: "dogpatch:2",
        source: "dogpatch",
        title: "Convention dates announced",
        publishedMs: day + 3600_000,
      }),
      article({
        id: "fwg:3",
        source: "fwg",
        title: "Unrelated guild note",
        publishedMs: day,
      }),
    ]);
    expect(clustered).toHaveLength(2);
    expect(clustered[0].id).toBe("dogpatch:2");
    expect(clustered[0].related).toEqual([
      {
        id: "flayrah:1",
        source: "flayrah",
        title: "Convention dates announced",
        label: "Flayrah",
      },
    ]);
    expect(clustered[1].id).toBe("fwg:3");
    expect(clustered[1].related).toBeUndefined();
  });

  it("does not cluster same-source articles", () => {
    const day = Date.parse("2026-09-20T12:00:00Z");
    const clustered = clusterNewsArticles([
      article({
        id: "flayrah:1",
        source: "flayrah",
        title: "Same title twice",
        publishedMs: day,
      }),
      article({
        id: "flayrah:2",
        source: "flayrah",
        title: "Same title twice",
        publishedMs: day + 1000,
      }),
    ]);
    expect(clustered).toHaveLength(2);
  });
});
