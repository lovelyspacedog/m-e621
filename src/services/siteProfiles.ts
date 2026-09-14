import clone from "clone";
import { toRaw } from "vue";
import type { ISettingsServiceState, SiteMode, SiteProfile } from "./types";
import { BlacklistMode, SITE_MODE_URLS, UNGROUPED_FAVORITE_GROUP_ID } from "./types";

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
  searches: {
    entries: [],
  },
  history: {
    entries: [],
    maxLength: 100,
  },
});

export const profileFromMirrors = (state: ISettingsServiceState): SiteProfile => ({
  baseUrl: state.misc?.urls?.e621 || SITE_MODE_URLS[state.activeMode || "e621"],
  account: cloneRaw(state.account, emptyAccount()),
  favorites: cloneRaw(state.favorites, emptyFavorites()),
  blacklist: cloneRaw(state.blacklist, {
    mode: BlacklistMode.blur,
    tags: [],
    hideServerSideBlacklisted: false,
  }),
  searches: cloneRaw(state.searches, { entries: [] }),
  history: cloneRaw(state.history, { entries: [], maxLength: 100 }),
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
  state.account = cloneRaw(profile.account, emptyAccount());
  state.favorites = cloneRaw(profile.favorites, emptyFavorites());
  state.blacklist = cloneRaw(profile.blacklist, {
    mode: BlacklistMode.blur,
    tags: [],
    hideServerSideBlacklisted: false,
  });
  state.searches = cloneRaw(profile.searches, { entries: [] });
  state.history = cloneRaw(profile.history, { entries: [], maxLength: 100 });
  if (!state.misc) {
    state.misc = { urls: { e621: "", proxy: "" } };
  }
  if (!state.misc.urls) {
    state.misc.urls = { e621: "", proxy: "" };
  }
  state.misc.urls.e621 = profile.baseUrl || SITE_MODE_URLS[state.activeMode];
};
