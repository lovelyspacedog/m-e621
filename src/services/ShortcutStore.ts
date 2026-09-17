import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type { Shortcut } from "./types";
import { defaultSettings } from "./defaultSettings";
import clone from "clone";

export const useShortcutStore = defineStore("shortcuts", () => {
  const main = useMainStore();

  const shortcuts = computed(() => main.shortcuts);

  const deleteShortcut = (index: number) => {
    if (index < 0 || index >= main.shortcuts.length) return;
    main.shortcuts.splice(index, 1);
  };

  const addShortcut = (shortcut: Shortcut) => {
    if (!shortcut.sequence?.trim()) return;
    main.shortcuts.unshift(shortcut);
  };

  const updateShortcut = (index: number, shortcut: Shortcut) => {
    if (index < 0 || index >= main.shortcuts.length) return;
    if (!shortcut.sequence?.trim()) return;
    Object.assign(main.shortcuts[index], shortcut);
  };

  const resetShortcuts = () => {
    main.shortcuts = clone(defaultSettings.shortcuts);
  };

  return {
    shortcuts,
    deleteShortcut,
    addShortcut,
    updateShortcut,
    resetShortcuts,
  };
});
