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

/**
 * Explicit per-mode order:* allowlist (supported).
 * e621/e6ai keep all order:* (empty set = unused).
 * Assumption: values match existing child mappers — do not invent new operators.
 */
export const ORDER_ALLOWED: Record<UnifiedChildMode, ReadonlySet<string>> = {
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
  /** Tokens rewritten to a different form for this child. */
  remapped: string[];
  /** Tokens removed with no replacement. */
  dropped: string[];
  /**
   * @deprecated Prefer remapped + dropped. Union for older callers/tests.
   */
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

const finish = (
  tags: string[],
  remapped: string[],
  dropped: string[],
): PreparedChildTags => ({
  tags,
  remapped,
  dropped,
  stripped: [...remapped, ...dropped],
});

/**
 * Rewrite Unified query tags for one federated child.
 * Content tags pass through; site-foreign metatags are dropped or remapped.
 */
export const prepareUnifiedChildTags = (
  mode: UnifiedChildMode,
  tags: string[],
): PreparedChildTags => {
  if (isE621Family(mode)) {
    const out: string[] = [];
    const dropped: string[] = [];
    for (const raw of tags.filter(Boolean)) {
      const tag = raw.trim();
      const lower = tag.toLowerCase().replace(/^-/, "");
      if (
        lower === "following:me" ||
        lower === "watch:me" ||
        lower === "stars:me" ||
        lower === "type:audio"
      ) {
        dropped.push(tag);
        continue;
      }
      out.push(tag);
    }
    return finish(out, [], dropped);
  }

  const out: string[] = [];
  const remapped: string[] = [];
  const dropped: string[] = [];

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
        dropped.push(tag);
      }
      continue;
    }

    // --- favorites ---
    if (core === "favs:me" || core === "fav:me" || core === "stars:me") {
      if (mode === "furbooru") {
        out.push(negated ? "-my:faves" : "my:faves");
        remapped.push(tag);
      } else if (
        mode === "inkbunny" ||
        mode === "furaffinity" ||
        mode === "weasyl" ||
        mode === "itaku" ||
        mode === "sofurry"
      ) {
        if (mode === "itaku" && (core === "favs:me" || core === "fav:me")) {
          out.push(negated ? "-stars:me" : "stars:me");
          remapped.push(tag);
        } else if (mode === "itaku" && core === "stars:me") {
          // Native Itaku token — pass through (adapter also accepts favs:me).
          out.push(tag);
        } else if (core === "stars:me") {
          out.push(negated ? "-favs:me" : "favs:me");
          remapped.push(tag);
        } else {
          out.push(tag);
        }
      } else {
        dropped.push(tag);
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
        dropped.push(tag);
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
          if (mapped !== core) remapped.push(tag);
        } else {
          dropped.push(tag);
        }
      } else {
        dropped.push(tag);
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
        dropped.push(tag);
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
        dropped.push(tag);
      } else {
        dropped.push(tag);
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
          remapped.push(tag);
          continue;
        }
        if (value) {
          out.push(negated ? `-${value}` : value);
          remapped.push(tag);
          continue;
        }
      }
      // Unknown metatag for this child — don't search as literal junk
      dropped.push(tag);
      continue;
    }

    // Plain content tag
    out.push(tag);
  }

  return finish(out, remapped, dropped);
};

/**
 * Drop SFW-injected safe rating tokens from warning lists only.
 * Tags for the child fetch stay as prepared (still stripped/remapped).
 */
export const omitSfwInjectedRatingNoise = (
  prepared: PreparedChildTags,
  isSafeMarker: (tag: string) => boolean,
): PreparedChildTags => {
  const dropped = prepared.dropped.filter((t) => !isSafeMarker(t));
  const remapped = prepared.remapped.filter((t) => !isSafeMarker(t));
  if (
    dropped.length === prepared.dropped.length &&
    remapped.length === prepared.remapped.length
  ) {
    return prepared;
  }
  return finish(prepared.tags, remapped, dropped);
};

/** Human-readable Unified tag-prep warning for one child. */
export const formatUnifiedTagWarning = (
  childLabel: string,
  prepared: PreparedChildTags,
): string | null => {
  const parts: string[] = [];
  if (prepared.dropped.length) {
    const sample = prepared.dropped.slice(0, 4).join(", ");
    const more =
      prepared.dropped.length > 4 ? ` (+${prepared.dropped.length - 4})` : "";
    parts.push(`dropped ${sample}${more}`);
  }
  if (prepared.remapped.length) {
    const sample = prepared.remapped.slice(0, 4).join(", ");
    const more =
      prepared.remapped.length > 4 ? ` (+${prepared.remapped.length - 4})` : "";
    parts.push(`remapped ${sample}${more}`);
  }
  if (!parts.length) return null;
  return `${childLabel}: ${parts.join("; ")}`;
};
