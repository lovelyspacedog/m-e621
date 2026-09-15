import clone from "clone";
import { toRaw } from "vue";
import type { ISettingsServiceState, SiteMode, SiteProfile } from "./types";
import { BlacklistMode, SITE_MODE_URLS, UNGROUPED_FAVORITE_GROUP_ID, defaultUnifiedSites } from "./types";
import { emptySavedSearchGroups, normalizeSavedSearches } from "./savedSearchNormalize";

const cloneRaw = <T>(value: T, fallback: T): T => {
  if (value == null) return clone(fallback);
  return clone(toRaw(value));
};

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

const emptySearches = (): SiteProfile["searches"] => ({
  groups: emptySavedSearchGroups(),
  entries: [],
});

const emptyAccount = (): SiteProfile["account"] => ({
  username: null,
  apiKey: null,
  userId: null,
});

export const createEmptySiteProfile = (mode: SiteMode): SiteProfile => ({
  baseUrl: SITE_MODE_URLS[mode],
  account: emptyAccount(),
  favorites: emptyFavorites(),
  blacklist: {
    mode: BlacklistMode.blur,
    tags: [],
    hideServerSideBlacklisted: false,
  },
  searches: emptySearches(),
  history: {
    entries: [],
    maxLength: 100,
  },
  ...(mode === "unified" ? { unifiedSites: defaultUnifiedSites() } : {}),
});

export const profileFromMirrors = (state: ISettingsServiceState): SiteProfile => {
  const existing = state.profiles?.[state.activeMode];
  return {
    baseUrl: state.misc?.urls?.e621 || SITE_MODE_URLS[state.activeMode || "e621"],
    account: cloneRaw(state.account, emptyAccount()),
    favorites: cloneRaw(state.favorites, emptyFavorites()),
    blacklist: cloneRaw(state.blacklist, {
      mode: BlacklistMode.blur,
      tags: [],
      hideServerSideBlacklisted: false,
    }),
    searches: normalizeSavedSearches(cloneRaw(state.searches, emptySearches())),
    history: cloneRaw(state.history, { entries: [], maxLength: 100 }),
    unifiedSites:
      existing?.unifiedSites ||
      (state.activeMode === "unified" ? defaultUnifiedSites() : undefined),
  };
};

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
  state.account = cloneRaw(profile.account, emptyAccount());
  state.favorites = cloneRaw(profile.favorites, emptyFavorites());
  state.blacklist = cloneRaw(profile.blacklist, {
    mode: BlacklistMode.blur,
    tags: [],
    hideServerSideBlacklisted: false,
  });
  state.searches = normalizeSavedSearches(cloneRaw(profile.searches, emptySearches()));
  state.history = cloneRaw(profile.history, { entries: [], maxLength: 100 });
  if (!state.misc) {
    state.misc = { urls: { e621: "", proxy: "" } };
  }
  if (!state.misc.urls) {
    state.misc.urls = { e621: "", proxy: "" };
  }
  // Unified has no single host; keep e621's URL for tag autocomplete.
  state.misc.urls.e621 =
    state.activeMode === "unified"
      ? state.profiles.e621?.baseUrl || SITE_MODE_URLS.e621
      : profile.baseUrl || SITE_MODE_URLS[state.activeMode];
};
