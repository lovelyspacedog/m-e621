import type { SiteMode } from "@/services/types";

export type UnifiedOrderKind = "score" | "favs" | "random";

export type OrderSupport = {
  supported: boolean;
  reason?: string;
};

/** True when tags request a FurAffinity favorites folder listing. */
export const isFaFavoritesQuery = (tags: string[] | undefined | null): boolean =>
  (tags || []).some((tag) => {
    const lower = tag.trim().toLowerCase();
    return lower === "favs:me" || lower === "fav:me" || lower.startsWith("favs:") || lower.startsWith("fav:");
  });

/** Score / Favs / Random availability for Posts-mode sites. */
export const orderSupport = (
  mode: SiteMode,
  kind: UnifiedOrderKind,
  tags?: string[] | null,
): OrderSupport => {
  if (kind === "random") return { supported: true };
  if (kind === "score") {
    if (mode === "local") {
      return { supported: false, reason: "Local files have no score" };
    }
    if (mode === "furaffinity" && isFaFavoritesQuery(tags)) {
      return {
        supported: false,
        reason: "FurAffinity favorites have no popularity sort",
      };
    }
    return { supported: true };
  }
  if (mode === "unified") {
    return { supported: false, reason: "Favorites sort is not comparable across sites" };
  }
  if (mode === "inkbunny" || mode === "furaffinity") {
    return { supported: false, reason: `${mode === "furaffinity" ? "FurAffinity" : "Inkbunny"} has no favorites sort` };
  }
  if (mode === "local") {
    return { supported: false, reason: "Local has no fav-count sort" };
  }
  return { supported: true };
};
