import {
  isDedicatedChromeMode,
  modeSupportsFollowing,
} from "@/misc/util/siteCapabilities";
import { wakeCursorIsStale } from "@/misc/util/savedSearchWakeCheck";
import type { FeedSeenCursor } from "@/services/DiscoveryStore";
import type { SiteMode, UnifiedFeedSource } from "@/services/types";

export type FeedSeenKind = "posts" | "following";

const SKIPPED_MODES = new Set<SiteMode>([
  "news",
  "u18chan",
  "tailspace",
  "local",
]);

/** `${mode}:posts` or `${mode}:following`, or null when this query is not tracked. */
export const feedSeenKeyFor = (args: {
  mode: SiteMode;
  tags: readonly string[];
  unifiedFeedSource?: UnifiedFeedSource;
}): string | null => {
  if (SKIPPED_MODES.has(args.mode) || isDedicatedChromeMode(args.mode)) {
    return null;
  }
  const tags = args.tags.map((t) => t.trim()).filter(Boolean);
  if (tags.some((t) => t.toLowerCase().startsWith("order:"))) return null;

  if (args.mode === "unified") {
    if (args.unifiedFeedSource === "following") {
      if (tags.length) return null;
      return "unified:following";
    }
    if (tags.length) return null;
    return "unified:posts";
  }

  if (!tags.length) return `${args.mode}:posts`;
  if (
    tags.length === 1 &&
    tags[0]!.toLowerCase() === "following:me" &&
    modeSupportsFollowing(args.mode)
  ) {
    return `${args.mode}:following`;
  }
  return null;
};

export const feedSeenKeysForMode = (mode: SiteMode): string[] => {
  if (SKIPPED_MODES.has(mode) || isDedicatedChromeMode(mode)) return [];
  const keys = [`${mode}:posts`];
  if (mode === "unified" || modeSupportsFollowing(mode)) {
    keys.push(`${mode}:following`);
  }
  return keys;
};

export const feedSeenCursorIsStale = (
  cursor: FeedSeenCursor | undefined,
  now = Date.now(),
): boolean => wakeCursorIsStale(cursor, now);
