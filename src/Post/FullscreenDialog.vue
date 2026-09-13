<template>
  <v-dialog dark :model-value="open" fullscreen :scrim="false" transition="dialog-bottom-transition" scrollable
    persistent>
    <div class="fullscreen bg-grey-darken-4">
      <div class="flex">
        <div v-show="!hideUi" class="float-left" v-ripple="hasPreviousFullscreenPost" @click="showPreviousImage">
          <v-icon size="50" v-if="hasPreviousFullscreenPost">
            mdi-chevron-left
          </v-icon>
        </div>
        <zoom-pan-image @update-zoomed="isZoomed = $event" @swipe-down="!$event.zoomedIn && exitFullscreen()"
          @swipe-right="!$event.zoomedIn && showPreviousImage()" @swipe-left="!$event.zoomedIn && showNextImage()">
          <div v-if="current" style="height: 100%" class="middle bg-black" :class="blacklistClasses">
            <div v-if="current.file.ext == 'swf'" class="overflow flash">
              flash is not supported
            </div>
            <video v-else-if="isVideoPost && currentFileUrl"
              ref="videoEl"
              class="overflow flash bg-black position-relative" controls
              :loop="!slideshowPlaying" autoplay playsinline preload="metadata"
              @ended="onVideoEnded"
              @volumechange="onFullscreenVolumeChange"
              @ratechange="onFullscreenRateChange">
              <source v-if="current.file.url" :src="current.file.url" :type="videoType" />
              Video type not supported by your browser
            </video>
            <div v-else class="overflow">
              <div class="zoom-container text-center" style="position: relative">
                <transition :enter-active-class="enterTransitionName" :leave-active-class="leaveTransitionName"
                  mode="out-in">
                  <div :key="currentFileUrl || 0" style="
                      position: absolute;
                      width: 100%;
                      height: 100%;
                      left: 0;
                    ">
                    <img v-if="currentSampleFileUrl" :class="{ grey: false, 'darken-3': false }"
                      :src="currentSampleFileUrl" />
                    <img v-if="currentFileUrl" @loadstart="loadStart" @load="onImageLoad" :class="{
                      grey: false,
                      'darken-3': false,
                      hidden: loading,
                    }" :src="currentFileUrl" />
                    <notes-overlay
                      v-if="showNotesOverlay && current"
                      :notes="notes"
                      :image-width="current.file.width"
                      :image-height="current.file.height"
                    />
                  </div>
                </transition>
                <app-logo class="centered-in-container" svg-margin-auto v-if="loading" type="loader" />
              </div>
            </div>
          </div>
        </zoom-pan-image>
        <div v-show="!hideUi" class="float-right" v-ripple="hasNextFullscreenPost" @click="showNextImage">
          <v-icon size="50" v-if="hasNextFullscreenPost">
            mdi-chevron-right
          </v-icon>
        </div>
      </div>
      <div class="top-right" v-ripple @click.stop="exitFullscreen">
        <v-icon size="40" class="ml-2 mt-2">mdi-close</v-icon>
      </div>
      <div class="bottom-left" v-show="!hideUi">
        <v-btn icon size="large" color="white" variant="text" @click="toggleSlideshow">
          <v-icon size="36">{{ slideshowPlaying ? "mdi-pause" : "mdi-play" }}</v-icon>
        </v-btn>
        <v-btn
          v-if="current?.has_notes && !isVideoPost"
          icon
          size="large"
          color="white"
          variant="text"
          @click="notesVisible = !notesVisible"
        >
          <v-icon size="36">{{ notesVisible ? "mdi-note-text" : "mdi-note-text-outline" }}</v-icon>
        </v-btn>
      </div>
      <div class="bottom-right" v-show="!hideUi">
        <post-buttons v-if="current" :key="current.id" :buttons="buttons" :post="current"
          @open-post-details="$emit('open-post-details', $event)" @open-post-fullscreen="exitFullscreen()"
          @set-post-favorite="$emit('set-post-favorite', $event)" />
      </div>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import AppLogo from "../App/AppLogo.vue";
