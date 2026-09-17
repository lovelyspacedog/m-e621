import type { SiteMode, UnifiedChildMode } from "@/services/types";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";

export type SuggesterWeightCategory =
  | "general"
  | "artist"
  | "copyright"
  | "character"
  | "species"
  | "meta"
  | "lore"
  | "invalid";

export type SuggesterWeights = Record<SuggesterWeightCategory, number>;

export const ALL_SUGGESTER_WEIGHT_CATEGORIES: SuggesterWeightCategory[] = [
  "general",
  "artist",
  "copyright",
  "character",
  "species",
  "meta",
  "lore",
  "invalid",
];

/** Categories that meaningfully appear for the active mode's adapters. */
export const suggesterWeightCategories = (
  mode: SiteMode,
): SuggesterWeightCategory[] => {
  switch (mode) {
    case "e621":
    case "e6ai":
    case "unified":
      return [...ALL_SUGGESTER_WEIGHT_CATEGORIES];
    case "furbooru":
      return ["general", "artist", "copyright", "character", "species", "meta"];
    case "local":
      return ["general", "artist", "character", "copyright", "species", "meta"];
    case "inkbunny":
    case "furaffinity":
    case "weasyl":
    case "itaku":
    case "sofurry":
      return ["general", "artist", "character", "species", "meta"];
    default:
      return ["general", "artist"];
  }
};

export const defaultSuggesterWeights = (mode: SiteMode): SuggesterWeights => {
  const base: SuggesterWeights = {
    general: 5,
    artist: 30,
    copyright: 25,
    character: 15,
    species: 25,
    meta: 0,
    lore: 0,
    invalid: 0,
  };
  const allowed = new Set(suggesterWeightCategories(mode));
  for (const key of ALL_SUGGESTER_WEIGHT_CATEGORIES) {
    if (!allowed.has(key)) base[key] = 0;
  }
  return base;
};

export type FavoriteQueryResolution = {
  tags: string[];
  /** Own-account query; caller must supply auth / userId when required. */
  requiresAuth: boolean;
};

/**
 * Map mode + optional username to the adapter's favorites search tags.
 * For own-only modes, `username` is ignored.
 */
export const resolveFavoriteTagsQuery = (args: {
  mode: SiteMode | UnifiedChildMode;
  username?: string | null;
}): FavoriteQueryResolution => {
  const mode = args.mode;
  const rawName = (args.username || "").trim();
  const otherUser =
    modeSupportsOtherUserFavorites(mode as SiteMode) && rawName.length > 0;

  switch (mode) {
    case "furbooru":
      return { tags: ["my:faves"], requiresAuth: true };
    case "inkbunny":
    case "weasyl":
      return { tags: ["favs:me"], requiresAuth: true };
    case "itaku":
      return { tags: ["stars:me"], requiresAuth: true };
    case "local":
      return { tags: ["type:favorited"], requiresAuth: false };
    case "furaffinity":
      if (otherUser) {
        return { tags: [`favs:${rawName}`], requiresAuth: false };
      }
      return { tags: ["favs:me"], requiresAuth: true };
    case "sofurry":
      if (otherUser) {
        return {
          tags: [`user:${rawName}`, "favs:me"],
          requiresAuth: false,
        };
      }
      return { tags: ["favs:me"], requiresAuth: true };
    case "e621":
    case "e6ai":
      if (!rawName) {
        return { tags: ["favs:me"], requiresAuth: true };
      }
      return { tags: [`fav:${rawName}`], requiresAuth: false };
    default:
      // unified handled by callers (per-child); fall back to e621-shaped
      if (!rawName) {
        return { tags: ["favs:me"], requiresAuth: true };
      }
      return { tags: [`fav:${rawName}`], requiresAuth: false };
  }
};

export type TagCountMap = {
  [category: string]: undefined | { [tag: string]: undefined | number };
};

export const mergeTagCounts = (
  into: TagCountMap,
  from: TagCountMap,
): TagCountMap => {
  for (const [category, tags] of Object.entries(from)) {
    if (!tags) continue;
    into[category] = into[category] || {};
    for (const [tag, count] of Object.entries(tags)) {
      if (!count) continue;
      into[category]![tag] = (into[category]![tag] || 0) + count;
    }
  }
  return into;
};

export const pickSeedTags = (
  counts: TagCountMap,
  weights: Partial<SuggesterWeights>,
  limit = 15,
): { category: string; tag: string; score: number }[] => {
  const scored: { category: string; tag: string; score: number }[] = [];
  for (const [category, tags] of Object.entries(counts)) {
    const categoryWeight = Number(
      (weights as Record<string, number>)[category] || 0,
    );
    if (!categoryWeight || !tags) continue;
    for (const [tag, count] of Object.entries(tags)) {
      if (!count) continue;
      scored.push({
        category,
        tag,
        score: count * categoryWeight,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
};
