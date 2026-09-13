import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import {
  UNGROUPED_FAVORITE_GROUP_ID,
  type FavoriteTagEntry,
  type FavoriteTagGroup,
} from "./types";

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useFavoritesStore = defineStore("favorites", () => {
  const main = useMainStore();

  const ensureUngrouped = () => {
    if (!main.favorites.groups.some((g) => g.id === UNGROUPED_FAVORITE_GROUP_ID)) {
      main.favorites.groups.unshift({
        id: UNGROUPED_FAVORITE_GROUP_ID,
        name: "Ungrouped",
        collapsed: false,
        order: 0,
      });
    }
  };

  const groups = computed(() =>
    [...main.favorites.groups].sort((a, b) => a.order - b.order),
  );
  const tags = computed(() =>
    [...main.favorites.tags].sort((a, b) => a.order - b.order),
  );
  const hasFavorites = computed(() => main.favorites.tags.length > 0);

  const isFavorited = computed(
    () => (name: string, category: string) =>
      main.favorites.tags.some((t) => t.name === name && t.category === category),
  );

  const tagsInGroup = computed(
    () => (groupId: string) =>
      main.favorites.tags
        .filter((t) => t.groupId === groupId)
        .sort((a, b) => a.order - b.order),
  );

  const setFavorite = (
    name: string,
    category: string,
    favorite: boolean,
    display?: string,
  ) => {
    ensureUngrouped();
    const existing = main.favorites.tags.find(
      (t) => t.name === name && t.category === category,
    );
    if (favorite) {
      if (existing) {
        if (display && display !== name) existing.display = display;
        else delete existing.display;
        return;
      }
      const groupTags = main.favorites.tags.filter(
        (t) => t.groupId === UNGROUPED_FAVORITE_GROUP_ID,
      );
      const entry: FavoriteTagEntry = {
        id: makeId("tag"),
        name,
        category,
        groupId: UNGROUPED_FAVORITE_GROUP_ID,
        order: groupTags.length
          ? Math.max(...groupTags.map((t) => t.order)) + 1
          : 0,
      };
      if (display && display !== name) entry.display = display;
      main.favorites.tags.push(entry);
    } else if (existing) {
      main.favorites.tags = main.favorites.tags.filter((t) => t.id !== existing.id);
    }
  };

  const createGroup = (name: string) => {
    ensureUngrouped();
    const trimmed = name.trim() || "New group";
    const order =
      main.favorites.groups.length === 0
        ? 0
        : Math.max(...main.favorites.groups.map((g) => g.order)) + 1;
    const group: FavoriteTagGroup = {
      id: makeId("group"),
      name: trimmed,
      collapsed: false,
      order,
    };
    main.favorites.groups.push(group);
    return group;
  };

  const renameGroup = (groupId: string, name: string) => {
    if (groupId === UNGROUPED_FAVORITE_GROUP_ID) return;
    const group = main.favorites.groups.find((g) => g.id === groupId);
    if (!group) return;
    const trimmed = name.trim();
    if (trimmed) group.name = trimmed;
  };

  const deleteGroup = (groupId: string) => {
    if (groupId === UNGROUPED_FAVORITE_GROUP_ID) return;
    ensureUngrouped();
    const ungroupedTags = main.favorites.tags.filter(
      (t) => t.groupId === UNGROUPED_FAVORITE_GROUP_ID,
    );
    let nextOrder = ungroupedTags.length
      ? Math.max(...ungroupedTags.map((t) => t.order)) + 1
      : 0;
    for (const tag of main.favorites.tags) {
      if (tag.groupId === groupId) {
        tag.groupId = UNGROUPED_FAVORITE_GROUP_ID;
        tag.order = nextOrder++;
      }
    }
    main.favorites.groups = main.favorites.groups.filter((g) => g.id !== groupId);
  };

  const setGroupCollapsed = (groupId: string, collapsed: boolean) => {
    const group = main.favorites.groups.find((g) => g.id === groupId);
    if (group) group.collapsed = collapsed;
  };

  const moveTag = (tagId: string, groupId: string) => {
    ensureUngrouped();
    if (!main.favorites.groups.some((g) => g.id === groupId)) return;
    const tag = main.favorites.tags.find((t) => t.id === tagId);
    if (!tag) return;
    const dest = main.favorites.tags.filter((t) => t.groupId === groupId);
    tag.groupId = groupId;
    tag.order = dest.length ? Math.max(...dest.map((t) => t.order)) + 1 : 0;
  };

  return {
    groups,
    tags,
    hasFavorites,
    isFavorited,
    tagsInGroup,
    setFavorite,
    createGroup,
    renameGroup,
    deleteGroup,
    setGroupCollapsed,
    moveTag,
    UNGROUPED_FAVORITE_GROUP_ID,
  };
});
