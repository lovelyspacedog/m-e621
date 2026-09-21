/** Stable tip ids for TipDialog / appearance.dismissedTips. Never rename casually. */
export const TIP_IDS = {
  federatedMode: "federated-mode",
  poolsOriginBadge: "pools-origin-badge",
  federatedFollowing: "federated-following",
  localMode: "local-mode",
  feedLayout: "feed-layout",
  poolReader: "pool-reader",
  watchedPools: "watched-pools",
  watchedComics: "watched-comics",
  fullscreenGestures: "fullscreen-gestures",
  savedPosts: "saved-posts",
  blacklistModes: "blacklist-modes",
  tailspaceComics: "tailspace-comics",
  fluffleSearch: "fluffle-search",
  remuxLocal: "remux-local",
  postSuggester: "post-suggester",
  favoritesAnalyzer: "favorites-analyzer",
  /** Kept id for dismissedTips continuity; copy says News offline cache. */
  newsOffline: "flayrah-offline",
  /** @deprecated use newsOffline */
  flayrahOffline: "flayrah-offline",
  starredTags: "starred-tags",
} as const;

export type TipId = (typeof TIP_IDS)[keyof typeof TIP_IDS];
