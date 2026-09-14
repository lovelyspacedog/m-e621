import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { supportsDirectoryPicker } from "@/misc/util/saveLocal";
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

const INKBUNNY_HIDDEN_BUTTONS = new Set<ButtonType>([
  "favorite",
]);

const ALL_SITE_MODES: SiteMode[] = [
  "e621",
  "e6ai",
  "local",
  "tailspace",
  "furbooru",
  "inkbunny",
];

/** Modes that need File System Access API (Chromium). */
const isModeSupported = (mode: SiteMode) =>
  mode !== "local" || supportsDirectoryPicker();

export const useSiteModeStore = defineStore("site-mode", () => {
  const main = useMainStore();
  const snackbar = useSnackbarStore();

  const activeMode = computed(() => main.activeMode);
  /** Incremented on every mode switch; pages can watch this to force-reload
   *  even when the route query doesn't change (e.g. blank /posts). */
  const modeChangeCount = ref(0);
  const supportsLocalMode = computed(() => supportsDirectoryPicker());
  const isLocal = computed(() => main.activeMode === "local");
  const isTailspace = computed(() => main.activeMode === "tailspace");
  const isFurbooru = computed(() => main.activeMode === "furbooru");
  const isInkbunny = computed(() => main.activeMode === "inkbunny");
  const siteModes = computed(() =>
    ALL_SITE_MODES.filter((mode) => isModeSupported(mode)),
  );
  const activeLabel = computed(() => {
    switch (main.activeMode) {
      case "e6ai": return "e6ai";
      case "local": return "local";
      case "tailspace": return "tailspace";
      case "furbooru": return "Furbooru";
      case "inkbunny": return "Inkbunny";
      default: return "e621";
    }
  });

  const setMode = (mode: SiteMode) => {
    if (mode === main.activeMode) return;
    if (!isModeSupported(mode)) {
      snackbar.addMessage(
        "Local mode needs the File System Access API (Chromium).",
      );
      return;
    }
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

  /** If restored settings point at an unsupported mode, fall back quietly. */
  const ensureCompatibleActiveMode = () => {
    if (isModeSupported(main.activeMode)) return;
    const fallback: SiteMode = "e621";
    syncMirrorsToActiveProfile(main.$state);
    if (!main.profiles[fallback]) {
      main.profiles[fallback] = createEmptySiteProfile(fallback);
    }
    main.activeMode = fallback;
    applyActiveProfileToMirrors(main.$state);
    modeChangeCount.value++;
    snackbar.addMessage("Local mode is unavailable in this browser; switched to e621");
  };

  const filterButtons = (buttons: ButtonType[]) => {
    if (isLocal.value) return buttons.filter((button) => !LOCAL_HIDDEN_BUTTONS.has(button));
    if (isInkbunny.value) return buttons.filter((button) => !INKBUNNY_HIDDEN_BUTTONS.has(button));
    return buttons;
  };

  return {
    activeMode,
    supportsLocalMode,
    isLocal,
    isTailspace,
    isFurbooru,
    isInkbunny,
    activeLabel,
    setMode,
    ensureCompatibleActiveMode,
    filterButtons,
    siteModes,
    modeChangeCount,
  };
});
