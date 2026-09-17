import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { modeSupportsSavedPosts, originModeOf } from "@/misc/util/postOrigin";
import { supportsLocalBrowse } from "@/misc/util/tauriLocalFs";
import { hiddenButtonsForMode, modeSupportsFollowing } from "@/misc/util/siteCapabilities";
import { postSupportsFluffle } from "@/misc/util/fluffleSearch";
import { useMainStore } from "./state";
import { useSnackbarStore } from "./SnackbarStore";
import type { ButtonType, SiteMode, UnifiedChildMode, UnifiedFeedSource } from "./types";
import { SITE_MODE_URLS, defaultUnifiedSites } from "./types";
import {
  applyActiveProfileToMirrors,
  createEmptySiteProfile,
  profileHasAuthMaterial,
  syncMirrorsToActiveProfile,
} from "./siteProfiles";
import { getApiService } from "@/worker/services";

const ALL_SITE_MODES: SiteMode[] = [
  "unified",
  "e621",
  "e6ai",
  "furbooru",
  "inkbunny",
  "furaffinity",
  "weasyl",
  "itaku",
  "sofurry",
  "local",
  "tailspace",
];

/** Local needs Chromium FSA or the Tauri desktop shell. */
const isModeSupported = (mode: SiteMode) =>
  mode !== "local" || supportsLocalBrowse();

