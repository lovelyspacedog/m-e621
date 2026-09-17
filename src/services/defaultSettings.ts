import type { ISettingsServiceState, Shortcut } from "./types";
import { BlacklistMode, DataSaverType, FullscreenZoomUiMode } from "./types";
import { createEmptySiteProfile, profileFromMirrors } from "./siteProfiles";

export const focusSearchShortcut: Shortcut = {
  action: "focus_search",
  sequence: "/",
};

export const fullscreenFavoriteShortcuts: Shortcut[] = [
  {
    action: "fullscreen_add_favorite",
    sequence: "a f",
  },
  {
    action: "fullscreen_remove_favorite",
    sequence: "r f",
  },
  {
    action: "fullscreen_toggle_favorite",
    sequence: "t f",
  },
];

export const fullscreenSlideshowShortcut: Shortcut = {
  action: "fullscreen_slideshow_toggle",
  sequence: "space",
};

export const historyNavigationShortcuts: Shortcut[] = [
  { action: "navigate_back", sequence: "alt+left" },
  { action: "navigate_forward", sequence: "alt+right" },
];

export const defaultSettings: ISettingsServiceState = {
  configVersion: 41,
  activeMode: "e621",
  profiles: {
    e621: createEmptySiteProfile("e621"),
    e6ai: createEmptySiteProfile("e6ai"),
    local: createEmptySiteProfile("local"),
    tailspace: createEmptySiteProfile("tailspace"),
    furbooru: createEmptySiteProfile("furbooru"),
    inkbunny: createEmptySiteProfile("inkbunny"),
    furaffinity: createEmptySiteProfile("furaffinity"),
    weasyl: createEmptySiteProfile("weasyl"),
    itaku: createEmptySiteProfile("itaku"),
    sofurry: createEmptySiteProfile("sofurry"),
    unified: createEmptySiteProfile("unified"),
  },
  shortcuts: [
    { action: "go_to_posts", sequence: "g p" },
    { action: "go_to_settings", sequence: "g s" },
    ...historyNavigationShortcuts,

    { action: "focus_search", sequence: "f s" },
    focusSearchShortcut,

    { action: "fullscreen_exit", sequence: "esc" },

    { action: "fullscreen_exit", sequence: "down" },
    { action: "fullscreen_next_post", sequence: "right" },
    { action: "fullscreen_previous_post", sequence: "left" },

    { action: "fullscreen_exit", sequence: "s" },
    { action: "fullscreen_next_post", sequence: "d" },
    { action: "fullscreen_previous_post", sequence: "a" },

    { action: "fullscreen_next_post", sequence: "j" },
    { action: "fullscreen_previous_post", sequence: "k" },

    { action: "fullscreen_open_source", sequence: "o" },

    ...fullscreenFavoriteShortcuts,
    fullscreenSlideshowShortcut,
  ],
  blacklist: {
    mode: BlacklistMode.blur,
    tags: [],
    hideServerSideBlacklisted: false,
  },
  appearance: {
    primary: "#1976d2",
    secondary: "#001325",
    accent: "#82b1ff",
    background: "#102442",
    sidebar: "#001325",
    toolbar: "#020c1c",
    dark: true,
    colorScheme: "dark",
    transition: {
      fullscreen: "slide",
      route: "fade",
    },
    coloredRatingStripe: true,
    navigationType: "sidebar",
    logoStyle: "face",
    hideInstallPrompt: false,
    hideGithubInfo: false,
    hideMigrationInfo: false,
    pawCursor: true,
  },
  history: {
    entries: [],
    maxLength: 100,
  },
  searches: {
    groups: [
      {
        id: "ungrouped",
        name: "Ungrouped",
        collapsed: false,
        order: 0,
      },
    ],
    entries: [
      {
        id: "default-hot",
        name: "Hot",
        tags: ["order:rank"],
        groupId: "ungrouped",
        order: 0,
      },
      {
        id: "default-popular-today",
        name: "Popular Today",
        tags: ["order:favcount", "date:today"],
        groupId: "ungrouped",
        order: 1,
      },
    ],
  },
  snackbar: null,
  account: {
    apiKey: null,
    username: null,
    userId: null,
  },
  savedPosts: {
    entries: [],
  },
  watchedPools: {
    entries: [],
  },
  posts: {
    buttons: ["info", "fullscreen", "external", "favorite", "bookmark", "save_local", "fluffle"],
    fullscreenButtons: ["external", "info", "favorite", "bookmark", "save_local"],
    detailsButtons: ["external", "favorite", "bookmark", "save_local"],
    fullscreenZoomUiMode: FullscreenZoomUiMode.hideWhileZoomed,
    postListFetchLimit: 30,
    sidebarSuggestionLimit: 12,
    tagFetchLimit: 30,
    goFullscreen: false,
    dataSaver: DataSaverType.auto,
    lazyLoadImages: true,
    autoLoadNext: true,
    fullWidthFeed: false,
    feedLayout: "list",
    slideshowIntervalMs: 15000,
    cardAutoNext: false,
    cardAutoNextIntervalMs: 15000,
    compactCards: false,
    alwaysCollapseToolbar: false,
    videoVolume: 1,
    videoMuted: true,
    videoPlaybackRate: 1,
    playbackPrefs: {},
    animateFeedGifs: true,
    autoplayFeedVideo: true,
    autoplayFeedVideoSilent: true,
    saveLocal: {
      pathTemplate: "%artist%/%tags 1-5%.%ext%",
      directoryName: null,
      openInLocalAfterSave: false,
    },
    localDirectoryName: null,
  },
  artistDashboard: {
    recentArtists: [],
  },
  favorites: {
    groups: [
      {
        id: "ungrouped",
        name: "Ungrouped",
        collapsed: false,
        order: 0,
      },
    ],
    tags: [],
  },
  misc: {
    urls: {
      e621: "https://e621.net/",
      proxy: "/api/",
    },
    debugLogging: true,
  },
};

// Seed e621 profile from mirrors (includes Hot / Popular searches); e6ai and local stay empty.
defaultSettings.profiles.e621 = profileFromMirrors(defaultSettings);
defaultSettings.profiles.e6ai = createEmptySiteProfile("e6ai");
defaultSettings.profiles.local = createEmptySiteProfile("local");
defaultSettings.profiles.tailspace = createEmptySiteProfile("tailspace");
defaultSettings.profiles.furbooru = createEmptySiteProfile("furbooru");
defaultSettings.profiles.inkbunny = createEmptySiteProfile("inkbunny");
defaultSettings.profiles.furaffinity = createEmptySiteProfile("furaffinity");
defaultSettings.profiles.unified = createEmptySiteProfile("unified");
