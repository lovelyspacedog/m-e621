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
  ...(mode === "unified"
    ? {
        unifiedSites: defaultUnifiedSites(),
        unifiedFeedSource: "search" as const,
        unifiedIncludeTailspaceComics: true,
      }
    : {}),
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
    unifiedFeedSource:
      existing?.unifiedFeedSource ||
      (state.activeMode === "unified" ? "search" : undefined),
    unifiedIncludeTailspaceComics:
      existing?.unifiedIncludeTailspaceComics ??
      (state.activeMode === "unified" ? true : undefined),
  };
};

/** Copy active mirrors into profiles[activeMode]. */
export const syncMirrorsToActiveProfile = (state: ISettingsServiceState) => {
  if (!state.profiles || !state.activeMode) return;
  state.profiles[state.activeMode] = profileFromMirrors(state);
};

/** Alias preferred by FEATURES / agents — same as syncMirrorsToActiveProfile. */
export const syncActiveProfileFromLive = syncMirrorsToActiveProfile;

/**
 * Display-only: profile has reusable auth material (passwords are never stored).
 * Does not probe the network. Host-wide FA_COOKIE_* is invisible here.
 */
export const profileHasAuthMaterial = (
  mode: SiteMode,
  account: {
    username?: string | null;
    apiKey?: string | null;
    userId?: number | null;
  } | null | undefined,
): boolean => {
  if (!account) return false;
  const key = (account.apiKey || "").trim();
  const user = (account.username || "").trim();
  switch (mode) {
    case "furbooru":
    case "weasyl":
      return !!key;
    case "e621":
    case "e6ai":
      return !!user && !!key;
    case "inkbunny":
      return !!key; // SID; userId optional metadata
    case "furaffinity":
      return !!key; // a=…;b=… cookies
    case "itaku":
      return !!key; // Authorization token
    case "sofurry":
      return !!key; // session cookies
    case "tailspace":
      return !!key; // session cookie
    default:
      return false;
  }
};

export const ensureSiteProfile = (
  state: ISettingsServiceState,
  mode: SiteMode,
): SiteProfile => {
  if (!state.profiles[mode]) {
    state.profiles[mode] = createEmptySiteProfile(mode);
  }
  return state.profiles[mode];
};

/** Active site uses live mirrors; others read their stored profile. */
export const liveAccount = (
  state: ISettingsServiceState,
  mode: SiteMode,
): SiteProfile["account"] => {
  if (state.activeMode === mode) return state.account;
  return ensureSiteProfile(state, mode).account;
};

export const setLiveAccount = (
  state: ISettingsServiceState,
  mode: SiteMode,
  patch: Partial<SiteProfile["account"]>,
) => {
  const profile = ensureSiteProfile(state, mode);
  Object.assign(profile.account, patch);
  if (state.activeMode === mode) {
    Object.assign(state.account, patch);
  }
};

export const liveBaseUrl = (state: ISettingsServiceState, mode: SiteMode) => {
  if (state.activeMode === mode) {
    return state.misc?.urls?.e621 || ensureSiteProfile(state, mode).baseUrl || SITE_MODE_URLS[mode];
  }
  return ensureSiteProfile(state, mode).baseUrl || SITE_MODE_URLS[mode];
};

export const setLiveBaseUrl = (
  state: ISettingsServiceState,
  mode: SiteMode,
  value: string,
) => {
  const profile = ensureSiteProfile(state, mode);
  profile.baseUrl = value;
  if (
    state.activeMode === mode ||
    (state.activeMode === "unified" && mode === "e621")
  ) {
    if (!state.misc) state.misc = { urls: { e621: "", proxy: "" } };
    if (!state.misc.urls) state.misc.urls = { e621: "", proxy: "" };
    state.misc.urls.e621 = value;
  }
};

export const liveSearches = (
  state: ISettingsServiceState,
  mode: SiteMode,
): SiteProfile["searches"] => {
  if (state.activeMode === mode) return state.searches;
  return ensureSiteProfile(state, mode).searches;
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