export const useSiteModeStore = defineStore("site-mode", () => {
  const main = useMainStore();
  const snackbar = useSnackbarStore();

  const activeMode = computed(() => main.activeMode);
  /** Incremented on every mode switch; pages can watch this to force-reload
   *  even when the route query doesn't change (e.g. blank /posts). */
  const modeChangeCount = ref(0);
  const isOnline = ref(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      isOnline.value = true;
    });
    window.addEventListener("offline", () => {
      isOnline.value = false;
    });
  }
  const supportsLocalMode = computed(() => supportsLocalBrowse());
  /** Remote modes need network; Local still works offline. */
  const isModeOnlineCapable = (mode: SiteMode) =>
    mode === "local" || isOnline.value;
  const siteModes = computed(() =>
    ALL_SITE_MODES.filter((mode) => isModeSupported(mode)),
  );
  const selectableSiteModes = computed(() =>
    siteModes.value.filter((mode) => isModeOnlineCapable(mode)),
  );
  const isLocal = computed(() => main.activeMode === "local");
  const isTailspace = computed(() => main.activeMode === "tailspace");
  const isFurbooru = computed(() => main.activeMode === "furbooru");
  const isInkbunny = computed(() => main.activeMode === "inkbunny");
  const isFurAffinity = computed(() => main.activeMode === "furaffinity");
  const isWeasyl = computed(() => main.activeMode === "weasyl");
  const isItaku = computed(() => main.activeMode === "itaku");
  const isSofurry = computed(() => main.activeMode === "sofurry");
  const isUnified = computed(() => main.activeMode === "unified");
  const activeLabel = computed(() => {
    switch (main.activeMode) {
      case "e6ai": return "e6ai";
      case "local": return "local";
      case "tailspace": return "tailspace";
      case "furbooru": return "Furbooru";
      case "inkbunny": return "Inkbunny";
      case "furaffinity": return "FurAffinity";
      case "weasyl": return "Weasyl";
      case "itaku": return "Itaku";
      case "sofurry": return "SoFurry";
      case "unified": return "Unified";
      default: return "e621";
    }
  });
  const unifiedSites = computed(() => ({
    ...defaultUnifiedSites(),
    ...(main.profiles.unified?.unifiedSites || {}),
  }));

  const unifiedFeedSource = computed<UnifiedFeedSource>(
    () => main.profiles.unified?.unifiedFeedSource || "search",
  );

  const setUnifiedFeedSource = (source: UnifiedFeedSource) => {
    if (!main.profiles.unified) {
      main.profiles.unified = createEmptySiteProfile("unified");
    }
    if (main.profiles.unified.unifiedFeedSource === source) return;
    if (source === "following") {
      const enabled = Object.entries(unifiedSites.value).filter(
        ([mode, on]) => on && modeSupportsFollowing(mode as UnifiedChildMode),
      );
      if (!enabled.length) {
        snackbar.addMessage(
          "Enable Inkbunny, FurAffinity, Itaku, or SoFurry for Following",
        );
        return;
      }
    }
    main.profiles.unified.unifiedFeedSource = source;
    if (main.activeMode === "unified") {
      void getApiService().then((api) => api.resetUnifiedMerge());
      modeChangeCount.value++;
    }
  };

  const applyUnifiedSitesPreset = (preset: "default" | "authenticated") => {
    if (!main.profiles.unified) {
      main.profiles.unified = createEmptySiteProfile("unified");
    }
    let next: Record<UnifiedChildMode, boolean>;
    if (preset === "default") {
      next = defaultUnifiedSites();
    } else {
      next = { ...defaultUnifiedSites() };
      for (const mode of Object.keys(next) as UnifiedChildMode[]) {
        const profile = main.profiles[mode] || createEmptySiteProfile(mode);
        // Profile credentials only — host FA_COOKIE_* does not count.
        next[mode] = profileHasAuthMaterial(mode, profile.account);
      }
      if (!Object.values(next).some(Boolean)) {
        snackbar.addMessage(
          "No site profiles have auth saved — enable sites manually or sign in first",
        );
        return;
      }
    }
    if (
      main.profiles.unified.unifiedFeedSource === "following" &&
      !Object.entries(next).some(
        ([mode, on]) => on && modeSupportsFollowing(mode as UnifiedChildMode),
      )
    ) {
      snackbar.addMessage(
        "Following needs Inkbunny, FurAffinity, Itaku, or SoFurry with auth",
      );
      return;
    }
    main.profiles.unified.unifiedSites = next;
    snackbar.addMessage(
      preset === "default"
        ? "Unified sites reset to defaults"
        : "Unified sites set to profiles with auth saved",
    );
    if (main.activeMode === "unified") {
      void getApiService().then((api) => api.resetUnifiedMerge());
      modeChangeCount.value++;
    }
  };

  const setUnifiedChild = (child: UnifiedChildMode, enabled: boolean) => {
    if (!main.profiles.unified) {
      main.profiles.unified = createEmptySiteProfile("unified");
    }
    const next = {
      ...defaultUnifiedSites(),
      ...main.profiles.unified.unifiedSites,
      [child]: enabled,
    };
    if (!Object.values(next).some(Boolean)) {
      snackbar.addMessage("Keep at least one site enabled");
      return;
    }
    if (
      main.profiles.unified.unifiedFeedSource === "following" &&
      !Object.entries(next).some(
        ([mode, on]) => on && modeSupportsFollowing(mode as UnifiedChildMode),
      )
    ) {
      snackbar.addMessage(
        "Following needs Inkbunny, FurAffinity, Itaku, or SoFurry enabled",
      );
      return;
    }
    main.profiles.unified.unifiedSites = next;
    if (main.activeMode === "unified") {
      void getApiService().then((api) => api.resetUnifiedMerge());
      modeChangeCount.value++;
    }
  };

  const setMode = (mode: SiteMode) => {
    if (mode === main.activeMode) return;
    if (!isModeSupported(mode)) {
      snackbar.addMessage(
        "Local mode needs the File System Access API (Chromium).",
      );
      return;
    }
    if (!isModeOnlineCapable(mode)) {
      snackbar.addMessage("Offline — only Local mode is available");
      return;
    }
    const previousWasUnified = main.activeMode === "unified";
    syncMirrorsToActiveProfile(main.$state);
    if (!main.profiles[mode]) {
      main.profiles[mode] = createEmptySiteProfile(mode);
    }
    main.activeMode = mode;
    if (mode !== "local" && mode !== "unified" && main.profiles[mode] && !main.profiles[mode].baseUrl) {
      main.profiles[mode].baseUrl = SITE_MODE_URLS[mode];
    }
    applyActiveProfileToMirrors(main.$state);
    snackbar.addMessage(`Switched to ${mode}`);
    modeChangeCount.value++;
    if (mode === "unified" || previousWasUnified) {
      void getApiService().then((api) => api.resetUnifiedMerge());
    }
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

  const supportsSavedPosts = computed(() =>
    modeSupportsSavedPosts(main.activeMode),
  );

  const filterButtons = (buttons: ButtonType[]) => {
    let list = buttons.filter(
      (button) => !hiddenButtonsForMode(main.activeMode).has(button),
    );
    if (!supportsSavedPosts.value) {
      list = list.filter((button) => button !== "bookmark");
    }
    return list;
  };

  /** Prefer this for post cards / details / fullscreen so Unified origins gate correctly. */
  const filterButtonsForPost = (
    buttons: ButtonType[],
    post?: {
      file?: { ext?: string; size?: number; url?: string | null };
      sample?: { url?: string };
      preview?: { url?: string };
      __meta?: {
        originMode?: string;
        furaffinity?: { kind?: string };
      };
    } | null,
  ) => {
    const mode = originModeOf(post, main.activeMode);
    let list = buttons.filter(
      (button) => !hiddenButtonsForMode(mode).has(button),
    );
    // Ambiguous Unified post without stamped origin — don't offer remote fave.
    if (main.activeMode === "unified" && !post?.__meta?.originMode) {
      list = list.filter((button) => button !== "favorite");
    }
    if (!modeSupportsSavedPosts(mode)) {
      list = list.filter((button) => button !== "bookmark");
    }
    if (post?.__meta?.furaffinity?.kind === "journal") {
      list = list.filter((button) => button !== "favorite");
    }
    if (post && list.includes("fluffle") && !postSupportsFluffle(post as any)) {
      list = list.filter((button) => button !== "fluffle");
    }
    return list;
  };

  /** Force PostsPage to reload (e.g. Local folder swapped while already in Local). */
  const bumpModeChange = () => {
    modeChangeCount.value++;
  };

  return {
    activeMode,
    supportsLocalMode,
    supportsSavedPosts,
    isLocal,
    isTailspace,
    isFurbooru,
    isInkbunny,
    isFurAffinity,
    isWeasyl,
    isItaku,
    isSofurry,
    isUnified,
    unifiedSites,
    unifiedFeedSource,
    setUnifiedChild,
    setUnifiedFeedSource,
    applyUnifiedSitesPreset,
    isOnline,
    selectableSiteModes,
    isModeOnlineCapable,
    activeLabel,
    setMode,
    bumpModeChange,
    ensureCompatibleActiveMode,
    filterButtons,
    filterButtonsForPost,
    siteModes,
    modeChangeCount,
  };
});
