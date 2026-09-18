import { describe, expect, it } from "vitest";
import {
  isPoolOriginMode,
  isPoolListOrigin,
  parsePoolOriginQuery,
  poolFamilyChildren,
  poolWatchChildren,
  poolKey,
  poolRouteQuery,
  resolvePoolOrigin,
  sortPoolsByOrder,
  comparePoolsByOrder,
  poolTimestampMs,
} from "./poolOrigin";
import type { ISettingsServiceState } from "@/services/types";
import { defaultUnifiedSites, SITE_MODE_URLS } from "@/services/types";
import { createEmptySiteProfile } from "@/services/siteProfiles";

const emptyState = (activeMode: ISettingsServiceState["activeMode"]): ISettingsServiceState =>
  ({
    activeMode,
    profiles: {
      e621: createEmptySiteProfile("e621"),
      e6ai: createEmptySiteProfile("e6ai"),
      inkbunny: createEmptySiteProfile("inkbunny"),
      unified: {
        ...createEmptySiteProfile("unified"),
        unifiedSites: defaultUnifiedSites(),
      },
    },
    blacklist: { mode: 0, tags: [], hideServerSideBlacklisted: false },
  }) as unknown as ISettingsServiceState;

describe("parsePoolOriginQuery / resolvePoolOrigin", () => {
  it("parses origin query", () => {
    expect(parsePoolOriginQuery("e621")).toBe("e621");
    expect(parsePoolOriginQuery("e6ai")).toBe("e6ai");
    expect(parsePoolOriginQuery("inkbunny")).toBe("inkbunny");
    expect(parsePoolOriginQuery(["e6ai"])).toBe("e6ai");
    expect(parsePoolOriginQuery("furbooru")).toBeNull();
    expect(parsePoolOriginQuery(undefined)).toBeNull();
  });

  it("requires origin in Federated; falls back on pool origins", () => {
    expect(resolvePoolOrigin("e6ai", "unified")).toBe("e6ai");
    expect(resolvePoolOrigin("inkbunny", "unified")).toBe("inkbunny");
    expect(resolvePoolOrigin(undefined, "unified")).toBeNull();
    expect(resolvePoolOrigin(undefined, "e621")).toBe("e621");
    expect(resolvePoolOrigin("e6ai", "e621")).toBe("e6ai");
    expect(resolvePoolOrigin(undefined, "inkbunny")).toBe("inkbunny");
  });

  it("poolKey and route query", () => {
    expect(poolKey("e621", 12)).toBe("e621:12");
    expect(poolKey("inkbunny", 99)).toBe("inkbunny:99");
    expect(poolRouteQuery("e6ai", { post: "3" })).toEqual({
      origin: "e6ai",
      post: "3",
    });
    expect(poolRouteQuery(null)).toEqual({});
    expect(isPoolOriginMode("e621")).toBe(true);
    expect(isPoolOriginMode("inkbunny")).toBe(true);
    expect(isPoolOriginMode("unified")).toBe(false);
    expect(isPoolListOrigin("e621")).toBe(true);
    expect(isPoolListOrigin("inkbunny")).toBe(false);
  });
});

describe("poolFamilyChildren / poolWatchChildren", () => {
  it("returns the active e621-family site alone", () => {
    const kids = poolFamilyChildren(emptyState("e621"));
    expect(kids).toHaveLength(1);
    expect(kids[0].mode).toBe("e621");
    expect(kids[0].baseUrl).toBe(SITE_MODE_URLS.e621);
  });

  it("returns Inkbunny alone in Inkbunny mode", () => {
    const kids = poolFamilyChildren(emptyState("inkbunny"));
    expect(kids.map((k) => k.mode)).toEqual(["inkbunny"]);
  });

  it("fans out to enabled Federated e621/e6ai children only for list browse", () => {
    const state = emptyState("unified");
    const kids = poolFamilyChildren(state);
    expect(kids.map((k) => k.mode)).toEqual(["e621", "e6ai"]);
  });

  it("includes Inkbunny in Federated watch children when enabled", () => {
    const state = emptyState("unified");
    const watch = poolWatchChildren(state);
    expect(watch.map((k) => k.mode)).toEqual(["e621", "e6ai", "inkbunny"]);
  });

  it("omits disabled Federated pool children", () => {
    const state = emptyState("unified");
    state.profiles.unified!.unifiedSites = {
      ...defaultUnifiedSites(),
      e6ai: false,
      inkbunny: false,
    };
    const kids = poolFamilyChildren(state);
    expect(kids.map((k) => k.mode)).toEqual(["e621"]);
    expect(poolWatchChildren(state).map((k) => k.mode)).toEqual(["e621"]);
  });

  it("returns empty list browse when neither e621-family child is enabled", () => {
    const state = emptyState("unified");
    state.profiles.unified!.unifiedSites = {
      ...defaultUnifiedSites(),
      e621: false,
      e6ai: false,
    };
    expect(poolFamilyChildren(state)).toEqual([]);
    expect(poolWatchChildren(state).map((k) => k.mode)).toEqual(["inkbunny"]);
  });
});

describe("sortPoolsByOrder", () => {
  const sample = [
    {
      id: 1,
      name: "zeta",
      post_count: 10,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-06-01T00:00:00Z",
      originMode: "e621" as const,
    },
    {
      id: 2,
      name: "alpha",
      post_count: 50,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-06-01T00:00:00Z",
      originMode: "e6ai" as const,
    },
    {
      id: 3,
      name: "beta",
      post_count: 30,
      created_at: "2024-06-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      originMode: "e621" as const,
    },
  ];

  it("interleaves by updated_at newest first", () => {
    const sorted = sortPoolsByOrder(sample, "updated_at");
    expect(sorted.map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it("sorts by created_at and post_count", () => {
    expect(sortPoolsByOrder(sample, "created_at").map((p) => p.id)).toEqual([
      2, 3, 1,
    ]);
    expect(sortPoolsByOrder(sample, "post_count").map((p) => p.id)).toEqual([
      2, 3, 1,
    ]);
  });

  it("comparePoolsByOrder and poolTimestampMs helpers", () => {
    expect(poolTimestampMs("2024-01-01T00:00:00Z")).toBeGreaterThan(0);
    expect(poolTimestampMs("nope")).toBe(0);
    expect(comparePoolsByOrder(sample[1], sample[0], "name")).toBeLessThan(0);
  });
});
