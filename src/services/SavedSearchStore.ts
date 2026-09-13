import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type { SavedSearchEntry } from "./types";

export const parseSavedSearchTags = (raw: string) =>
  raw
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean);

export const useSavedSearchStore = defineStore("saved-search", () => {
  const main = useMainStore();
  const entries = computed(() => main.searches.entries);
  const deleteEntry = (index: number) => {
    if (index < 0 || index >= main.searches.entries.length) return;
    main.searches.entries.splice(index, 1);
  };
  const addEntry = (tags: string[], name: string) => {
    main.searches.entries.push({ name: name.trim() || tags.join(" "), tags });
  };
  const updateEntry = (
    index: number,
    patch: { name?: string; tags?: string[] },
  ) => {
    const entry = main.searches.entries[index];
    if (!entry) return;
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (name) entry.name = name;
    }
    if (patch.tags !== undefined) {
      entry.tags = [...patch.tags];
    }
  };
  const moveEntry = (from: number, to: number) => {
    const list = main.searches.entries;
    if (from === to) return;
    if (from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const [item] = list.splice(from, 1);
    if (!item) return;
    list.splice(to, 0, item);
  };
  const replaceEntries = (next: SavedSearchEntry[]) => {
    main.searches.entries.splice(0, main.searches.entries.length, ...next);
  };

  return {
    entries,
    deleteEntry,
    addEntry,
    updateEntry,
    moveEntry,
    replaceEntries,
  };
});
