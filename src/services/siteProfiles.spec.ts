import { describe, expect, it } from "vitest";
import clone from "clone";
import { defaultSettings } from "./defaultSettings";
import {
  applyActiveProfileToMirrors,
  createEmptySiteProfile,
  profileHasAuthMaterial,
  syncActiveProfileFromLive,
} from "./siteProfiles";
import type { ISettingsServiceState } from "./types";

const fresh = (): ISettingsServiceState => {
  const state = clone(defaultSettings) as ISettingsServiceState;
  state.profiles.e621 = createEmptySiteProfile("e621");
  state.profiles.furbooru = createEmptySiteProfile("furbooru");
  state.activeMode = "e621";
  applyActiveProfileToMirrors(state);
  return state;
};

describe("syncActiveProfileFromLive / applyActiveProfileToMirrors", () => {
  it("round-trips live blacklist into the active profile and back", () => {
    const state = fresh();
    state.blacklist.tags = [["fox"], ["dog"]];
    syncActiveProfileFromLive(state);
    expect(state.profiles.e621.blacklist.tags).toEqual([["fox"], ["dog"]]);

    state.activeMode = "furbooru";
    applyActiveProfileToMirrors(state);
    expect(state.blacklist.tags).toEqual([]);

    state.activeMode = "e621";
    applyActiveProfileToMirrors(state);
    expect(state.blacklist.tags).toEqual([["fox"], ["dog"]]);
  });

  it("preserves the other profile while editing the live slice", () => {
    const state = fresh();
    state.profiles.furbooru.blacklist.tags = [["pony"]];
    state.blacklist.tags = [["fox"]];
    syncActiveProfileFromLive(state);
    expect(state.profiles.furbooru.blacklist.tags).toEqual([["pony"]]);
    expect(state.profiles.e621.blacklist.tags).toEqual([["fox"]]);
  });
});

describe("profileHasAuthMaterial", () => {
  it("matches per-mode credential shapes without probing", () => {
    expect(profileHasAuthMaterial("furbooru", { apiKey: "k" })).toBe(true);
    expect(profileHasAuthMaterial("e621", { username: "u", apiKey: "k" })).toBe(
      true,
    );
    expect(profileHasAuthMaterial("e621", { username: "u", apiKey: "" })).toBe(
      false,
    );
    expect(
      profileHasAuthMaterial("furaffinity", { apiKey: "a=1;b=2" }),
    ).toBe(true);
    expect(profileHasAuthMaterial("inkbunny", { apiKey: "sid" })).toBe(true);
    expect(profileHasAuthMaterial("local", { apiKey: "x" })).toBe(false);
  });
});
