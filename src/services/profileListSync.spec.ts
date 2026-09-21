import { describe, expect, it } from "vitest";
import {
  mergeBlacklistTags,
  mergeFavoriteTags,
  mergeSavedSearches,
  canCopySavedSearches,
  copyProfileLists,
} from "./profileListSync";
import { createEmptySiteProfile } from "./siteProfiles";
import {
  BlacklistMode,
  DataSaverType,
  FullscreenZoomUiMode,
  SITE_MODE_URLS,
  UNGROUPED_FAVORITE_GROUP_ID,
  UNGROUPED_SAVED_SEARCH_GROUP_ID,
  type ISettingsServiceState,
  type SiteMode,
} from "./types";

const blankState = (active: SiteMode = "e621"): ISettingsServiceState => {
  const profiles = Object.fromEntries(
    (Object.keys(SITE_MODE_URLS) as SiteMode[]).map((m) => [
      m,
      createEmptySiteProfile(m),
    ]),
  ) as ISettingsServiceState["profiles"];
  const activeProfile = profiles[active];
  return {
    configVersion: 31,
    activeMode: active,
    profiles,
    shortcuts: [],
    blacklist: structuredClone(activeProfile.blacklist),
    appearance: {
      primary: "",
      secondary: "",
      accent: "",
      toolbar: "",
      dark: true,
      transitions: true,
      coloredTags: true,
      coloredFavs: true,
      fullscreenZoomUiMode: FullscreenZoomUiMode.alwaysHide,
      navigationRail: false,
      logo: "paw",
    },
    misc: {
      urls: { e621: SITE_MODE_URLS[active], proxy: "" },
    },
    account: structuredClone(activeProfile.account),
    favorites: structuredClone(activeProfile.favorites),
    searches: structuredClone(activeProfile.searches),
    history: structuredClone(activeProfile.history),
    posts: {
      buttons: [],
      fullscreenButtons: [],
      detailsButtons: [],
      dataSaver: DataSaverType.auto,
      autoLoad: true,
      pageSize: 75,
      hideDetailsSidebar: false,
      hideBlacklisted: false,
    },
    savedPosts: { entries: [] },
    news: { readIds: [], saved: [], layout: "list" },
  } as unknown as ISettingsServiceState;
};

describe("mergeFavoriteTags", () => {
  it("appends missing tags into ungrouped", () => {
    const target = createEmptySiteProfile("e621").favorites;
    target.tags.push({
      id: "a",
      name: "wolf",
      category: "species",
      groupId: UNGROUPED_FAVORITE_GROUP_ID,
      order: 0,
    });
    const source = createEmptySiteProfile("furbooru").favorites;
    source.tags.push(
      {
        id: "b",
        name: "wolf",
        category: "species",
        groupId: UNGROUPED_FAVORITE_GROUP_ID,
        order: 0,
      },
      {
        id: "c",
        name: "fox",
        category: "species",
        groupId: UNGROUPED_FAVORITE_GROUP_ID,
        order: 1,
      },
    );
    expect(mergeFavoriteTags(target, source)).toBe(1);
    expect(target.tags.map((t) => t.name).sort()).toEqual(["fox", "wolf"]);
  });

  it("creates missing groups by name and keeps tags in them", () => {
    const target = createEmptySiteProfile("e621").favorites;
    const source = createEmptySiteProfile("e6ai").favorites;
    source.groups.push({
      id: "canines",
      name: "Canines",
      collapsed: false,
      order: 1,
    });
    source.tags.push({
      id: "c",
      name: "fox",
      category: "species",
      groupId: "canines",
      order: 0,
    });
    expect(mergeFavoriteTags(target, source)).toBe(1);
    const group = target.groups.find((g) => g.name === "Canines");
    expect(group).toBeTruthy();
    expect(target.tags.find((t) => t.name === "fox")?.groupId).toBe(group!.id);
  });
});

