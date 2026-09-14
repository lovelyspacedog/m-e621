import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useMainStore } from "./state";
import { useSnackbarStore } from "./SnackbarStore";
import type { ButtonType, SiteMode } from "./types";
import { SITE_MODE_URLS } from "./types";
import {
  applyActiveProfileToMirrors,
  createEmptySiteProfile,
  syncMirrorsToActiveProfile,
} from "./siteProfiles";

const LOCAL_HIDDEN_BUTTONS = new Set<ButtonType>([
  "external",
  "save_local",
]);

export const useSiteModeStore = defineStore("site-mode", () => {
  const main = useMainStore();
  const snackbar = useSnackbarStore();

  const activeMode = computed(() => main.activeMode);
  /** Incremented on every mode switch; pages can watch this to force-reload
   *  even when the route query doesn't change (e.g. blank /posts). */
  const modeChangeCount = ref(0);
  const isLocal = computed(() => main.activeMode === "local");
  const isTailspace = computed(() => main.activeMode === "tailspace");
  const isFurbooru = computed(() => main.activeMode === "furbooru");
  const activeLabel = computed(() => {
    switch (main.activeMode) {
      case "e6ai": return "e6ai";
      case "local": return "local";
      case "tailspace": return "tailspace";
      case "furbooru": return "Furbooru";
      default: return "e621";
    }
  });

  const setMode = (mode: SiteMode) => {
    if (mode === main.activeMode) return;
    syncMirrorsToActiveProfile(main.$state);
    if (!main.profiles[mode]) {
      main.profiles[mode] = createEmptySiteProfile(mode);
    }
    main.activeMode = mode;
    if (mode !== "local" && main.profiles[mode] && !main.profiles[mode].baseUrl) {
      main.profiles[mode].baseUrl = SITE_MODE_URLS[mode];
    }
    applyActiveProfileToMirrors(main.$state);
    snackbar.addMessage(`Switched to ${mode}`);
    modeChangeCount.value++;
  };

  const filterButtons = (buttons: ButtonType[]) =>
    isLocal.value
      ? buttons.filter((button) => !LOCAL_HIDDEN_BUTTONS.has(button))
      : buttons;

  return {
    activeMode,
    isLocal,
    isTailspace,
    isFurbooru,
    activeLabel,
    setMode,
    filterButtons,
    siteModes: ["e621", "e6ai", "local", "tailspace", "furbooru"] as SiteMode[],
    modeChangeCount,
  };
});
