import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import {
  emptySavedSearchGroups,
  normalizeSavedSearches,
} from "./savedSearchNormalize";
import {
  UNGROUPED_SAVED_SEARCH_GROUP_ID,
  type SavedSearchEntry,
  type SavedSearchGroup,
} from "./types";

export { emptySavedSearchGroups, normalizeSavedSearches } from "./savedSearchNormalize";

export const parseSavedSearchTags = (raw: string) =>
  raw
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useSavedSearchStore = defineStore("saved-search", () => {
  const main = useMainStore();

  const ensureShape = () => {
    if (!Array.isArray(main.searches.groups)) {
      const normalized = normalizeSavedSearches(main.searches);
      main.searches.groups = normalized.groups;
      main.searches.entries = normalized.entries;
      return;
    }
    if (
      !main.searches.groups.some((g) => g.id === UNGROUPED_SAVED_SEARCH_GROUP_ID)
    ) {
      main.searches.groups.unshift(...emptySavedSearchGroups());
    }
    for (let i = 0; i < main.searches.entries.length; i++) {
      const e = main.searches.entries[i] as Partial<SavedSearchEntry>;
      if (!e.id) e.id = makeId("search");
      if (!e.groupId || !main.searches.groups.some((g) => g.id === e.groupId)) {
        e.groupId = UNGROUPED_SAVED_SEARCH_GROUP_ID;
      }
      if (typeof e.order !== "number") e.order = i;
      if (!Array.isArray(e.tags)) e.tags = [];
      if (typeof e.name !== "string") e.name = e.tags.join(" ") || "Untitled";
    }
  };

  ensureShape();

  const groups = computed(() =>
    [...(main.searches.groups || [])].sort((a, b) => a.order - b.order),
  );
  const entries = computed(() =>
    [...main.searches.entries].sort((a, b) => a.order - b.order),
  );

  const entriesInGroup = computed(
    () => (groupId: string) =>
      main.searches.entries
        .filter((e) => e.groupId === groupId)
        .sort((a, b) => a.order - b.order),
  );

  const deleteEntry = (index: number) => {
    ensureShape();
    if (index < 0 || index >= main.searches.entries.length) return;
    main.searches.entries.splice(index, 1);
  };

  const deleteEntryById = (id: string) => {
    ensureShape();
    const idx = main.searches.entries.findIndex((e) => e.id === id);
    if (idx >= 0) main.searches.entries.splice(idx, 1);
  };

  const addEntry = (
    tags: string[],
    name: string,
    groupId?: string,
    news?: SavedSearchEntry["news"],
  ) => {
    ensureShape();
    const destId =
      groupId && main.searches.groups.some((g) => g.id === groupId)
        ? groupId
        : UNGROUPED_SAVED_SEARCH_GROUP_ID;
    const siblings = main.searches.entries.filter((e) => e.groupId === destId);
    const entry: SavedSearchEntry = {
      id: makeId("search"),
      name: name.trim() || tags.join(" ") || "Untitled",
      tags: [...tags],
      groupId: destId,
      order: siblings.length
        ? Math.max(...siblings.map((e) => e.order)) + 1
        : 0,
    };
    if (news && (news.source || news.feed || news.view)) {
      entry.news = { ...news };
    }
    main.searches.entries.push(entry);
  };

  const moveEntryToGroup = (entryId: string, groupId: string) => {
    ensureShape();
    if (!main.searches.groups.some((g) => g.id === groupId)) return;
    const entry = main.searches.entries.find((e) => e.id === entryId);
    if (!entry || entry.groupId === groupId) return;
    const dest = main.searches.entries.filter((e) => e.groupId === groupId);
    entry.groupId = groupId;
    entry.order = dest.length ? Math.max(...dest.map((e) => e.order)) + 1 : 0;
  };

  const updateEntry = (
    index: number,
    patch: {
      name?: string;
      tags?: string[];
      groupId?: string;
      news?: SavedSearchEntry["news"] | null;
    },
  ) => {
    ensureShape();
    const entry = main.searches.entries[index];
    if (!entry) return;
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (name) entry.name = name;
    }
    if (patch.tags !== undefined) {
      entry.tags = [...patch.tags];
    }
    if (patch.news !== undefined) {
      if (patch.news && (patch.news.source || patch.news.feed || patch.news.view)) {
        entry.news = { ...patch.news };
      } else {
        delete entry.news;
      }
    }
    if (patch.groupId !== undefined && patch.groupId !== entry.groupId) {
      moveEntryToGroup(entry.id, patch.groupId);
    }
  };

  const updateEntryById = (
    id: string,
    patch: {
      name?: string;
      tags?: string[];
      groupId?: string;
      news?: SavedSearchEntry["news"] | null;
    },
  ) => {
    ensureShape();
    const index = main.searches.entries.findIndex((e) => e.id === id);
    if (index < 0) return;
    updateEntry(index, patch);
  };

  const moveEntry = (from: number, to: number) => {
    ensureShape();
    const list = main.searches.entries;
    if (from === to) return;
    if (from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const [item] = list.splice(from, 1);
    if (!item) return;
    list.splice(to, 0, item);
  };

  const replaceGroupEntries = (groupId: string, next: SavedSearchEntry[]) => {
    ensureShape();
    const others = main.searches.entries.filter((e) => e.groupId !== groupId);
    const normalized = next.map((entry, i) => ({
      id: entry.id,
      name: entry.name,
      tags: [...entry.tags],
      groupId,
      order: i,
    }));
    main.searches.entries.splice(
      0,
      main.searches.entries.length,
      ...others,
      ...normalized,
    );
  };

  const replaceEntries = (next: SavedSearchEntry[]) => {
    ensureShape();
    const normalized = normalizeSavedSearches({
      groups: main.searches.groups,
      entries: next,
    });
    main.searches.entries.splice(
      0,
      main.searches.entries.length,
      ...normalized.entries,
    );
  };

  const createGroup = (name: string) => {
    ensureShape();
    const trimmed = name.trim() || "New group";
    const order =
      main.searches.groups.length === 0
        ? 0
        : Math.max(...main.searches.groups.map((g) => g.order)) + 1;
    const group: SavedSearchGroup = {
      id: makeId("sgroup"),
      name: trimmed,
      collapsed: false,
      order,
    };
    main.searches.groups.push(group);
    return group;
  };

  const renameGroup = (groupId: string, name: string) => {
    if (groupId === UNGROUPED_SAVED_SEARCH_GROUP_ID) return;
    ensureShape();
    const group = main.searches.groups.find((g) => g.id === groupId);
    if (!group) return;
    const trimmed = name.trim();
    if (trimmed) group.name = trimmed;
  };

  const deleteGroup = (groupId: string) => {
    if (groupId === UNGROUPED_SAVED_SEARCH_GROUP_ID) return;
    ensureShape();
    const ungrouped = main.searches.entries.filter(
      (e) => e.groupId === UNGROUPED_SAVED_SEARCH_GROUP_ID,
    );
    let nextOrder = ungrouped.length
      ? Math.max(...ungrouped.map((e) => e.order)) + 1
      : 0;
    for (const entry of main.searches.entries) {
      if (entry.groupId === groupId) {
        entry.groupId = UNGROUPED_SAVED_SEARCH_GROUP_ID;
        entry.order = nextOrder++;
      }
    }
    main.searches.groups = main.searches.groups.filter((g) => g.id !== groupId);
  };

  const setGroupCollapsed = (groupId: string, collapsed: boolean) => {
    ensureShape();
    const group = main.searches.groups.find((g) => g.id === groupId);
    if (group) group.collapsed = collapsed;
  };

  const replaceGroups = (next: SavedSearchGroup[]) => {
    ensureShape();
    const byId = new Map(main.searches.groups.map((g) => [g.id, g]));
    const normalized: SavedSearchGroup[] = [];
    for (let i = 0; i < next.length; i++) {
      const src = byId.get(next[i].id);
      if (!src) continue;
      src.order = i;
      normalized.push(src);
      byId.delete(src.id);
    }
    // Keep any groups missing from `next` (shouldn't happen) at the end.
    for (const leftover of byId.values()) {
      leftover.order = normalized.length;
      normalized.push(leftover);
    }
    main.searches.groups.splice(0, main.searches.groups.length, ...normalized);
  };

  const moveGroup = (groupId: string, direction: -1 | 1) => {
    ensureShape();
    const sorted = [...main.searches.groups].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((g) => g.id === groupId);
    const swapWith = sorted[idx + direction];
    if (idx < 0 || !swapWith) return;
    const tmp = sorted[idx].order;
    sorted[idx].order = swapWith.order;
    swapWith.order = tmp;
  };

  const moveEntryInGroup = (entryId: string, direction: -1 | 1) => {
    ensureShape();
    const entry = main.searches.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const siblings = main.searches.entries
      .filter((e) => e.groupId === entry.groupId)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((e) => e.id === entryId);
    const swapWith = siblings[idx + direction];
    if (!swapWith) return;
    const tmp = entry.order;
    entry.order = swapWith.order;
    swapWith.order = tmp;
  };

  return {
    groups,
    entries,
    entriesInGroup,
    deleteEntry,
    deleteEntryById,
    addEntry,
    updateEntry,
    updateEntryById,
    moveEntry,
    moveEntryInGroup,
    replaceEntries,
    replaceGroupEntries,
    createGroup,
    renameGroup,
    deleteGroup,
    setGroupCollapsed,
    replaceGroups,
    moveGroup,
    moveEntryToGroup,
    UNGROUPED_SAVED_SEARCH_GROUP_ID,
  };
});
