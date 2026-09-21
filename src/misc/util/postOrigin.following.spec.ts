import { describe, expect, it } from "vitest";
import { buildUnifiedFetchArgs } from "./postOrigin";
import { createEmptySiteProfile } from "@/services/siteProfiles";
import type { ISettingsServiceState } from "@/services/types";
import { defaultSettings } from "@/services/defaultSettings";
import clone from "clone";

const baseState = (): ISettingsServiceState => {
  const state = clone(defaultSettings) as ISettingsServiceState;
  state.activeMode = "unified";
  state.profiles.unified = createEmptySiteProfile("unified");
  return state;
};

describe("buildUnifiedFetchArgs following source", () => {
  it("filters to following-capable children when feedSource is following", () => {
    const state = baseState();
    state.profiles.unified!.unifiedFeedSource = "following";
    state.profiles.unified!.unifiedSites = {
      e621: true,
      e6ai: true,
      furbooru: true,
      inkbunny: true,
      furaffinity: true,
      weasyl: true,
      itaku: true,
      sofurry: true,
    };
    const args = buildUnifiedFetchArgs(state);
    expect(args.feedSource).toBe("following");
    expect(args.children.map((c) => c.mode).sort()).toEqual([
      "furaffinity",
      "inkbunny",
      "itaku",
      "sofurry",
    ]);
  });

  it("includeDisabled ignores following filter for bookmark fetches", () => {
    const state = baseState();
    state.profiles.unified!.unifiedFeedSource = "following";
    const args = buildUnifiedFetchArgs(state, { includeDisabled: true });
    expect(args.children.length).toBeGreaterThan(4);
    expect(args.children.some((c) => c.mode === "e621")).toBe(true);
  });

  it("forceAllEnabledChildren keeps all enabled sites under Following (Suggester/Analyzer)", () => {
    const state = baseState();
    state.profiles.unified!.unifiedFeedSource = "following";
    state.profiles.unified!.unifiedSites = {
      e621: true,
      e6ai: true,
      furbooru: true,
      inkbunny: true,
      furaffinity: true,
      weasyl: true,
      itaku: true,
      sofurry: true,
    };
    const args = buildUnifiedFetchArgs(state, {
      forceAllEnabledChildren: true,
    });
    expect(args.feedSource).toBe("following");
    expect(args.children.map((c) => c.mode).sort()).toEqual([
      "e621",
      "e6ai",
      "furaffinity",
      "furbooru",
      "inkbunny",
      "itaku",
      "sofurry",
      "weasyl",
    ]);
  });

  it("forceAllEnabledChildren still honors disabled site toggles", () => {
    const state = baseState();
    state.profiles.unified!.unifiedFeedSource = "following";
    state.profiles.unified!.unifiedSites = {
      e621: true,
      e6ai: false,
      furbooru: true,
      inkbunny: true,
      furaffinity: true,
      weasyl: false,
      itaku: true,
      sofurry: true,
    };
    const args = buildUnifiedFetchArgs(state, {
      forceAllEnabledChildren: true,
    });
    expect(args.children.map((c) => c.mode).sort()).toEqual([
      "e621",
      "furaffinity",
      "furbooru",
      "inkbunny",
      "itaku",
      "sofurry",
    ]);
  });
});
