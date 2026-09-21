import type { SiteMode } from "@/services/types";

/**
 * Named route when a tool page is blocked for the active mode.
 * Tailspace/Flayrah must not fall through to e621-shaped `Posts`.
 */
export const blockedToolRedirectName = (mode: SiteMode): string => {
  if (mode === "news") return "NewsFeed";
  if (mode === "tailspace") return "TailspacePosts";
  return "Posts";
};
