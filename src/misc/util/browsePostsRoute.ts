import type { SiteMode } from "@/services/types";

/** Mode feed route formerly used by sidebar Home (now Posts / News / Tailspace). */
export const browsePostsRoute = (
  mode: SiteMode,
): { name: string; query?: Record<string, string> } => {
  if (mode === "tailspace") return { name: "TailspacePosts" };
  if (mode === "news") return { name: "NewsFeed" };
  return { name: "Posts" };
};
