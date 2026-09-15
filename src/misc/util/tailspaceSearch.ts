import type { TailspacePost } from "@/worker/tailspace/types";

/** Split a Tailspace/saved-search query into lowercase AND terms. */
export const parseTailspaceQueryTerms = (raw: string | string[] | undefined | null): string[] => {
  const text = Array.isArray(raw) ? raw.join(" ") : raw || "";
  return text
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
};

/** True when every term matches title, creator, or a tag name. */
export const tailspacePostMatchesQuery = (
  post: TailspacePost,
  terms: string[],
): boolean => {
  if (!terms.length) return true;
  const hay = [
    post.title || "",
    post.creator?.displayName || "",
    post.creator?.username || "",
    ...(post.tags || []).map((t) => t.name || ""),
  ]
    .join("\n")
    .toLowerCase();
  return terms.every((term) => hay.includes(term));
};
