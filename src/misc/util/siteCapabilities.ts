import type { ButtonType, SiteMode } from "@/services/types";
import { originModeOf } from "@/misc/util/postOrigin";

/** e621 / e6ai shaped features (pools, suggester, analyzer, dashboard, wiki). */
export const isE621FamilyMode = (mode: SiteMode): boolean =>
  mode === "e621" || mode === "e6ai";

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

export const modeSupportsNotes = (mode: SiteMode): boolean =>
  isE621FamilyMode(mode);

export const modeSupportsFluffle = (mode: SiteMode): boolean =>
  mode !== "tailspace"; // Local keeps the button for MD5→e621 lookup

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
  if (mode === "local" || mode === "tailspace" || mode === "unified") return false;
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
    // Keep fluffle — Local uses it for MD5 reverse lookup.
  }
  return hidden;
};
