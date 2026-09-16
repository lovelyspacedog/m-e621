import type { UnifiedChildMode } from "@/services/types";

/** e621 category prefixes — on other sites, keep the name only (except artist→user/artist). */
const E621_CATEGORY_PREFIXES = new Set([
  "artist",
  "character",
  "copyright",
  "species",
  "general",
  "meta",
  "lore",
]);

/** order:* tags each child mapper already understands (besides e621 family = all). */
const ORDER_ALLOWED: Record<UnifiedChildMode, ReadonlySet<string>> = {
  e621: new Set(), // unused — all kept
  e6ai: new Set(),
  furbooru: new Set([
    "order:score",
    "order:score_asc",
    "order:favcount",
    "order:favcount_asc",
    "order:random",
    "order:id",
    "order:id_desc",
    "order:rank",
    "order:comment_count",
    "order:comment_count_asc",
    "order:mpixels",
    "order:mpixels_asc",
    "order:filesize",
    "order:filesize_asc",
    "order:duration",
    "order:duration_asc",
  ]),
  inkbunny: new Set(["order:newest", "order:score", "order:random"]),
  furaffinity: new Set([
    "order:random",
    "order:score",
    "order:newest",
    "order:id",
    "order:id_desc",
  ]),
  weasyl: new Set(["order:score", "order:favcount", "order:random"]),
  itaku: new Set(["order:score", "order:rank", "order:favcount", "order:random"]),
  sofurry: new Set(["order:random"]),
};

const PHILOMENA_BARE_RATINGS = new Set([
  "safe",
  "suggestive",
  "questionable",
  "explicit",
]);

export type PreparedChildTags = {
  tags: string[];
  /** Original tokens dropped or rewritten away for this child. */
  stripped: string[];
};

const isE621Family = (mode: UnifiedChildMode) =>
  mode === "e621" || mode === "e6ai";

const translateFurbooruRating = (lower: string): string | null => {
  if (lower === "rating:s" || lower === "rating:safe") return "safe";
  if (lower === "rating:q" || lower === "rating:questionable") return "questionable";
  if (lower === "rating:e" || lower === "rating:explicit") return "explicit";
  if (lower === "rating:suggestive" || lower === "suggestive") return "suggestive";
  if (PHILOMENA_BARE_RATINGS.has(lower)) return lower;
  return null;
};

/**
 * Rewrite Unified query tags for one federated child.
 * Content tags pass through; site-foreign metatags are stripped or remapped.
 */
export const prepareUnifiedChildTags = (
  mode: UnifiedChildMode,
  tags: string[],
): PreparedChildTags => {
    if (isE621Family(mode)) {
    const out: string[] = [];
    const stripped: string[] = [];
    for (const raw of tags.filter(Boolean)) {
      const tag = raw.trim();
      const lower = tag.toLowerCase().replace(/^-/, "");
      if (
        lower === "following:me" ||
        lower === "watch:me" ||
        lower === "stars:me" ||
        lower === "type:audio"
      ) {
        stripped.push(tag);
        continue;
      }
      out.push(tag);
    }
    return { tags: out, stripped };
  }

  const out: string[] = [];
  const stripped: string[] = [];

  for (const raw of tags.filter(Boolean)) {
    const tag = raw.trim();
    if (!tag) continue;
    const lower = tag.toLowerCase();
    const negated = lower.startsWith("-");
    const core = negated ? lower.slice(1) : lower;
    const coreRaw = negated ? tag.slice(1) : tag;

    // --- order:* ---
    if (core.startsWith("order:")) {
      if (ORDER_ALLOWED[mode].has(core)) {
        out.push(negated ? `-${coreRaw}` : tag);
      } else {
        stripped.push(tag);
      }
      continue;
    }

    // --- favorites ---
    if (
      core === "favs:me" ||
      core === "fav:me" ||
      core === "stars:me"
    ) {
      if (mode === "furbooru") {
        out.push(negated ? "-my:faves" : "my:faves");
        stripped.push(tag);
      } else if (
        mode === "inkbunny" ||
        mode === "furaffinity" ||
        mode === "weasyl" ||
        mode === "itaku" ||
        mode === "sofurry"
      ) {
        // Itaku mapper also accepts stars:me; normalize favs→stars there.
        if (mode === "itaku" && (core === "favs:me" || core === "fav:me")) {
          out.push(negated ? "-stars:me" : "stars:me");
          stripped.push(tag);
        } else {
          out.push(tag);
        }
      } else {
        stripped.push(tag);
      }
      continue;
    }

    // --- following ---
    if (core === "following:me" || core === "watch:me") {
      if (
        mode === "itaku" ||
        mode === "sofurry" ||
        mode === "inkbunny" ||
        mode === "furaffinity"
      ) {
        out.push(tag);
      } else {
        stripped.push(tag);
      }
      continue;
    }

    // --- rating ---
    if (core.startsWith("rating:") || PHILOMENA_BARE_RATINGS.has(core)) {
      if (mode === "furaffinity") {
        out.push(tag);
      } else if (mode === "furbooru") {
        const mapped = translateFurbooruRating(core);
        if (mapped) {
          out.push(negated ? `-${mapped}` : mapped);
          if (mapped !== core) stripped.push(tag);
        } else {
          stripped.push(tag);
        }
      } else {
        stripped.push(tag);
      }
      continue;
    }

    // --- type:audio (music-capable children only) ---
    if (core === "type:audio") {
      if (
        mode === "furaffinity" ||
        mode === "inkbunny" ||
        mode === "weasyl" ||
        mode === "sofurry"
      ) {
        out.push(tag);
      } else {
        stripped.push(tag);
      }
      continue;
    }

    // --- user / artist (widely supported) ---
    if (core.startsWith("user:") || core.startsWith("artist:")) {
      if (
        mode === "furaffinity" ||
        mode === "weasyl" ||
        mode === "itaku" ||
        mode === "sofurry" ||
        mode === "inkbunny"
      ) {
        out.push(tag);
      } else if (mode === "furbooru") {
        // Philomena uses bare names / uploader filters — drop structured user:
        stripped.push(tag);
      } else {
        stripped.push(tag);
      }
      continue;
    }

    // --- e621 category prefixes → bare name ---
    const colon = core.indexOf(":");
    if (colon > 0) {
      const prefix = core.slice(0, colon);
      const value = coreRaw.slice(coreRaw.indexOf(":") + 1);
      if (E621_CATEGORY_PREFIXES.has(prefix)) {
        if (prefix === "artist" && value) {
          if (
            mode === "furaffinity" ||
            mode === "weasyl" ||
            mode === "itaku" ||
            mode === "sofurry" ||
            mode === "inkbunny"
          ) {
            out.push(negated ? `-artist:${value}` : `artist:${value}`);
          } else {
            out.push(negated ? `-${value}` : value);
          }
          stripped.push(tag);
          continue;
        }
        if (value) {
          out.push(negated ? `-${value}` : value);
          stripped.push(tag);
          continue;
        }
      }
      // Unknown metatag for this child — don't search as literal junk
      stripped.push(tag);
      continue;
    }

    // Plain content tag
    out.push(tag);
  }

  return { tags: out, stripped };
};
