import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import { useSnackbarStore } from "./SnackbarStore";
import type { SiteMode } from "./types";
import { SITE_MODE_URLS } from "./types";
import {
  applyActiveProfileToMirrors,
  syncMirrorsToActiveProfile,
} from "./siteProfiles";

export const useSiteModeStore = defineStore("site-mode", () => {
  const main = useMainStore();
  const snackbar = useSnackbarStore();

  const activeMode = computed(() => main.activeMode);
  const activeLabel = computed(() =>
    main.activeMode === "e6ai" ? "e6ai" : "e621",
  );

  const setMode = (mode: SiteMode) => {
    if (mode === main.activeMode) return;
    syncMirrorsToActiveProfile(main.$state);
    main.activeMode = mode;
    if (main.profiles[mode] && !main.profiles[mode].baseUrl) {
      main.profiles[mode].baseUrl = SITE_MODE_URLS[mode];
    }
    applyActiveProfileToMirrors(main.$state);
    snackbar.addMessage(`Switched to ${mode}`);
  };

  return {
    activeMode,
    activeLabel,
    setMode,
    siteModes: ["e621", "e6ai"] as SiteMode[],
  };
});
