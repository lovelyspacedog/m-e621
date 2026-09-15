import {
  UNGROUPED_SAVED_SEARCH_GROUP_ID,
  type SavedSearchEntry,
  type SavedSearchGroup,
} from "./types";

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const emptySavedSearchGroups = (): SavedSearchGroup[] => [
  {
    id: UNGROUPED_SAVED_SEARCH_GROUP_ID,
    name: "Ungrouped",
    collapsed: false,
    order: 0,
  },
];

/** Normalize legacy `{entries:[{name,tags}]}` and partial group shapes. */
export const normalizeSavedSearches = (raw: unknown): {
  groups: SavedSearchGroup[];
  entries: SavedSearchEntry[];
} => {
  const src =
    raw && typeof raw === "object"
      ? (raw as {
          groups?: Partial<SavedSearchGroup>[];
          entries?: Partial<SavedSearchEntry>[];
        })
      : {};
  const groups: SavedSearchGroup[] = [];
  for (const g of src.groups || []) {
    if (!g || typeof g.id !== "string" || !g.id) continue;
    groups.push({
      id: g.id,
      name: typeof g.name === "string" && g.name.trim() ? g.name.trim() : "Group",
      collapsed: Boolean(g.collapsed),
      order: typeof g.order === "number" ? g.order : groups.length,
    });
  }
  if (!groups.some((g) => g.id === UNGROUPED_SAVED_SEARCH_GROUP_ID)) {
    groups.unshift({
      id: UNGROUPED_SAVED_SEARCH_GROUP_ID,
      name: "Ungrouped",
      collapsed: false,
      order: groups.length ? Math.min(...groups.map((g) => g.order), 0) : 0,
    });
  }
  const groupIds = new Set(groups.map((g) => g.id));
  const entries: SavedSearchEntry[] = [];
  for (const [i, e] of (src.entries || []).entries()) {
    if (!e || typeof e.name !== "string") continue;
    const tags = Array.isArray(e.tags)
      ? e.tags.filter((t): t is string => typeof t === "string")
      : [];
    const groupId =
      typeof e.groupId === "string" && groupIds.has(e.groupId)
        ? e.groupId
        : UNGROUPED_SAVED_SEARCH_GROUP_ID;
    entries.push({
      id: typeof e.id === "string" && e.id ? e.id : makeId("search"),
      name: e.name.trim() || tags.join(" ") || "Untitled",
      tags,
      groupId,
      order: typeof e.order === "number" ? e.order : i,
    });
  }
  return { groups, entries };
};
