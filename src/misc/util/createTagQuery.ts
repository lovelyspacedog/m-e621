import { BlacklistMode } from "@/services/types";

const E621_API_TAG_LIMIT = 40;

export const createTagQuery = (
  mode: BlacklistMode,
  blacklist: string[][],
  tags: string[],
) => {
  const allTags = [...tags];
  if (mode === BlacklistMode.hide) {
    // Only single-term lines can be expressed as e621 search negations.
    // Multi-term lines stay client-side.
    const serverSideTags = blacklist
      .filter((line) => line.length === 1 && line[0])
      .map((line) => {
        const term = line[0];
        if (term.startsWith("-")) return term.slice(1);
        if (term.startsWith("~")) return `-${term.slice(1)}`;
        return `-${term}`;
      })
      .filter((t) => t && !t.startsWith("~"));
    allTags.push(...serverSideTags);
  }
  return allTags.slice(0, E621_API_TAG_LIMIT).join(" ");
};
