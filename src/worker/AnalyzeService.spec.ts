import { describe, expect, it } from "vitest";
import {
  AnalyzeService,
  collectPagedFavorites,
  favoriteFetchMaxPages,
} from "./AnalyzeService";

describe("collectPagedFavorites", () => {
  it("collects across pages when adapters return < 320 (100 → 100 → 0)", async () => {
    const pages: { id: number }[][] = [
      Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
      Array.from({ length: 100 }, (_, i) => ({ id: i + 101 })),
      [],
    ];
    let call = 0;
    const result = await collectPagedFavorites({
      postLimit: 500,
      fetchPage: async () => pages[call++] ?? [],
    });
    expect(result).toHaveLength(200);
    expect(result[0].id).toBe(1);
    expect(result[199].id).toBe(200);
    expect(call).toBe(3);
  });

  it("stops on a short final page relative to the observed page size", async () => {
    const pages: { id: number }[][] = [
      Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
      Array.from({ length: 40 }, (_, i) => ({ id: i + 101 })),
    ];
    let call = 0;
    const result = await collectPagedFavorites({
      postLimit: 1920,
      fetchPage: async () => pages[call++] ?? [],
    });
    expect(result).toHaveLength(140);
    expect(call).toBe(2);
  });

  it("respects postLimit as the outer bound", async () => {
    let page = 0;
    const result = await collectPagedFavorites({
      postLimit: 150,
      fetchPage: async () => {
        page += 1;
        return Array.from({ length: 100 }, (_, i) => ({
          id: (page - 1) * 100 + i + 1,
        }));
      },
    });
    expect(result).toHaveLength(150);
  });

  it("caps pages via favoriteFetchMaxPages when batches stay full but keep drops all", async () => {
    const maxPages = favoriteFetchMaxPages(5);
    expect(maxPages).toBe(5);
    let calls = 0;
    const result = await collectPagedFavorites({
      postLimit: 5,
      fetchPage: async () => {
        calls += 1;
        return [{ id: calls }, { id: calls + 100 }];
      },
      keep: () => [],
    });
    expect(result).toHaveLength(0);
    expect(calls).toBe(maxPages);
  });
});

describe("AnalyzeService local favorites", () => {
  it("getFavoriteTags refuses local (Suggester/Analyzer use type:favorited on main thread)", async () => {
    const service = new AnalyzeService();
    await expect(
      service.getFavoriteTags(
        "",
        "https://example.invalid",
        () => undefined,
        "local",
      ),
    ).rejects.toThrow(/Local favorites must be loaded on the main thread/);
  });
});