describe("mergeBlacklistTags", () => {
  it("unions unique lines", () => {
    const target = {
      mode: BlacklistMode.blur,
      tags: [["young"], ["gore rating:e"]],
      hideServerSideBlacklisted: false,
    };
    const source = {
      mode: BlacklistMode.hide,
      tags: [["young"], ["scat"], ["gore", "rating:e"]],
      hideServerSideBlacklisted: true,
    };
    expect(mergeBlacklistTags(target, source)).toBe(1);
    expect(target.mode).toBe(BlacklistMode.blur);
    expect(target.tags.map((l) => l.join(" ")).sort()).toEqual([
      "gore rating:e",
      "scat",
      "young",
    ]);
  });
});

describe("copyProfileLists", () => {
  it("merges favorites into the active mode mirrors", () => {
    const state = blankState("e621");
    state.profiles.furbooru.favorites.tags.push({
      id: "x",
      name: "dragon",
      category: "species",
      groupId: UNGROUPED_FAVORITE_GROUP_ID,
      order: 0,
    });
    const result = copyProfileLists(state, {
      from: "furbooru",
      to: "e621",
      kind: "favorites",
      mode: "merge",
    });
    expect(result.added).toBe(1);
    expect(state.favorites.tags.some((t) => t.name === "dragon")).toBe(true);
  });

  it("replaces blacklist on a non-active profile without touching mirrors", () => {
    const state = blankState("e621");
    state.blacklist.tags = [["keep-me"]];
    state.profiles.e621.blacklist.tags = [["keep-me"]];
    state.profiles.inkbunny.blacklist.tags = [["ib-only"]];
    const result = copyProfileLists(state, {
      from: "inkbunny",
      to: "furbooru",
      kind: "blacklist",
      mode: "replace",
    });
    expect(result.total).toBe(1);
    expect(state.profiles.furbooru.blacklist.tags).toEqual([["ib-only"]]);
    expect(state.blacklist.tags).toEqual([["keep-me"]]);
  });

  it("merges saved searches e621→e6ai and refuses FA→e621", () => {
    expect(canCopySavedSearches("e621", "e6ai")).toBe(true);
    expect(canCopySavedSearches("furaffinity", "e621")).toBe(false);

    const state = blankState("e6ai");
    state.profiles.e621.searches.entries.push({
      id: "s1",
      name: "wolves",
      tags: ["wolf", "score:>10"],
      groupId: UNGROUPED_SAVED_SEARCH_GROUP_ID,
      order: 0,
    });
    const result = copyProfileLists(state, {
      from: "e621",
      to: "e6ai",
      kind: "searches",
      mode: "merge",
    });
    expect(result.added).toBe(1);
    expect(state.searches.entries.some((e) => e.name === "wolves")).toBe(true);

    expect(() =>
      copyProfileLists(state, {
        from: "furaffinity",
        to: "e6ai",
        kind: "searches",
        mode: "merge",
      }),
    ).toThrow(/different query languages/);
  });
});

describe("mergeSavedSearches", () => {
  it("skips duplicate tag lists", () => {
    const target = createEmptySiteProfile("e621").searches;
    target.entries.push({
      id: "a",
      name: "a",
      tags: ["wolf"],
      groupId: UNGROUPED_SAVED_SEARCH_GROUP_ID,
      order: 0,
    });
    const source = createEmptySiteProfile("e6ai").searches;
    source.entries.push(
      {
        id: "b",
        name: "b",
        tags: ["wolf"],
        groupId: UNGROUPED_SAVED_SEARCH_GROUP_ID,
        order: 0,
      },
      {
        id: "c",
        name: "c",
        tags: ["dragon"],
        groupId: UNGROUPED_SAVED_SEARCH_GROUP_ID,
        order: 1,
      },
    );
    expect(mergeSavedSearches(target, source)).toBe(1);
    expect(target.entries).toHaveLength(2);
  });
});
