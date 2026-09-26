import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type { ButtonType } from "./types";

export const usePostsStore = defineStore("posts", () => {
  const main = useMainStore();
  const buttons = computed({
    get() {
      return [...main.posts.buttons];
    },
    set(value) {
      main.posts.buttons = [...value];
    },
  });
  const fullscreenButtons = computed({
    get() {
      return [...main.posts.fullscreenButtons];
    },
    set(value) {
      main.posts.fullscreenButtons = [...value];
    },
  });
  const detailsButtons = computed({
    get() {
      return [...main.posts.detailsButtons];
    },
    set(value) {
      main.posts.detailsButtons = [...value];
    },
  });
  const fullscreenZoomUiMode = computed({
    get() {
      return main.posts.fullscreenZoomUiMode;
    },
    set(value) {
      main.posts.fullscreenZoomUiMode = value;
    },
  });
  const postListFetchLimit = computed({
    get() {
      return main.posts.postListFetchLimit;
    },
    set(value) {
      main.posts.postListFetchLimit = value;
    },
  });
  const sidebarSuggestionLimit = computed({
    get() {
      return main.posts.sidebarSuggestionLimit;
    },
    set(value) {
      main.posts.sidebarSuggestionLimit = value;
    },
  });
  const tagFetchLimit = computed({
    get() {
      return main.posts.tagFetchLimit;
    },
    set(value) {
      main.posts.tagFetchLimit = value;
    },
  });
  const goFullscreen = computed({
    get() {
      return main.posts.goFullscreen;
    },
    set(value) {
      main.posts.goFullscreen = value;
    },
  });
  const dataSaver = computed({
    get() {
      return main.posts.dataSaver;
    },
    set(value) {
      main.posts.dataSaver = value;
    },
  });
  const lazyLoad = computed({
    get() {
      return main.posts.lazyLoadImages;
    },
    set(value) {
      main.posts.lazyLoadImages = value;
    },
  });
  const autoLoad = computed({
    get() {
      return main.posts.autoLoadNext;
    },
    set(value) {
      main.posts.autoLoadNext = value;
    },
  });
  const fullWidthFeed = computed({
    get() {
      return main.posts.fullWidthFeed;
    },
    set(value) {
      main.posts.fullWidthFeed = value;
    },
  });
  const slideshowIntervalMs = computed({
    get() {
      return main.posts.slideshowIntervalMs;
    },
    set(value) {
      main.posts.slideshowIntervalMs = value;
    },
  });
  const cardAutoNext = computed({
    get() {
      return main.posts.cardAutoNext;
    },
    set(value) {
      main.posts.cardAutoNext = value;
    },
  });
  const cardAutoNextIntervalMs = computed({
    get() {
      return main.posts.cardAutoNextIntervalMs;
    },
    set(value) {
      main.posts.cardAutoNextIntervalMs = value;
    },
  });
  const compactCards = computed({
    get() {
      return main.posts.compactCards;
    },
    set(value) {
      main.posts.compactCards = value;
    },
  });
  const alwaysCollapseToolbar = computed({
    get() {
      return main.posts.alwaysCollapseToolbar;
    },
    set(value) {
      main.posts.alwaysCollapseToolbar = value;
    },
  });
  const feedLayout = computed({
    get() {
      return main.posts.feedLayout;
    },
    set(value: "list" | "grid") {
      main.posts.feedLayout = value;
    },
  });
  const videoVolume = computed({
    get() {
      return main.posts.videoVolume;
    },
    set(value) {
      main.posts.videoVolume = value;
    },
  });
  const videoMuted = computed({
    get() {
      return main.posts.videoMuted;
    },
    set(value) {
      main.posts.videoMuted = value;
    },
  });
  const videoPlaybackRate = computed({
    get() {
      return main.posts.videoPlaybackRate;
    },
    set(value) {
      main.posts.videoPlaybackRate = value;
    },
  });
  const playbackPrefs = computed({
    get() {
      return main.posts.playbackPrefs || {};
    },
    set(value) {
      main.posts.playbackPrefs = value || {};
    },
  });
  const animateFeedGifs = computed({
    get() {
      return main.posts.animateFeedGifs;
    },
    set(value) {
      main.posts.animateFeedGifs = value;
    },
  });
  const autoplayFeedVideo = computed({
    get() {
      return main.posts.autoplayFeedVideo;
    },
    set(value) {
      main.posts.autoplayFeedVideo = value;
    },
  });
  const autoplayFeedVideoSilent = computed({
    get() {
      return main.posts.autoplayFeedVideoSilent;
    },
    set(value) {
      main.posts.autoplayFeedVideoSilent = value;
    },
  });
  const sfwOnly = computed({
    get() {
      return !!main.posts.sfwOnly;
    },
    set(value: boolean) {
      main.posts.sfwOnly = value;
      if (value) {
        void import("./SiteModeStore").then(({ useSiteModeStore }) => {
          useSiteModeStore().demoteFromVideo({
            reason: "Video mode is blocked while SFW only is on; switched to e621",
          });
        });
      }
    },
  });
  const videoModeEnabled = computed({
    get() {
      return !!main.misc.videoModeEnabled;
    },
    set(value: boolean) {
      main.misc.videoModeEnabled = value;
      if (!value) {
        void import("./SiteModeStore").then(({ useSiteModeStore }) => {
          useSiteModeStore().demoteFromVideo({
            reason: "Video mode turned off; switched to e621",
          });
        });
      }
    },
  });
  /** @deprecated Use videoModeEnabled */
  const xtraModeEnabled = videoModeEnabled;
  const saveLocalPathTemplate = computed({
    get() {
      return main.posts.saveLocal.pathTemplate;
    },
    set(value) {
      main.posts.saveLocal.pathTemplate = value;
    },
  });
  const saveLocalDirectoryName = computed({
    get() {
      return main.posts.saveLocal.directoryName;
    },
    set(value) {
      main.posts.saveLocal.directoryName = value;
    },
  });
  const openInLocalAfterSave = computed({
    get() {
      return !!main.posts.saveLocal.openInLocalAfterSave;
    },
    set(value) {
      main.posts.saveLocal.openInLocalAfterSave = value;
    },
  });
  const localDirectoryNames = computed({
    get() {
      return main.posts.localDirectoryNames;
    },
    set(value) {
      main.posts.localDirectoryNames = value;
    },
  });
  /** First browse folder name; prefer localDirectoryNames for multi-folder UI. */
  const localDirectoryName = computed({
    get() {
      return main.posts.localDirectoryNames[0] ?? null;
    },
    set(value) {
      main.posts.localDirectoryNames = value ? [value] : [];
    },
  });
  const allButtonTypes = computed<ButtonType[]>(() => [
    "info",
    "fullscreen",
    "external",
    "favorite",
    "bookmark",
    "save_local",
    "fluffle",
  ]);

  return {
    buttons,
    fullscreenButtons,
    detailsButtons,
    fullscreenZoomUiMode,
    postListFetchLimit,
    sidebarSuggestionLimit,
    tagFetchLimit,
    goFullscreen,
    dataSaver,
    lazyLoad,
    autoLoad,
    fullWidthFeed,
    slideshowIntervalMs,
    cardAutoNext,
    cardAutoNextIntervalMs,
    compactCards,
    alwaysCollapseToolbar,
    feedLayout,
    videoVolume,
    videoMuted,
    videoPlaybackRate,
    playbackPrefs,
    animateFeedGifs,
    autoplayFeedVideo,
    autoplayFeedVideoSilent,
    sfwOnly,
    xtraModeEnabled,
    videoModeEnabled,
    saveLocalPathTemplate,
    saveLocalDirectoryName,
    openInLocalAfterSave,
    localDirectoryNames,
    localDirectoryName,
    allButtonTypes,
  };
});