import { useAppearanceStore, useBlacklistStore, usePostsStore, useShortcutService, useSiteModeStore, useUiStore, useUrlStore } from "@/services";
import ZoomPanImage from "./ZoomPanImage.vue";
import NotesOverlay from "./NotesOverlay.vue";
import { useBlacklistClasses } from "../misc/util/blacklist";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  type PropType,
  type Ref,
  ref,
  watch,
} from "vue";
import PostButtons from "@/Post/PostButtons.vue";
import { useDirectionalTransitions } from "@/misc/util/directionalTransitions";
import type { EnhancedPost } from "@/worker/ApiService";
import type { Note } from "@/worker/api";
import { FullscreenZoomUiMode } from "@/services/types";
import type { usePostListManager } from "./postListManager";
import { useHead } from "@unhead/vue";
import { getApiService } from "@/worker/services";

const appIsFullscreen = ref(!!document.fullscreenElement);

let fsListenerRegistered = false;
if (!fsListenerRegistered) {
  document.querySelector("#app")?.addEventListener("fullscreenchange", () => {
    appIsFullscreen.value = !!document.fullscreenElement;
  });
  fsListenerRegistered = true;
}

const emit = defineEmits(["close", "next-post", "previous-post", "set-post-favorite", "open-post-details"]);


const props = defineProps({
  hasPreviousFullscreenPost: {
    type: Boolean,
    required: true,
  },
  hasNextFullscreenPost: {
    type: Boolean,
    required: true,
  },
  current: {
    type: null as unknown as PropType<null | EnhancedPost>,
    required: true,
  },
});



const appearance = useAppearanceStore();
const blacklist = useBlacklistStore();
const posts = usePostsStore();
const siteMode = useSiteModeStore();
const urlStore = useUrlStore();
const ui = useUiStore();
const shortcutService = useShortcutService();

const lastFullscreenId = ref<number | null>();
const isZoomed = ref(false);
const slideshowPlaying = ref(false);
const slideshowTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const notes = ref<Note[]>([]);
const notesVisible = ref(true);
const notesLoadedFor = ref<number | null>(null);
const postIsBlacklisted = computed(() =>
  Boolean(props?.current?.__meta.isBlacklisted),
);
const { classes: blacklistClasses } = useBlacklistClasses({
  mode: blacklist.mode,
  postIsBlacklisted,
});

const buttons = computed(() => siteMode.filterButtons(posts.fullscreenButtons));
const isVideoExt = (ext?: string) => ext === "webm" || ext === "mp4";
const isVideoPost = computed(() => isVideoExt(props.current?.file.ext));
const videoType = computed(() =>
  props.current?.file.ext === "mp4" ? "video/mp4" : "video/webm",
);
const open = computed(() => !!props.current);

watch(
  open,
  (isOpen) => {
    ui.fullscreenOpen = isOpen;
    if (!isOpen) {
      notes.value = [];
      notesLoadedFor.value = null;
    }
  },
  { immediate: true },
);

const loadNotesForCurrent = async () => {
  const post = props.current;
  if (!post?.has_notes || isVideoExt(post.file.ext) || siteMode.isLocal) {
    notes.value = [];
    return;
  }
  if (notesLoadedFor.value === post.id) return;
  try {
    const service = await getApiService();
    notes.value = await service.getNotes({
      postId: post.id,
      baseUrl: urlStore.e621Url,
    });
    notesLoadedFor.value = post.id;
  } catch (error) {
    console.error(error);
    notes.value = [];
  }
};

watch(
  () => props.current?.id,
  () => {
    notesVisible.value = true;
    void loadNotesForCurrent();
  },
);

const applyFullscreenPlaybackPrefs = () => {
  const el = videoEl.value;
  if (!el) return;
  el.muted = posts.videoMuted;
  el.volume = Math.min(1, Math.max(0, posts.videoVolume));
  el.playbackRate = posts.videoPlaybackRate || 1;
};

const onFullscreenVolumeChange = () => {
  const el = videoEl.value;
  if (!el) return;
  posts.videoMuted = el.muted;
  posts.videoVolume = el.volume;
};

const onFullscreenRateChange = () => {
  const el = videoEl.value;
  if (!el) return;
  posts.videoPlaybackRate = el.playbackRate;
};

const { enterTransitionName, leaveTransitionName, setTransitionNames } =
  useDirectionalTransitions({
    transitionName() {
      return appearance.fullscreenTransition;
    },
  });

const hideUi = computed(() => {
  switch (posts.fullscreenZoomUiMode) {
    case FullscreenZoomUiMode.neverHide:
      return false;
    case FullscreenZoomUiMode.alwaysHide:
      return true;
    default:
    case FullscreenZoomUiMode.hideWhileZoomed:
      return isZoomed.value;
  }
});

