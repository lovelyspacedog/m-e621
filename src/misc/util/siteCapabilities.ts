import type { ButtonType, SiteMode } from "@/services/types";
import { originModeOf } from "@/misc/util/postOrigin";

/** e621 / e6ai shaped features (pools, dashboard, wiki). */
export const isE621FamilyMode = (mode: SiteMode): boolean =>
  mode === "e621" || mode === "e6ai";

/**
 * Modes with their own browse routes (not `/posts` / getPosts).
 * Tailspace comics + Flayrah news — never fall through to e621-shaped chrome.
 */
export const isDedicatedChromeMode = (mode: SiteMode): boolean =>
  mode === "tailspace" || mode === "flayrah";

/** Post Suggester — all modes except dedicated chrome (no getPosts favs). */
export const modeSupportsSuggester = (mode: SiteMode): boolean =>
  !isDedicatedChromeMode(mode);

/**
 * Favorite Analyzer — same mode surface as Post Suggester.
 * Must use mode-native fav queries (`resolveFavoriteTagsQuery` / Local / Unified),
 * never fall through to e621 APIs on other sites.
 */
export const modeSupportsFavoriteAnalyzer = (mode: SiteMode): boolean =>
  modeSupportsSuggester(mode);

/**
 * Username field for Post Suggester / Analyzer: other users' public favorites.
 * Own-only sites use the logged-in account (`my:faves` / `favs:me` / …).
 */
export const modeSupportsOtherUserFavorites = (mode: SiteMode): boolean =>
  mode === "e621" ||
  mode === "e6ai" ||
  mode === "furaffinity" ||
  mode === "sofurry";

/**
 * `/pools` + pool reader — e621-family, Inkbunny, plus Federated
 * (e621/e6ai name browse; Inkbunny via watch / open-by-id / chips;
 * Tailspace comics may join Federated name browse only).
 * Inkbunny multi-file submissions stay on gallery chrome, not this UI.
 */
export const modeSupportsPools = (mode: SiteMode): boolean =>
  isE621FamilyMode(mode) || mode === "inkbunny" || mode === "unified";

export const modeSupportsVotes = (mode: SiteMode): boolean =>
  isE621FamilyMode(mode) || mode === "furbooru";

/** Sites where the client can toggle a remote favorite / star / like. */
export const modeSupportsFavoriteToggle = (mode: SiteMode): boolean =>
  isE621FamilyMode(mode) ||
  mode === "furbooru" ||
  mode === "furaffinity" ||
  mode === "itaku" ||
  mode === "sofurry";

export const modeSupportsComments = (mode: SiteMode): boolean =>
  isE621FamilyMode(mode) ||
  mode === "furbooru" ||
  mode === "furaffinity" ||
  mode === "itaku";
// SoFurry intentionally omitted: getComments returns [] / no write API.
// Story chrome owns text; do not fake e621 notes or comment POST (FEATURES 4.4).

export const modeSupportsNotes = (mode: SiteMode): boolean =>
  isE621FamilyMode(mode);

/** Inkbunny multi-file submissions use gallery chrome — not `/pools`. */
export const postSupportsInkbunnyGallery = (post: {
  __meta?: {
    originMode?: string;
    inkbunny?: { pagecount?: number; files?: { length: number } };
  };
} | null | undefined): boolean => {
  if (!post || post.__meta?.originMode === "local") return false;
  const meta = post.__meta?.inkbunny;
  if (!meta) return false;
  return (meta.files?.length ?? 0) > 1 || (meta.pagecount ?? 1) > 1;
};

export const modeSupportsFluffle = (mode: SiteMode): boolean =>
  !isDedicatedChromeMode(mode); // Local keeps Fluffle reverse image search

/**
 * Sites whose adapters already expose a following/watch feed via
 * `following:me` / `watch:me` (or SoFurry fetchFeed). Tailspace has its own
 * route and is never a Unified child. Local never follows.
 */
export const modeSupportsFollowing = (mode: SiteMode): boolean =>
  mode === "inkbunny" ||
  mode === "furaffinity" ||
  mode === "itaku" ||
  mode === "sofurry";

type PostMetaLike = {
  __meta?: {
    originMode?: string;
    furaffinity?: { kind?: string };
  };
} | null | undefined;

/** Comments UI for this post (origin-aware; FA journals excluded). */
export const postSupportsComments = (
  post: PostMetaLike,
  fallback: SiteMode,
): boolean => {
  const mode = originModeOf(post, fallback);
  if (mode === "local" || mode === "tailspace" || mode === "flayrah" || mode === "unified")
    return false;
  if (!modeSupportsComments(mode)) return false;
  if (mode === "furaffinity" && post?.__meta?.furaffinity?.kind === "journal") {
    return false;
  }
  return true;
};

/** Post-card / details buttons that should never appear for this mode. */
export const hiddenButtonsForMode = (mode: SiteMode): Set<ButtonType> => {
  const hidden = new Set<ButtonType>();
  if (!modeSupportsFavoriteToggle(mode)) {
    hidden.add("favorite");
  }
  if (!modeSupportsFluffle(mode)) {
    hidden.add("fluffle");
  }
  if (mode === "local") {
    hidden.add("external");
    hidden.add("save_local");
    hidden.add("bookmark");
    // Keep fluffle — Local uses reverse image search.
  }
  return hidden;
};

export { postSupportsFluffle } from "@/misc/util/fluffleSearch";
