import { describe, expect, it } from "vitest";
import { groupNewsByDay, newsDayLabel } from "./newsDayGroups";
import type { NewsArticle } from "@/worker/news/parseRss";

const base = (partial: Partial<NewsArticle> & { id: string; publishedMs: number }): NewsArticle => ({
  source: "flayrah",
  title: partial.id,
  link: "https://example.com",
  author: "A",
  publishedAt: "",
  tags: [],
  descriptionHtml: "",
  excerpt: "",
  thumbUrl: null,
  ...partial,
});

describe("newsDayLabel", () => {
  const now = Date.parse("2026-09-21T15:00:00");

  it("labels today and yesterday", () => {
    expect(newsDayLabel(Date.parse("2026-09-21T08:00:00"), now)).toBe("Today");
    expect(newsDayLabel(Date.parse("2026-09-20T20:00:00"), now)).toBe(
      "Yesterday",
    );
  });
});

describe("groupNewsByDay", () => {
  it("groups consecutive same-day articles", () => {
    const now = Date.parse("2026-09-21T15:00:00");
    const articles = [
      base({ id: "a", publishedMs: Date.parse("2026-09-21T12:00:00") }),
      base({ id: "b", publishedMs: Date.parse("2026-09-21T08:00:00") }),
      base({ id: "c", publishedMs: Date.parse("2026-09-20T18:00:00") }),
    ];
    const groups = groupNewsByDay(articles, now);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].articles.map((a) => a.id)).toEqual(["a", "b"]);
    expect(groups[0].startIndex).toBe(0);
    expect(groups[1].label).toBe("Yesterday");
    expect(groups[1].startIndex).toBe(2);
  });

  it("preserves cluster related extras through grouping", () => {
    const now = Date.parse("2026-09-21T15:00:00");
    const clustered = [
      {
        ...base({ id: "a", publishedMs: Date.parse("2026-09-21T12:00:00") }),
        related: [{ id: "b", label: "Dogpatch", source: "dogpatch" as const }],
      },
    ];
    const groups = groupNewsByDay(clustered, now);
    expect(groups[0]!.articles[0]!.related).toEqual([
      { id: "b", label: "Dogpatch", source: "dogpatch" },
    ]);
  });
});
