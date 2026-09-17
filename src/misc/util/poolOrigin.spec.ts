import { describe, expect, it } from "vitest";
import {
  isPoolOriginMode,
  parsePoolOriginQuery,
  poolFamilyChildren,
  poolKey,
  poolRouteQuery,
  resolvePoolOrigin,
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
    expect(parsePoolOriginQuery(["e6ai"])).toBe("e6ai");
    expect(parsePoolOriginQuery("furbooru")).toBeNull();
    expect(parsePoolOriginQuery(undefined)).toBeNull();
  });

  it("requires origin in Federated; falls back on e621-family", () => {
    expect(resolvePoolOrigin("e6ai", "unified")).toBe("e6ai");
    expect(resolvePoolOrigin(undefined, "unified")).toBeNull();
    expect(resolvePoolOrigin(undefined, "e621")).toBe("e621");
    expect(resolvePoolOrigin("e6ai", "e621")).toBe("e6ai");
    expect(resolvePoolOrigin(undefined, "inkbunny")).toBeNull();
  });

  it("poolKey and route query", () => {
    expect(poolKey("e621", 12)).toBe("e621:12");
    expect(poolRouteQuery("e6ai", { post: "3" })).toEqual({
      origin: "e6ai",
      post: "3",
    });
    expect(poolRouteQuery(null)).toEqual({});
    expect(isPoolOriginMode("e621")).toBe(true);
    expect(isPoolOriginMode("unified")).toBe(false);
  });
});

describe("poolFamilyChildren", () => {
  it("returns the active e621-family site alone", () => {
    const kids = poolFamilyChildren(emptyState("e621"));
    expect(kids).toHaveLength(1);
    expect(kids[0].mode).toBe("e621");
    expect(kids[0].baseUrl).toBe(SITE_MODE_URLS.e621);
  });

  it("fans out to enabled Federated e621/e6ai children", () => {
    const state = emptyState("unified");
    const kids = poolFamilyChildren(state);
    expect(kids.map((k) => k.mode)).toEqual(["e621", "e6ai"]);
  });

  it("omits disabled Federated pool children", () => {
    const state = emptyState("unified");
    state.profiles.unified!.unifiedSites = {
      ...defaultUnifiedSites(),
      e6ai: false,
    };
    const kids = poolFamilyChildren(state);
    expect(kids.map((k) => k.mode)).toEqual(["e621"]);
  });

  it("returns empty when neither pool child is enabled", () => {
    const state = emptyState("unified");
    state.profiles.unified!.unifiedSites = {
      ...defaultUnifiedSites(),
      e621: false,
      e6ai: false,
    };
    expect(poolFamilyChildren(state)).toEqual([]);
  });
});
