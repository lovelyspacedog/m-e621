import clone from "clone";
import { toRaw } from "vue";
import type {
  FavoriteTagEntry,
  ISettingsServiceState,
  SavedSearchEntry,
  SiteMode,
  SiteProfile,
} from "./types";
import {
  BlacklistMode,
  SITE_MODE_URLS,
  UNGROUPED_FAVORITE_GROUP_ID,
  UNGROUPED_SAVED_SEARCH_GROUP_ID,
} from "./types";
import {
  applyActiveProfileToMirrors,
  ensureSiteProfile,
  syncMirrorsToActiveProfile,
} from "./siteProfiles";
import {
  emptySavedSearchGroups,
  normalizeSavedSearches,
} from "./savedSearchNormalize";

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

const emptySearches = (): SiteProfile["searches"] => ({
  groups: emptySavedSearchGroups(),
  entries: [],
});

const stripTag = (tag: string) =>
  tag.trim().toLowerCase().replaceAll(/^--/g, "");

const blacklistLineKey = (line: string[]) =>
  line
    .map(stripTag)
    .filter(Boolean)
    .join(" ");

const searchEntryKey = (entry: SavedSearchEntry) =>
  entry.tags.map(stripTag).filter(Boolean).join(" ");

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

const ensureUngroupedSearches = (searches: SiteProfile["searches"]) => {
  const normalized = normalizeSavedSearches(searches);
  searches.groups = normalized.groups;
  searches.entries = normalized.entries;
};

/**
 * Query-language family for saved-search copy.
 * Same family = safe blind paste. Cross-family refused (no invented remap).
 */
export const queryLanguageFamily = (mode: SiteMode): string | null => {
  switch (mode) {
    case "e621":
    case "e6ai":
      return "e6";
    case "furbooru":
    case "inkbunny":
    case "furaffinity":
    case "weasyl":
    case "itaku":
    case "sofurry":
      return mode;
    default:
      return null;
  }
};

export const canCopySavedSearches = (from: SiteMode, to: SiteMode): boolean => {
  const a = queryLanguageFamily(from);
  const b = queryLanguageFamily(to);
  return Boolean(a && b && a === b);
};

/** Merge source starred tags into target (by name+category).
 *  Creates missing groups by name; tags keep their group when possible.
 */