const showNotesOverlay = computed(
  () =>
    notesVisible.value &&
    !hideUi.value &&
    !isVideoPost.value &&
    !!props.current?.has_notes &&
    notes.value.length > 0,
);

const exitFullscreen = () => {
  stopSlideshow();
  const postId = props.current?.id;
  if (postId) {
    setTimeout(() => {
      scrollToPost(postId); // with vuetify 2 dialogs you could scroll the main content while the dialog was open; doesn't seem to work with vuetify 3; TODO: find more robust solution
    }, 200);
  }

  emit("close");
}

const clearSlideshowTimer = () => {
  if (slideshowTimer.value !== null) {
    clearTimeout(slideshowTimer.value);
    slideshowTimer.value = null;
  }
};

const stopSlideshow = () => {
  slideshowPlaying.value = false;
  clearSlideshowTimer();
};

const scheduleSlideshowAdvance = () => {
  clearSlideshowTimer();
  if (!slideshowPlaying.value || !props.current || isZoomed.value) return;
  if (isVideoExt(props.current.file.ext)) {
    // Video advances on @ended while slideshow is playing.
    return;
  }
  slideshowTimer.value = setTimeout(() => {
    if (!slideshowPlaying.value) return;
    if (!props.hasNextFullscreenPost) {
      stopSlideshow();
      return;
    }
    showNextImage();
  }, posts.slideshowIntervalMs);
};

const toggleSlideshow = () => {
  if (!open.value) return;
  if (slideshowPlaying.value) {
    stopSlideshow();
    return;
  }
  slideshowPlaying.value = true;
  scheduleSlideshowAdvance();
};

const onVideoEnded = () => {
  if (!slideshowPlaying.value) return;
  if (!props.hasNextFullscreenPost) {
    stopSlideshow();
    return;
  }
  showNextImage();
};

const loadTimeout: Ref<any> = ref(null);

const loadStart = () => {
  clearTimeout(loadTimeout.value);

  loadTimeout.value = setTimeout(() => {
    loading.value = true;
  }, 10);
};
const loadEnd = () => {
  clearTimeout(loadTimeout.value);
  loading.value = false;
};
const onImageLoad = () => {
  loadEnd();
  if (slideshowPlaying.value) {
    scheduleSlideshowAdvance();
  }
};

const showNextImage = () => {
  if (!props.hasNextFullscreenPost) {
    stopSlideshow();
    return;
  }
  clearSlideshowTimer();
  loadStart();
  emit("next-post");
  setTransitionNames("right");
};
const showPreviousImage = () => {
  if (!props.hasPreviousFullscreenPost) return;
  clearSlideshowTimer();
  loadStart();
  emit("previous-post");
  setTransitionNames("left");
};

const updateFavorite = (favorited: (current: boolean) => boolean) => () =>
  props.current && !props.current?.__meta.isFavoriteLoading && props.current.is_favorited !== favorited(props.current.is_favorited) && emit("set-post-favorite", {
    postId: props.current.id,
    favorited: favorited(props.current.is_favorited),
  } as Parameters<ReturnType<typeof usePostListManager>["setPostFavorite"]>["0"]);

const addFavorite = updateFavorite(() => true)
const removeFavorite = updateFavorite(() => false)
const toggleFavorite = updateFavorite((cur) => !cur)

onBeforeUnmount(() => {
  ui.fullscreenOpen = false;
  stopSlideshow();
  shortcutService.emitter.off("fullscreenNext", showNextImage);
  shortcutService.emitter.off("fullscreenPrevious", showPreviousImage);
  shortcutService.emitter.off("fullscreenExit", exitFullscreen);
  shortcutService.emitter.off("fullscreenAddFavorite", addFavorite);
  shortcutService.emitter.off("fullscreenRemoveFavorite", removeFavorite);
  shortcutService.emitter.off("fullscreenToggleFavorite", toggleFavorite);
  shortcutService.emitter.off("fullscreenSlideshowToggle", toggleSlideshow);
});
onMounted(() => {
  shortcutService.emitter.on("fullscreenNext", showNextImage);
  shortcutService.emitter.on("fullscreenPrevious", showPreviousImage);
  shortcutService.emitter.on("fullscreenExit", exitFullscreen);
  shortcutService.emitter.on("fullscreenAddFavorite", addFavorite);
  shortcutService.emitter.on("fullscreenRemoveFavorite", removeFavorite);
  shortcutService.emitter.on("fullscreenToggleFavorite", toggleFavorite);
  shortcutService.emitter.on("fullscreenSlideshowToggle", toggleSlideshow);
});

