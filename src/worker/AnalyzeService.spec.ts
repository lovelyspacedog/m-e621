import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  AnalyzeService,
  collectPagedFavorites,
  favoriteFetchMaxPages,
} from "./AnalyzeService";
import { BlacklistMode, SITE_MODE_URLS } from "@/services/types";
import type { Post } from "./api";

const getPostsMock = vi.hoisted(() => vi.fn());

vi.mock("./ApiService", () => ({
  ApiService: class {
    getPosts = (...args: unknown[]) => getPostsMock(...args);
  },
}));

const emptyTags = () => ({
  general: [] as string[],
  species: [] as string[],
  character: [] as string[],
  copyright: [] as string[],
  artist: [] as string[],
  invalid: [] as string[],
  lore: [] as string[],
  meta: [] as string[],
});

const makePost = (id: number): Post =>
  ({
    id,
    rating: "s",
    tags: { ...emptyTags(), general: ["wolf"] },
    file: { url: "", ext: "jpg", width: 1, height: 1, size: 1, md5: "" },
    preview: { url: "", width: 1, height: 1 },
    sample: { url: "", width: 1, height: 1, has: false },
    score: { up: 0, down: 0, total: 0 },
    fav_count: 0,
    is_favorited: false,
    created_at: "",
    updated_at: "",
  }) as Post;

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

describe("AnalyzeService Federated favorite child failures", () => {
  beforeEach(() => {
    getPostsMock.mockReset();
  });

  it("returns warnings when one child fails and another succeeds", async () => {
    getPostsMock.mockImplementation(async (args: { mode?: string }) => {
      if (args.mode === "weasyl") throw new Error("unreachable");
      return { posts: [makePost(42)] };
    });
    const service = new AnalyzeService();
    const result = await service.getFavoriteTags(
      "",
      SITE_MODE_URLS.e621,
      () => undefined,
      "unified",
      undefined,
      null,
      {
        feedSource: "search",
        sharedBlacklist: [],
        children: [
          {
            mode: "inkbunny",
            baseUrl: SITE_MODE_URLS.inkbunny,
            auth: { login: "ib", api_key: "sid" },
            userId: 1,
            blacklist: [],
          },
          {
            mode: "weasyl",
            baseUrl: SITE_MODE_URLS.weasyl,
            auth: { login: "wz", api_key: "key" },
            userId: null,
            blacklist: [],
          },
        ],
      },
      50,
    );
    expect(result.favoriteKeys.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([
      expect.stringMatching(/Weasyl skipped: unreachable/),
    ]);
  });

  it("throws on total failure without returning per-child warnings", async () => {
    getPostsMock.mockRejectedValue(new Error("down"));
    const service = new AnalyzeService();
    await expect(
      service.getFavoriteTags(
        "",
        SITE_MODE_URLS.e621,
        () => undefined,
        "unified",
        undefined,
        null,
        {
          feedSource: "search",
          sharedBlacklist: [],
          children: [
            {
              mode: "inkbunny",
              baseUrl: SITE_MODE_URLS.inkbunny,
              auth: { login: "ib", api_key: "sid" },
              userId: 1,
              blacklist: [],
            },
            {
              mode: "weasyl",
              baseUrl: SITE_MODE_URLS.weasyl,
              auth: { login: "wz", api_key: "key" },
              userId: null,
              blacklist: [],
            },
          ],
        },
        50,
      ),
    ).rejects.toThrow(/No favorites sampled/);
  });
});

describe("AnalyzeService Federated hybrid seeds", () => {
  beforeEach(() => {
    getPostsMock.mockReset();
  });

  it("searches each seed tag only on the origin that contributed it", async () => {
    getPostsMock.mockResolvedValue({ posts: [] });
    const service = new AnalyzeService();
    const profile = {
      counts: {
        artist: { e621_only: 5, ib_only: 4 },
      },
      favoriteKeys: [] as string[],
      countsByOrigin: {
        e621: { artist: { e621_only: 5 } },
        inkbunny: { artist: { ib_only: 4 } },
      },
    };
    await service.suggestPosts(
      profile,
      { artist: 30, general: 1, character: 1, copyright: 1, species: 1, meta: 0, lore: 0, invalid: 0 },
      10,
      { direction: "next", page: 1 },
      undefined,
      SITE_MODE_URLS.e621,
      () => undefined,
      [],
      BlacklistMode.blur,
      "unified",
      null,
      {
        feedSource: "search",
        sharedBlacklist: [],
        children: [
          {
            mode: "e621",
            baseUrl: SITE_MODE_URLS.e621,
            auth: { login: "a", api_key: "k" },
            userId: 1,
            blacklist: [],
          },
          {
            mode: "inkbunny",
            baseUrl: SITE_MODE_URLS.inkbunny,
            auth: { login: "ib", api_key: "sid" },
            userId: 1,
            blacklist: [],
          },
        ],
      },
    );

    const seedCalls = getPostsMock.mock.calls
      .map((c) => c[0] as { mode?: string; tags?: string[] })
      .filter((args) => (args.tags?.length || 0) > 0);

    expect(seedCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: "e621", tags: ["e621_only"] }),
        expect.objectContaining({ mode: "inkbunny", tags: ["ib_only"] }),
      ]),
    );
    expect(
      seedCalls.some(
        (c) => c.mode === "inkbunny" && c.tags?.includes("e621_only"),
      ),
    ).toBe(false);
    expect(
      seedCalls.some((c) => c.mode === "e621" && c.tags?.includes("ib_only")),
    ).toBe(false);
  });
});
