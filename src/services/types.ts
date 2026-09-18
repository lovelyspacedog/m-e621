export enum BlacklistMode {
  hide,
  blur,
  blackout,
}

export type ButtonType = "info" | "fullscreen" | "external" | "favorite" | "bookmark" | "save_local" | "fluffle";

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

export type SiteMode = "e621" | "e6ai" | "local" | "tailspace" | "flayrah" | "furbooru" | "inkbunny" | "furaffinity" | "weasyl" | "itaku" | "sofurry" | "unified";

export type UnifiedChildMode = "e621" | "e6ai" | "furbooru" | "inkbunny" | "furaffinity" | "weasyl" | "itaku" | "sofurry";

export interface SavedPostEntry {
  originMode: UnifiedChildMode;
  id: number;
  savedAt: number;
}

export interface FlayrahSavedArticle {
  id: number;
  title: string;
  link: string;
  author: string;
  thumbUrl: string | null;
  savedAt: number;
}

export type FlayrahFeedLayout = "list" | "magazine";

export interface FlayrahNewsState {
  /** MRU article ids marked read (capped). */
  readIds: number[];
  saved: FlayrahSavedArticle[];
  layout: FlayrahFeedLayout;
}

export type PoolOriginMode = "e621" | "e6ai";

/** Federated Pools browse rows — Tailspace comics join name browse only. */
export type PoolBrowseOrigin = PoolOriginMode | "tailspace";

export interface WatchedPoolEntry {
  originMode: PoolOriginMode;
  id: number;
  watchedAt: number;
  /** Post count when last opened (or when watch was added). Used for "new pages" badges. */
  lastSeenPostCount?: number;
  /** Pool `updated_at` ISO when last opened / watched. */
  lastSeenUpdatedAt?: string;
}

/** Local Tailspace comic watch (not Tailspace-server bookmarks). */
export interface WatchedComicEntry {
  id: number;
  /** Comic slug for `/tailspace/comic/:name` and `getComic`. */
  name: string;
  watchedAt: number;
  /** Page count when last opened (or when watch was added). Used for +N badges. */
  lastSeenPageCount?: number;
  /** Comic `updated` ISO when last opened / watched. */
  lastSeenUpdatedAt?: string;
}

export const UNIFIED_CHILD_MODES: UnifiedChildMode[] = ["e621", "e6ai", "furbooru", "inkbunny", "furaffinity", "weasyl", "itaku", "sofurry"];

export type UnifiedSites = Record<UnifiedChildMode, boolean>;

/** Unified Posts feed: tag search vs following/watch merge. */
export type UnifiedFeedSource = "search" | "following";

export const defaultUnifiedSites = (): UnifiedSites => ({
  e621: true,
  e6ai: true,
  furbooru: true,
  inkbunny: true,
  furaffinity: true,
  weasyl: true,
  itaku: true,
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
  flayrah: "https://www.flayrah.com/",
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
  /** Unified Posts source: tag search (default) or following/watch merge. */
  unifiedFeedSource?: UnifiedFeedSource;
  /**
   * Federated Pools name browse: also merge Tailspace comics.
   * Independent of Defaults / Auth-only presets. Default true.
   */
  unifiedIncludeTailspaceComics?: boolean;
}

// export interface FavoritedSearch {
//   tags: string[];
//   firstPost?: number;
// }

export type PlaybackMediaKind = "video" | "audio";

export type PlaybackPrefSlice = {
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
};

/** Optional HTML5 playback overrides. SWF/Ruffle not covered. */
export type PlaybackPrefs = {
  byKind?: Partial<Record<PlaybackMediaKind, PlaybackPrefSlice>>;
  byOrigin?: Partial<Record<SiteMode, PlaybackPrefSlice>>;
};

export interface ISettingsServiceState {
  configVersion:
    | undefined
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20
    | 21
    | 22
    | 23
    | 24
    | 25
    | 26
    | 27
    | 28
    | 29
    | 30
    | 31
    | 32
    | 33
    | 34
    | 35
    | 36
    | 37
    | 38
    | 39
    | 40
    | 41
    | 42
    | 43
    | 44
    | 45
    | 46;
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
    /**
     * When `"system"`, follow `prefers-color-scheme` and keep `dark` in sync.
     * Theme presets set `"dark"` / `"light"`.
     */
    colorScheme: "system" | "dark" | "light";
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
    /**
     * Tip dialog ids the user chose “Don't show this again” for.
     * Cleared by Appearance → Reset tooltips.
     */
    dismissedTips: Record<string, boolean>;
    pawCursor: boolean;
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
    /**
     * Optional HTML5 playback overrides by media kind and/or origin.
     * Missing keys fall back to videoVolume / videoMuted / videoPlaybackRate.
     * SWF/Ruffle is not covered (TODO).
     */
    playbackPrefs: PlaybackPrefs;
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
  /** Flayrah news read-state, saved articles, and feed layout. Not under profiles. */
  flayrahNews: FlayrahNewsState;
  /** Mode-independent registry; views filter entries by their origin site. */
  watchedPools: {
    entries: WatchedPoolEntry[];
  };
  /** Local Tailspace comic watches with new-page badges. Not under profiles. */
  watchedComics: {
    entries: WatchedComicEntry[];
  };
  /** Recently viewed e621-family artist dashboard tags (MRU). */
  artistDashboard: {
    recentArtists: string[];
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
    /**
     * When false, silences main-thread `debug()` console logs in production.
     * Synced to localStorage; workers keep previous logging behavior.
     */
    debugLogging: boolean;
  };
}
