import type { SiteMode } from "@/services/types";

export type UnifiedOrderKind = "score" | "favs" | "random";

export type OrderSupport = {
  supported: boolean;
  reason?: string;
};

/** Score / Favs / Random availability for Posts-mode sites. */
export const orderSupport = (
  mode: SiteMode,
  kind: UnifiedOrderKind,
): OrderSupport => {
  if (kind === "random") return { supported: true };
  if (kind === "score") {
    if (mode === "local") {
      return { supported: false, reason: "Local files have no score" };
    }
    return { supported: true };
  }
  if (mode === "unified") {
    return { supported: false, reason: "Favorites sort is not comparable across sites" };
  }
  if (mode === "inkbunny") {
    return { supported: false, reason: "Inkbunny has no favorites sort" };
  }
  if (mode === "local") {
    return { supported: false, reason: "Local has no fav-count sort" };
  }
  return { supported: true };
};
