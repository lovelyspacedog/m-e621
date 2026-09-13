import clone from "clone";
import type { ISettingsServiceState, SiteMode, SiteProfile } from "./types";
import { BlacklistMode, SITE_MODE_URLS, UNGROUPED_FAVORITE_GROUP_ID } from "./types";

const emptyFavorites = () => ({
  groups: [
    {
      id: UNGROUPED_FAVORITE_GROUP_ID,
      name: "Ungrouped",
      collapsed: false,
      order: 0,
    },
  ],
  tags: [] as SiteProfile["favorites"]["tags"],
});

export const createEmptySiteProfile = (mode: SiteMode): SiteProfile => ({
  baseUrl: SITE_MODE_URLS[mode],
  account: {
    username: null,
    apiKey: null,
  },
  favorites: emptyFavorites(),
  blacklist: {
    mode: BlacklistMode.blur,
    tags: [],
    hideServerSideBlacklisted: false,
  },
  searches: {
    entries: [],
  },
  history: {
    entries: [],
    maxLength: 100,
  },
});

export const profileFromMirrors = (state: ISettingsServiceState): SiteProfile =>
  clone({
    baseUrl: state.misc.urls.e621 || SITE_MODE_URLS[state.activeMode || "e621"],
    account: state.account,
    favorites: state.favorites,
    blacklist: state.blacklist,
    searches: state.searches,
    history: state.history,
  });

/** Copy active mirrors into profiles[activeMode]. */
export const syncMirrorsToActiveProfile = (state: ISettingsServiceState) => {
  if (!state.profiles || !state.activeMode) return;
  state.profiles[state.activeMode] = profileFromMirrors(state);
};

/** Load profiles[activeMode] into top-level mirrors used by existing stores. */
export const applyActiveProfileToMirrors = (state: ISettingsServiceState) => {
  if (!state.profiles || !state.activeMode) return;
  const profile = state.profiles[state.activeMode] || createEmptySiteProfile(state.activeMode);
  state.profiles[state.activeMode] = profile;
  state.account = clone(profile.account);
  state.favorites = clone(profile.favorites);
  state.blacklist = clone(profile.blacklist);
  state.searches = clone(profile.searches);
  state.history = clone(profile.history);
  state.misc.urls.e621 = profile.baseUrl || SITE_MODE_URLS[state.activeMode];
};
