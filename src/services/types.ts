export enum BlacklistMode {
  hide,
  blur,
  blackout,
}

export type ButtonType =
  | "info"
  | "fullscreen"
  | "external"
  | "favorite"
  | "bookmark"
  | "save_local"
  | "fluffle";

export enum FullscreenZoomUiMode {
  alwaysHide,
  neverHide,
  hideWhileZoomed,
}

export enum DataSaverType {
  auto,
  highest,
  medium,
  lowest,
}

export type Action =
  | "fullscreen_add_favorite"
  | "fullscreen_remove_favorite"
  | "fullscreen_toggle_favorite"
  | "fullscreen_next_post"
  | "fullscreen_previous_post"
  | "fullscreen_exit"
  | "fullscreen_slideshow_toggle"
  | "fullscreen_open_source"
  | "go_to_posts"
  | "go_to_settings"
  | "navigate_back"
  | "navigate_forward"
  | "focus_search";

export interface Shortcut {
  sequence: string;
  action: Action;
}

export interface SavedSearchGroup {
  id: string;
  name: string;
  collapsed: boolean;
  order: number;
}

export interface SavedSearchEntry {
  id: string;
  name: string;
  tags: string[];
  groupId: string;
  order: number;
}

export const UNGROUPED_FAVORITE_GROUP_ID = "ungrouped";
export const UNGROUPED_SAVED_SEARCH_GROUP_ID = "ungrouped";

export type SiteMode = "e621" | "e6ai" | "local" | "tailspace" | "furbooru" | "inkbunny" | "furaffinity" | "weasyl" | "itaku" | "sofurry" | "unified";

export type UnifiedChildMode = "e621" | "e6ai" | "furbooru" | "inkbunny" | "furaffinity" | "weasyl" | "itaku" | "sofurry";

export interface SavedPostEntry {
  originMode: UnifiedChildMode;
  id: number;
  savedAt: number;
}

export const UNIFIED_CHILD_MODES: UnifiedChildMode[] = [
  "e621",
  "e6ai",
  "furbooru",
  "inkbunny",
  "furaffinity",
  "weasyl",
  "itaku",
  "sofurry",
];

export type UnifiedSites = Record<UnifiedChildMode, boolean>;

export const defaultUnifiedSites = (): UnifiedSites => ({
  e621: true,
  e6ai: true,
  furbooru: true,
  inkbunny: true,
  furaffinity: true,
  weasyl: false,
  itaku: false,
  sofurry: true,
});

export const SITE_MODE_URLS: Record<SiteMode, string> = {
  e621: "https://e621.net/",
  e6ai: "https://e6ai.net/",
  local: "",
  tailspace: "https://tailspace.com/",
  furbooru: "https://furbooru.org/",
  inkbunny: "https://inkbunny.net/",
  furaffinity: "https://www.furaffinity.net/",
  weasyl: "https://www.weasyl.com/",
  itaku: "https://itaku.ee/",
  sofurry: "https://www.sofurry.com/",
  unified: "",
};

export interface FavoriteTagGroup {
  id: string;
  name: string;
  collapsed: boolean;
  order: number;
}

export interface FavoriteTagEntry {
  id: string;
  name: string;
  category: string;
  display?: string;
  groupId: string;
  order: number;
}

export interface SiteProfile {
  baseUrl: string;
  account: {
    username: string | null;
    /** FurAffinity stores cookies as `a=…;b=…`. Other sites store API key / session. */
    apiKey: string | null;
    /** Inkbunny member user_id (not used on other sites). */
    userId?: number | null;
  };
  favorites: {
    groups: FavoriteTagGroup[];
    tags: FavoriteTagEntry[];
  };
  blacklist: {
    mode: BlacklistMode;
    tags: string[][];
    hideServerSideBlacklisted: boolean;
  };
  searches: {
    groups: SavedSearchGroup[];
    entries: SavedSearchEntry[];
  };
  history: {
    entries: string[][];
    maxLength: number;
  };
  /** Which backends Unified mode queries. Only used on the unified profile. */
  unifiedSites?: UnifiedSites;
}

// export interface FavoritedSearch {
//   tags: string[];
//   firstPost?: number;
// }

export interface ISettingsServiceState {
  configVersion: undefined | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31;
  activeMode: SiteMode;
  profiles: Record<SiteMode, SiteProfile>;
  shortcuts: Shortcut[];
  blacklist: {
    mode: BlacklistMode;
    tags: string[][];
    hideServerSideBlacklisted: boolean;
  };
  appearance: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    sidebar: string;
    toolbar: string;
    dark: boolean;
    transition: {
      route: string;
      fullscreen: string;
    };
    coloredRatingStripe: boolean;
    navigationType: "sidebar" | "toolbar" | "floating";
    logoStyle: "face" | "text";
    hideInstallPrompt: boolean;
    hideGithubInfo: boolean;
    hideMigrationInfo: boolean;
  };
  history: {
    entries: string[][];
    maxLength: number;
  };
  searches: {
    groups: SavedSearchGroup[];
    entries: SavedSearchEntry[];
  };
  snackbar: string | null;
  posts: {
    buttons: ButtonType[];
    fullscreenButtons: ButtonType[];
    detailsButtons: ButtonType[];
    fullscreenZoomUiMode: FullscreenZoomUiMode;
    sidebarSuggestionLimit: number;
    postListFetchLimit: number;
    tagFetchLimit: number;
    goFullscreen: boolean;
    dataSaver: DataSaverType;
    lazyLoadImages: boolean;
    autoLoadNext: boolean;
    fullWidthFeed: boolean;
    feedLayout: "list" | "grid";
    slideshowIntervalMs: number;
    cardAutoNext: boolean;
    cardAutoNextIntervalMs: number;
    compactCards: boolean;
    /** Collapse posts toolbar actions into a ⋮ menu on all widths (not only mdAndDown). */
    alwaysCollapseToolbar: boolean;
    videoVolume: number;
    videoMuted: boolean;
    videoPlaybackRate: number;
    /** Load full GIF file.url in feed so previews animate (sample/preview are still). */
    animateFeedGifs: boolean;
    /** Autoplay looped video while the feed card is on screen. */
    autoplayFeedVideo: boolean;
    /** Force mute during feed autoplay (helps browser autoplay policies). */
    autoplayFeedVideoSilent: boolean;
    saveLocal: {
      pathTemplate: string;
      directoryName: string | null;
      /** After a folder save, jump to Local mode on that file. */
      openInLocalAfterSave: boolean;
    };
    localDirectoryName: string | null;
  };
  /** Mode-independent local bookmarks (federated child modes + Unified). Not under profiles. */
  savedPosts: {
    entries: SavedPostEntry[];
  };
  favorites: {
    groups: FavoriteTagGroup[];
    tags: FavoriteTagEntry[];
  };
  account: {
    username: string | null;
    apiKey: string | null;
    userId?: number | null;
  };
  misc: {
    urls: {
      proxy: string;
      e621: string;
    };
  };
}
