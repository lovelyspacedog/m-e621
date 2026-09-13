import { defineStore } from "pinia";
import { computed } from "vue";
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
  const isLocal = computed(() => main.activeMode === "local");
  const activeLabel = computed(() =>
    main.activeMode === "e6ai"
      ? "e6ai"
      : main.activeMode === "local"
        ? "local"
        : "e621",
  );

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
  };

  const filterButtons = (buttons: ButtonType[]) =>
    isLocal.value
      ? buttons.filter((button) => !LOCAL_HIDDEN_BUTTONS.has(button))
      : buttons;

  return {
    activeMode,
    isLocal,
    activeLabel,
    setMode,
    filterButtons,
    siteModes: ["e621", "e6ai", "local"] as SiteMode[],
  };
});
