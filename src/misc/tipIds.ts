/** Stable tip ids for TipDialog / appearance.dismissedTips. Never rename casually. */
export const TIP_IDS = {
  federatedMode: "federated-mode",
  poolsOriginBadge: "pools-origin-badge",
  federatedFollowing: "federated-following",
  localMode: "local-mode",
  feedLayout: "feed-layout",
  poolReader: "pool-reader",
  watchedPools: "watched-pools",
  fullscreenGestures: "fullscreen-gestures",
  savedPosts: "saved-posts",
  blacklistModes: "blacklist-modes",
  tailspaceComics: "tailspace-comics",
  fluffleSearch: "fluffle-search",
  remuxLocal: "remux-local",
  postSuggester: "post-suggester",
  favoritesAnalyzer: "favorites-analyzer",
  flayrahOffline: "flayrah-offline",
  starredTags: "starred-tags",
} as const;

export type TipId = (typeof TIP_IDS)[keyof typeof TIP_IDS];
