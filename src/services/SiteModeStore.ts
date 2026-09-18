import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { modeSupportsSavedPosts, originModeOf } from "@/misc/util/postOrigin";
import { supportsLocalBrowse } from "@/misc/util/tauriLocalFs";
import { hiddenButtonsForMode, modeSupportsFollowing } from "@/misc/util/siteCapabilities";
import { postSupportsFluffle } from "@/misc/util/fluffleSearch";
import { useMainStore } from "./state";
import { useSnackbarStore } from "./SnackbarStore";
import type { ButtonType, SiteMode, UnifiedChildMode, UnifiedFeedSource } from "./types";
import { SITE_MODE_URLS, UNIFIED_CHILD_MODES, defaultUnifiedSites } from "./types";
import {
  applyActiveProfileToMirrors,
  createEmptySiteProfile,
  profileHasAuthMaterial,
  syncMirrorsToActiveProfile,
} from "./siteProfiles";
import { getApiService } from "@/worker/services";
import type { EnhancedPost } from "@/worker/ApiService";

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
  "flayrah",
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
  const supportsLocalMode = computed(() => supportsLocalBrowse());
  /** Remote modes need network; Local and Flayrah (last-good RSS cache) still work offline. */
  const isModeOnlineCapable = (mode: SiteMode) =>
    mode === "local" || mode === "flayrah" || isOnline.value;
  const siteModes = computed(() =>
    ALL_SITE_MODES.filter((mode) => isModeSupported(mode)),
  );
  const selectableSiteModes = computed(() =>
    siteModes.value.filter((mode) => isModeOnlineCapable(mode)),
  );
  const isLocal = computed(() => main.activeMode === "local");
  const isTailspace = computed(() => main.activeMode === "tailspace");
  const isFlayrah = computed(() => main.activeMode === "flayrah");
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
      case "flayrah": return "Flayrah";
      case "furbooru": return "Furbooru";
      case "inkbunny": return "Inkbunny";
      case "furaffinity": return "FurAffinity";
      case "weasyl": return "Weasyl";
      case "itaku": return "Itaku";
      case "sofurry": return "SoFurry";
      case "unified": return "Federated";
      default: return "e621";
    }
  });
  const unifiedSites = computed(() => ({
    ...defaultUnifiedSites(),
    ...main.profiles.unified?.unifiedSites,
  }));

  const unifiedFeedSource = computed<UnifiedFeedSource>(
    () => main.profiles.unified?.unifiedFeedSource || "search",
  );

  const unifiedIncludeTailspaceComics = computed(
    () => main.profiles.unified?.unifiedIncludeTailspaceComics !== false,
  );

  const setUnifiedIncludeTailspaceComics = (enabled: boolean) => {
    if (!main.profiles.unified) {
      main.profiles.unified = createEmptySiteProfile("unified");
    }
    if (main.profiles.unified.unifiedIncludeTailspaceComics === enabled) return;
    main.profiles.unified.unifiedIncludeTailspaceComics = enabled;
    if (main.activeMode === "unified") {
      modeChangeCount.value++;
    }
  };

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
      next = authenticatedUnifiedSites();
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
        ? "Federated sites reset to defaults"
        : "Federated sites set to profiles with auth saved",
    );
    if (main.activeMode === "unified") {
      void getApiService().then((api) => api.resetUnifiedMerge());
      modeChangeCount.value++;
    }
  };

  const authenticatedUnifiedSites = () => {
    const next = { ...defaultUnifiedSites() };
    for (const mode of Object.keys(next) as UnifiedChildMode[]) {
      const profile = main.profiles[mode] || createEmptySiteProfile(mode);
      // Profile credentials only — host FA_COOKIE_* does not count.
      next[mode] = profileHasAuthMaterial(mode, profile.account);
    }
    return next;
  };

  const unifiedSitesMatch = (
    a: Record<UnifiedChildMode, boolean>,
    b: Record<UnifiedChildMode, boolean>,
  ) =>
    (Object.keys(defaultUnifiedSites()) as UnifiedChildMode[]).every(
      (mode) => !!a[mode] === !!b[mode],
    );

  /** True when current Unified site toggles match a preset map. */
  const isUnifiedSitesPresetActive = (preset: "default" | "authenticated") => {
    if (preset === "default") {
      return unifiedSitesMatch(unifiedSites.value, defaultUnifiedSites());
    }
    const auth = authenticatedUnifiedSites();
    if (!Object.values(auth).some(Boolean)) return false;
    return unifiedSitesMatch(unifiedSites.value, auth);
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

  const setMode = (mode: SiteMode, opts?: { silent?: boolean }) => {
    if (mode === main.activeMode) return;
    if (!isModeSupported(mode)) {
      snackbar.addMessage(
        "Local mode needs the File System Access API (Chromium).",
      );
      return;
    }
    if (!isModeOnlineCapable(mode)) {
      snackbar.addMessage("Offline — only Local and Flayrah are available");
      return;
    }
    const previous = main.activeMode;
    const previousWasUnified = previous === "unified";
    if (mode === "unified" && !previousWasUnified) {
      main.previousModeBeforeUnified = previous;
      // Preserve persisted unifiedSites (Defaults / Auth-only / chip picks).
      // Only create an empty profile when missing — defaults are already all-on.
      if (!main.profiles.unified) {
        main.profiles.unified = createEmptySiteProfile("unified");
      }
    }
    syncMirrorsToActiveProfile(main.$state);
    if (!main.profiles[mode]) {
      main.profiles[mode] = createEmptySiteProfile(mode);
    }
    main.activeMode = mode;
    if (mode !== "local" && mode !== "unified" && main.profiles[mode] && !main.profiles[mode].baseUrl) {
      main.profiles[mode].baseUrl = SITE_MODE_URLS[mode];
    }
    applyActiveProfileToMirrors(main.$state);
    if (!opts?.silent) {
      snackbar.addMessage(`Switched to ${mode}`);
    }
    modeChangeCount.value++;
    if (mode === "unified" || previousWasUnified) {
      void getApiService().then((api) => api.resetUnifiedMerge());
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      isOnline.value = true;
    });
    window.addEventListener("offline", () => {
      isOnline.value = false;
      // Stay on the current remote mode (cached UI may still show), but offer a working mode.
      if (isModeOnlineCapable(main.activeMode)) return;
      const preferLocal = supportsLocalBrowse();
      snackbar.addMessage("Offline — only Local and Flayrah are available", {
        label: preferLocal ? "Switch to Local" : "Switch to Flayrah",
        onClick: () => setMode(preferLocal ? "local" : "flayrah"),
      });
    });
  }

  /** Leave Federated for the prior site (fallback e621). */
  const exitUnifiedMode = (opts?: { silent?: boolean }) => {
    const prev = main.previousModeBeforeUnified;
    main.previousModeBeforeUnified = null;
    const target: SiteMode =
      prev && prev !== "unified" && isModeSupported(prev) && isModeOnlineCapable(prev)
        ? prev
        : "e621";
    if (main.activeMode === "unified") {
      setMode(target, opts);
    }
  };

  /**
   * Landing should not open on Federated unless the user just came from Browse
   * posts (`Posts`). Cold open / other routes demote to the persisted previous
   * mode (fallback e621).
   */
  const demoteUnifiedOnLanding = (opts: { fromBrowsePosts: boolean }) => {
    if (opts.fromBrowsePosts) return;
    if (main.activeMode !== "unified") return;
    exitUnifiedMode({ silent: true });
  };

  const isUnifiedChildMode = (mode: SiteMode): mode is UnifiedChildMode =>
    (UNIFIED_CHILD_MODES as SiteMode[]).includes(mode);

  /** Modes that cannot join Federated Posts search (greyed on chips). */
  const isFederatedIncompatible = (mode: SiteMode) =>
    mode === "local" || mode === "tailspace" || mode === "flayrah";

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
    if (post && list.includes("fluffle") && !postSupportsFluffle(post as unknown as EnhancedPost)) {
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
    isFlayrah,
    isFurbooru,
    isInkbunny,
    isFurAffinity,
    isWeasyl,
    isItaku,
    isSofurry,
    isUnified,
    unifiedSites,
    unifiedFeedSource,
    unifiedIncludeTailspaceComics,
    setUnifiedIncludeTailspaceComics,
    setUnifiedChild,
    setUnifiedFeedSource,
    applyUnifiedSitesPreset,
    isUnifiedSitesPresetActive,
    isOnline,
    selectableSiteModes,
    isModeOnlineCapable,
    isUnifiedChildMode,
    isFederatedIncompatible,
    activeLabel,
    setMode,
    exitUnifiedMode,
    demoteUnifiedOnLanding,
    bumpModeChange,
    ensureCompatibleActiveMode,
    filterButtonsForPost,
    siteModes,
    modeChangeCount,
  };
});
