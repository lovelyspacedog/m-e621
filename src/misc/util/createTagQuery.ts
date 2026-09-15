import { BlacklistMode } from "@/services/types";

export const E621_API_TAG_LIMIT = 40;

export type BuiltTagQuery = {
  query: string;
  truncated: boolean;
  total: number;
  limit: number;
};

export const buildTagQuery = (
  mode: BlacklistMode,
  blacklist: string[][],
  tags: string[],
): BuiltTagQuery => {
  const allTags = [...tags];
  if (mode === BlacklistMode.hide) {
    // Only single-term lines can be expressed as e621 search negations.
    // Multi-term lines stay client-side.
    const serverSideTags = blacklist
      .filter((line) => line.length === 1 && line[0])
      .map((line) => {
        const term = line[0];
        // Already an exclude in blacklist form — keep as search negation.
        if (term.startsWith("-")) return term;
        // Optional OR-terms are not expressible as simple search negations.
        if (term.startsWith("~")) return null;
        // Meta comparisons cannot be pushed as tag negations.
        if (/^(score|width|height|id|favcount|comment_count|tagcount):/i.test(term)) {
          return null;
        }
        return `-${term}`;
      })
      .filter((t): t is string => !!t && !t.startsWith("~"));
    allTags.push(...serverSideTags);
  }
  const total = allTags.length;
  return {
    query: allTags.slice(0, E621_API_TAG_LIMIT).join(" "),
    truncated: total > E621_API_TAG_LIMIT,
    total,
    limit: E621_API_TAG_LIMIT,
  };
};

/** e621 posts.json tag string (capped at {@link E621_API_TAG_LIMIT}). */
export const createTagQuery = (
  mode: BlacklistMode,
  blacklist: string[][],
  tags: string[],
) => buildTagQuery(mode, blacklist, tags).query;

export const tagQueryTruncationMessage = (
  total: number,
  limit = E621_API_TAG_LIMIT,
) =>
  `Search capped at ${limit} tags (${total} including hide-mode blacklist). Extra tags were dropped.`;