export const mergeFavoriteTags = (
  target: SiteProfile["favorites"],
  source: SiteProfile["favorites"],
): number => {
  ensureUngrouped(target);
  const groupIdMap = new Map<string, string>();
  groupIdMap.set(UNGROUPED_FAVORITE_GROUP_ID, UNGROUPED_FAVORITE_GROUP_ID);
  for (const g of source.groups) {
    if (g.id === UNGROUPED_FAVORITE_GROUP_ID) continue;
    const existing = target.groups.find(
      (tg) =>
        tg.id !== UNGROUPED_FAVORITE_GROUP_ID &&
        tg.name.trim().toLowerCase() === g.name.trim().toLowerCase(),
    );
    if (existing) {
      groupIdMap.set(g.id, existing.id);
      continue;
    }
    const newId = makeId("fgroup");
    const maxOrder = target.groups.length
      ? Math.max(...target.groups.map((x) => x.order))
      : -1;
    target.groups.push({
      id: newId,
      name: g.name.trim() || "Group",
      collapsed: !!g.collapsed,
      order: maxOrder + 1,
    });
    groupIdMap.set(g.id, newId);
  }

  const existing = new Set(
    target.tags.map((t) => `${t.name}\0${t.category}`),
  );
  const nextOrder = new Map<string, number>();
  const orderFor = (groupId: string) => {
    if (!nextOrder.has(groupId)) {
      const inGroup = target.tags.filter((t) => t.groupId === groupId);
      nextOrder.set(
        groupId,
        inGroup.length ? Math.max(...inGroup.map((t) => t.order)) + 1 : 0,
      );
    }
    const n = nextOrder.get(groupId)!;
    nextOrder.set(groupId, n + 1);
    return n;
  };

  let added = 0;
  for (const tag of source.tags) {
    const key = `${tag.name}\0${tag.category}`;
    if (existing.has(key)) continue;
    const groupId =
      groupIdMap.get(tag.groupId) || UNGROUPED_FAVORITE_GROUP_ID;
    const entry: FavoriteTagEntry = {
      id: makeId("tag"),
      name: tag.name,
      category: tag.category,
      groupId,
      order: orderFor(groupId),
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

/** Merge saved searches by normalized tag list; creates missing groups by name. */
export const mergeSavedSearches = (
  target: SiteProfile["searches"],
  source: SiteProfile["searches"],
): number => {
  ensureUngroupedSearches(target);
  const groupIdMap = new Map<string, string>();
  groupIdMap.set(UNGROUPED_SAVED_SEARCH_GROUP_ID, UNGROUPED_SAVED_SEARCH_GROUP_ID);
  for (const g of source.groups) {
    if (g.id === UNGROUPED_SAVED_SEARCH_GROUP_ID) continue;
    const existing = target.groups.find(
      (tg) =>
        tg.id !== UNGROUPED_SAVED_SEARCH_GROUP_ID &&
        tg.name.trim().toLowerCase() === g.name.trim().toLowerCase(),
    );
    if (existing) {
      groupIdMap.set(g.id, existing.id);
      continue;
    }
    const newId = makeId("sgroup");
    const maxOrder = target.groups.length
      ? Math.max(...target.groups.map((x) => x.order))
      : -1;
    target.groups.push({
      id: newId,
      name: g.name.trim() || "Group",
      collapsed: !!g.collapsed,
      order: maxOrder + 1,
    });
    groupIdMap.set(g.id, newId);
  }

  const existing = new Set(
    target.entries.map(searchEntryKey).filter(Boolean),
  );
  const nextOrder = new Map<string, number>();
  const orderFor = (groupId: string) => {
    if (!nextOrder.has(groupId)) {
      const inGroup = target.entries.filter((e) => e.groupId === groupId);
      nextOrder.set(
        groupId,
        inGroup.length ? Math.max(...inGroup.map((e) => e.order)) + 1 : 0,
      );
    }
    const n = nextOrder.get(groupId)!;
    nextOrder.set(groupId, n + 1);
    return n;
  };

  let added = 0;
  for (const entry of source.entries) {
    const tags = entry.tags.map(stripTag).filter(Boolean);
    const key = tags.join(" ");
    if (!key || existing.has(key)) continue;
    const groupId =
      groupIdMap.get(entry.groupId) || UNGROUPED_SAVED_SEARCH_GROUP_ID;
    const next: SavedSearchEntry = {
      id: makeId("search"),
      name: entry.name.trim() || tags.join(" ") || "Untitled",
      tags,
      groupId,
      order: orderFor(groupId),
      ...(entry.news ? { news: { ...entry.news } } : {}),
    };
    target.entries.push(next);
    existing.add(key);
    added += 1;
  }
  return added;
};

export type ProfileListKind = "favorites" | "blacklist" | "searches";
export type ProfileListCopyMode = "merge" | "replace";

export const PROFILE_SYNC_MODES: SiteMode[] = (
  Object.keys(SITE_MODE_URLS) as SiteMode[]
).filter((m) => m !== "tailspace" && m !== "local" && m !== "unified");

/**
 * One-shot copy/merge of starred tags, blacklist, or saved searches between profiles.
 * Flushes active mirrors first; refreshes mirrors when the target is the active mode.
 * Saved searches refuse cross query-language paste.
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

  if (args.kind === "searches") {
    if (!canCopySavedSearches(args.from, args.to)) {
      throw new Error(
        `Cannot copy saved searches: ${args.from} and ${args.to} use different query languages`,
      );
    }
    if (args.mode === "replace") {
      to.searches = cloneRaw(from.searches, emptySearches());
      ensureUngroupedSearches(to.searches);
      added = to.searches.entries.length;
    } else {
      added = mergeSavedSearches(to.searches, from.searches);
    }
    if (state.activeMode === args.to) applyActiveProfileToMirrors(state);
    return { added, total: to.searches.entries.length };
  }

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
