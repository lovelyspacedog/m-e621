import clone from "clone";
import { toRaw } from "vue";
import type {
  FavoriteTagEntry,
  ISettingsServiceState,
  SiteMode,
  SiteProfile,
} from "./types";
import {
  BlacklistMode,
  SITE_MODE_URLS,
  UNGROUPED_FAVORITE_GROUP_ID,
} from "./types";
import {
  applyActiveProfileToMirrors,
  ensureSiteProfile,
  syncMirrorsToActiveProfile,
} from "./siteProfiles";

const cloneRaw = <T>(value: T, fallback: T): T => {
  if (value == null) return clone(fallback);
  return clone(toRaw(value));
};

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const emptyFavorites = (): SiteProfile["favorites"] => ({
  groups: [
    {
      id: UNGROUPED_FAVORITE_GROUP_ID,
      name: "Ungrouped",
      collapsed: false,
      order: 0,
    },
  ],
  tags: [],
});

const emptyBlacklist = (): SiteProfile["blacklist"] => ({
  mode: BlacklistMode.blur,
  tags: [],
  hideServerSideBlacklisted: false,
});

const stripTag = (tag: string) =>
  tag.trim().toLowerCase().replaceAll(/^--/g, "");

const blacklistLineKey = (line: string[]) =>
  line
    .map(stripTag)
    .filter(Boolean)
    .join(" ");

const ensureUngrouped = (favorites: SiteProfile["favorites"]) => {
  if (!favorites.groups.some((g) => g.id === UNGROUPED_FAVORITE_GROUP_ID)) {
    favorites.groups.unshift({
      id: UNGROUPED_FAVORITE_GROUP_ID,
      name: "Ungrouped",
      collapsed: false,
      order: 0,
    });
  }
};

/** Merge source starred tags into target (by name+category). New tags land in Ungrouped. */
export const mergeFavoriteTags = (
  target: SiteProfile["favorites"],
  source: SiteProfile["favorites"],
): number => {
  ensureUngrouped(target);
  const existing = new Set(
    target.tags.map((t) => `${t.name}\0${t.category}`),
  );
  const ungrouped = target.tags.filter(
    (t) => t.groupId === UNGROUPED_FAVORITE_GROUP_ID,
  );
  let nextOrder = ungrouped.length
    ? Math.max(...ungrouped.map((t) => t.order)) + 1
    : 0;
  let added = 0;
  for (const tag of source.tags) {
    const key = `${tag.name}\0${tag.category}`;
    if (existing.has(key)) continue;
    const entry: FavoriteTagEntry = {
      id: makeId("tag"),
      name: tag.name,
      category: tag.category,
      groupId: UNGROUPED_FAVORITE_GROUP_ID,
      order: nextOrder++,
    };
    if (tag.display && tag.display !== tag.name) entry.display = tag.display;
    target.tags.push(entry);
    existing.add(key);
    added += 1;
  }
  return added;
};

/** Union blacklist lines (normalized). Does not change mode / hide-server flag. */
export const mergeBlacklistTags = (
  target: SiteProfile["blacklist"],
  source: SiteProfile["blacklist"],
): number => {
  const existing = new Set(target.tags.map(blacklistLineKey));
  let added = 0;
  for (const line of source.tags) {
    const normalized = line.map(stripTag).filter(Boolean);
    const key = normalized.join(" ");
    if (!key || existing.has(key)) continue;
    target.tags.push(normalized);
    existing.add(key);
    added += 1;
  }
  return added;
};

export type ProfileListKind = "favorites" | "blacklist";
export type ProfileListCopyMode = "merge" | "replace";

export const PROFILE_SYNC_MODES: SiteMode[] = (
  Object.keys(SITE_MODE_URLS) as SiteMode[]
).filter((m) => m !== "tailspace"); // Tailspace has no tag star/blacklist UX

/**
 * One-shot copy/merge of starred tags or blacklist from one site profile to another.
 * Flushes active mirrors first; refreshes mirrors when the target is the active mode.
 */
export const copyProfileLists = (
  state: ISettingsServiceState,
  args: {
    from: SiteMode;
    to: SiteMode;
    kind: ProfileListKind;
    mode: ProfileListCopyMode;
  },
): { added: number; total: number } => {
  if (args.from === args.to) return { added: 0, total: 0 };
  syncMirrorsToActiveProfile(state);

  const from = ensureSiteProfile(state, args.from);
  const to = ensureSiteProfile(state, args.to);
  let added = 0;

  if (args.kind === "favorites") {
    if (args.mode === "replace") {
      to.favorites = cloneRaw(from.favorites, emptyFavorites());
      ensureUngrouped(to.favorites);
      added = to.favorites.tags.length;
    } else {
      added = mergeFavoriteTags(to.favorites, from.favorites);
    }
    if (state.activeMode === args.to) applyActiveProfileToMirrors(state);
    return { added, total: to.favorites.tags.length };
  }

  if (args.mode === "replace") {
    to.blacklist = cloneRaw(from.blacklist, emptyBlacklist());
    added = to.blacklist.tags.length;
  } else {
    added = mergeBlacklistTags(to.blacklist, from.blacklist);
  }
  if (state.activeMode === args.to) applyActiveProfileToMirrors(state);
  return { added, total: to.blacklist.tags.length };
};