const scrollToPost = (postId: number) => {
  const post = document.getElementById(`post_${postId}`);
  post?.scrollIntoView({ behavior: "smooth", block: "center" });
};

const switched = ref(false);
const loading = ref(false);

const currentFileUrl = computed(() =>
  switched.value ? false : props.current?.file.url,
);
const currentSampleFileUrl = computed(() =>
  switched.value ? false : props.current?.preview.url,
);

watch(
  () => props.current,
  async (val, prev) => {
    if (val) lastFullscreenId.value = val.id;
    if (val && (!prev || val.id != prev.id)) {
      clearSlideshowTimer();
      scrollToPost(props.current!.id);
      switched.value = true;
      await nextTick();
      switched.value = false;
      if (val) {
        await nextTick();
        loading.value = true;
        if (slideshowPlaying.value && isVideoExt(val.file.ext)) {
          // Wait for video ended; ensure playback starts.
          await nextTick();
          applyFullscreenPlaybackPrefs();
          videoEl.value?.play().catch(() => undefined);
        } else if (isVideoExt(val.file.ext)) {
          await nextTick();
          applyFullscreenPlaybackPrefs();
        }
      }
    }
  },
);

watch(isZoomed, (zoomed) => {
  if (zoomed) {
    clearSlideshowTimer();
  } else if (slideshowPlaying.value) {
    scheduleSlideshowAdvance();
  }
});

watch(open, () => {
  if (!open.value) {
    stopSlideshow();
    setTransitionNames("none");
  }
  if (open.value && posts.goFullscreen) {
    // dialog.value?.requestFullscreen();
    document.querySelector("#app")?.requestFullscreen();
  } else {
    if (document.fullscreenElement) document.exitFullscreen();
    if (lastFullscreenId.value) {
      scrollToPost(lastFullscreenId.value);
    }
  }
});

watch(appIsFullscreen, () => {
  if (!appIsFullscreen.value && open.value) {
    exitFullscreen();
  }
});

useHead({
  title: () => props.current?.id ? `Post #${props.current.id}` : undefined
});
</script>

<style scoped>
.position-relative {
  position: relative;
}

.centered-in-container {
  display: flex;
  position: absolute;
  width: 100%;
  height: 100%;
}

.hidden {
  /* // visibility: hidden;
	 */
  opacity: 0;
}

.fullscreen {
  z-index: 198;
  position: fixed;
  height: 100vh;
  width: 100%;
  top: 0;
  left: 0;
  margin: 0;
  padding: 0;
}

.fullscreen .flex {
  position: relative;
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  height: 100vh;
  width: 100%;
}

.fullscreen .flex .left {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 59px;
}

.fullscreen .flex .middle {
  position: relative;
  flex-grow: 1;
  overflow: hidden;
}

.fullscreen .flex .middle .overflow {
  overflow: hidden;
  height: 100%;
  width: 100%;
}

.fullscreen .flex .middle .overflow .zoom-container {
  height: 100%;
  width: 100%;
  position: relative;
}

.fullscreen .flex .middle .overflow .zoom-container img {
  max-height: 100%;
  max-width: 100%;
  height: 100%;
  width: 100%;
  display: inline-block;
  object-fit: contain;
  top: 0;
  left: 0;
  position: absolute;
}

.fullscreen .flex .right {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 59px;
}

.fullscreen .top-right {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 1004;
  width: 59px;
  height: 59px;
}

.fullscreen .top-right button {
  float: right;
}

.fullscreen .bottom-right {
  position: fixed;
  bottom: 0;
  right: 0;
  z-index: 1005;
}

.fullscreen .bottom-right button {
  float: right;
}

.fullscreen .bottom-left {
  position: fixed;
  bottom: 0;
  left: 0;
  z-index: 1005;
}

.fullscreen .bottom-left button {
  float: left;
}

.fullscreen .top-left {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1005;
}

.fullscreen .top-left button {
  float: left;
}

.float-left,
.float-right {
  display: flex;
  align-items: center;
}
</style>
