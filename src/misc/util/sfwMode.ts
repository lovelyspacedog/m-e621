/**
 * Global SFW-only helpers: strip conflicting rating tags and force safe.
 * Safe = rating "s" only (q/e and Furbooru suggestive→q are excluded).
 */

const PHILOMENA_RATINGS = new Set([
  "safe",
  "suggestive",
  "questionable",
  "explicit",
  "semi-grimdark",
  "grimdark",
]);

const FA_RATING_VALUES = new Set([
  "general",
  "mature",
  "adult",
  "s",
  "safe",
  "q",
  "questionable",
  "e",
  "explicit",
]);

const E621_RATING_VALUES = new Set([
  "s",
  "safe",
  "q",
  "questionable",
  "e",
  "explicit",
]);

/** True when the post is safe for SFW-only lists. Missing rating → not safe. */
export const isSafeRating = (post: { rating?: string | null }): boolean =>
  post.rating === "s";

/** Pure `id:1,2,3` queries must not get rating:safe injected (breaks NSFW deep fetches). */
export const isIdOnlyQuery = (tags: string[]): boolean => {
  const filtered = tags.filter(Boolean);
  if (!filtered.length) return false;
  return filtered.every((raw) => {
    const t = raw.trim().toLowerCase();
    return t.startsWith("id:");
  });
};

const ratingCore = (tag: string): string | null => {
  const lower = tag.trim().toLowerCase();
  const bare = lower.startsWith("-") ? lower.slice(1) : lower;
  if (bare.startsWith("rating:")) {
    return bare.slice("rating:".length);
  }
  if (PHILOMENA_RATINGS.has(bare)) return bare;
  return null;
};

/** True if this tag is a rating include/exclude (e621, FA, or Philomena bare). */
export const isRatingTag = (tag: string): boolean => {
  const core = ratingCore(tag);
  if (core == null) return false;
  return (
    E621_RATING_VALUES.has(core) ||
    FA_RATING_VALUES.has(core) ||
    PHILOMENA_RATINGS.has(core)
  );
};

/**
 * e621-style safe markers SFW injects into Federated/e621 queries.
 * Used to trip SFW from manual entry and to quiet Federated drop toasts.
 * Negations (`-rating:safe`) must not match — they mean exclude-safe, not SFW.
 */
export const isSfwSafeRatingTag = (tag: string): boolean => {
  const bare = tag.trim().toLowerCase();
  if (bare.startsWith("-")) return false;
  return bare === "rating:safe" || bare === "rating:s";
};

export const tagsIncludeSfwSafeRating = (tags: string[]): boolean =>
  tags.some(isSfwSafeRatingTag);

/** Drop all rating includes/excludes so SFW can override. */
export const stripConflictingRatingTags = (tags: string[]): string[] =>
  tags.filter((t) => !isRatingTag(t));

export type SfwTagMode = "e621" | "furbooru" | "furaffinity" | "none";

/**
 * Strip conflicting rating tags, then force a safe marker for tag-driven backends.
 * Furbooru uses bare `safe` (+ negations applied at the ApiService choke).
 */
export const applySfwTagOverride = (
  tags: string[],
  mode: SfwTagMode,
): string[] => {
  const stripped = stripConflictingRatingTags(tags);
  if (mode === "e621") {
    return [...stripped, "rating:safe"];
  }
  if (mode === "furbooru") {
    return [...stripped, "safe", "-suggestive", "-questionable", "-explicit"];
  }
  if (mode === "furaffinity") {
    return [...stripped, "rating:general"];
  }
  return stripped;
};
