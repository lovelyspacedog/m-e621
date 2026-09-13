export enum BlacklistMode {
  hide,
  blur,
  blackout,
}

export type ButtonType = "info" | "fullscreen" | "external" | "favorite" | "save_local";

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
  | "go_to_posts"
  | "go_to_settings"
  | "focus_search";

export interface Shortcut {
  sequence: string;
  action: Action;
}

export interface SavedSearchEntry {
  name: string;
  tags: string[];
}

export const UNGROUPED_FAVORITE_GROUP_ID = "ungrouped";

export type SiteMode = "e621" | "e6ai" | "local";

export const SITE_MODE_URLS: Record<SiteMode, string> = {
  e621: "https://e621.net/",
  e6ai: "https://e6ai.net/",
  local: "",
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
    apiKey: string | null;
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
    entries: SavedSearchEntry[];
  };
  history: {
    entries: string[][];
    maxLength: number;
  };
}

// export interface FavoritedSearch {
//   tags: string[];
//   firstPost?: number;
// }

export interface ISettingsServiceState {
  configVersion: undefined | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19;
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
    slideshowIntervalMs: number;
    cardAutoNext: boolean;
    cardAutoNextIntervalMs: number;
    saveLocal: {
      pathTemplate: string;
      directoryName: string | null;
    };
    localDirectoryName: string | null;
  };
  favorites: {
    groups: FavoriteTagGroup[];
    tags: FavoriteTagEntry[];
  };
  account: {
    username: string | null;
    apiKey: string | null;
  };
  misc: {
    urls: {
      proxy: string;
      e621: string;
    };
  };
}
