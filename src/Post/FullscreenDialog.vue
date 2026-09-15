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
        <!-- Document / story viewers need native scroll; ZoomPanImage hijacks wheel for zoom. -->
        <div
          v-if="current && isDocumentPost"
          class="middle bg-black document-middle"
          :class="blacklistClasses"
        >
          <iframe
            v-if="showPdfFrame"
            class="document-frame"
            :src="pdfFrameUrl"
            title="PDF document"
          />
          <div v-else class="document-scroll">
            <div class="document-body text-body-1">
              <div v-if="documentTitle" class="text-h5 mb-4">
                {{ documentTitle }}
              </div>
              <div
                v-if="documentBlurb"
                class="document-blurb mb-6 text-medium-emphasis"
              >
                {{ documentBlurb }}
              </div>
              <app-logo
                v-if="documentLoading"
                class="centered-in-container"
                svg-margin-auto
                type="loader"
              />
              <pre v-else class="document-text">{{ documentBodyText }}</pre>
              <div v-if="documentLoadError" class="mt-4 text-error">
                {{ documentLoadError }}
              </div>
            </div>
          </div>
        </div>
        <zoom-pan-image
          v-else
          @update-zoomed="isZoomed = $event"
          @swipe-down="!$event.zoomedIn && exitFullscreen()"
          @swipe-right="!$event.zoomedIn && showPreviousImage()"
          @swipe-left="!$event.zoomedIn && showNextImage()"
        >
          <div v-if="current" style="height: 100%" class="middle bg-black" :class="blacklistClasses">
            <ruffle-player v-if="current.file.ext == 'swf'" class="overflow flash" :url="currentFileUrl || null" />
            <video v-else-if="isVideoPost && currentFileUrl"
              ref="videoEl"
              class="overflow flash bg-black position-relative" controls
              :src="String(currentFileUrl)"
              :loop="!slideshowPlaying" autoplay playsinline preload="metadata"
              @ended="onVideoEnded"
              @volumechange="onFullscreenVolumeChange"
              @ratechange="onFullscreenRateChange">
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
                    <img
                      v-if="currentFileUrl"
                      ref="fullImageEl"
                      @loadstart="loadStart"
                      @load="onImageLoad"
                      @error="onImageError"
                      :class="{
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
      <div class="bottom-left" v-show="!hideUi && !isDocumentPost">
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
import { useAppearanceStore, useBlacklistStore, useMainStore, usePostsStore, useShortcutService, useSiteModeStore, useUiStore, useUrlStore } from "@/services";
import RufflePlayer from "./RufflePlayer.vue";
import ZoomPanImage from "./ZoomPanImage.vue";
import NotesOverlay from "./NotesOverlay.vue";
import { useBlacklistClasses } from "../misc/util/blacklist";
import { proxyDownloadUrl } from "@/misc/util/mediaProxy";
import { originAuthForPost, postFeedKey } from "@/misc/util/postOrigin";
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
const main = useMainStore();
const ui = useUiStore();
const shortcutService = useShortcutService();

const lastFullscreenId = ref<number | null>();
const isZoomed = ref(false);
const slideshowPlaying = ref(false);
const slideshowTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const fullImageEl = ref<HTMLImageElement | null>(null);
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

const buttons = computed(() => {
  let list = siteMode.filterButtons(posts.fullscreenButtons);
  if (props.current?.__meta?.originMode === "inkbunny") {
    list = list.filter((button) => button !== "favorite");
  }
  if (props.current?.__meta?.furaffinity?.kind === "journal") {
    list = list.filter((button) => button !== "favorite");
  }
  return list;
});
const isVideoExt = (ext?: string) => ext === "webm" || ext === "mp4";
const isVideoPost = computed(() => isVideoExt(props.current?.file.ext));
const DOCUMENT_EXTS = new Set(["txt", "pdf", "html", "doc", "rtf"]);
const IMAGE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "avif",
]);

const urlExt = (url?: string | null) => {
  if (!url) return "";
  try {
    const path = new URL(url, "https://local.invalid").pathname.toLowerCase();
    const ext = path.split(".").pop() || "";
    return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "";
  } catch {
    return "";
  }
};

const isDocumentPost = computed(() => {
  const ext = props.current?.file.ext || "";
  const fromUrl = urlExt(props.current?.file.url);
  const faType = props.current?.__meta?.furaffinity?.faType || "";
  return (
    DOCUMENT_EXTS.has(ext) ||
    DOCUMENT_EXTS.has(fromUrl) ||
    props.current?.__meta?.furaffinity?.kind === "journal" ||
    /^(text|story|poetry)$/i.test(faType)
  );
});

/** True when the downloadable file is a PDF (ext or URL), not merely a story blurb. */
const isPdfPost = computed(() => {
  const ext = props.current?.file.ext || "";
  if (ext === "pdf") return true;
  return urlExt(props.current?.file.url) === "pdf";
});

const documentTitle = computed(
  () => props.current?.__meta?.furaffinity?.title || "",
);

const documentBody = ref("");
const documentLoading = ref(false);
const documentLoadError = ref("");
/** Set when a "txt" URL turns out to be application/pdf after fetch. */
const resolvedPdfUrl = ref("");
let documentLoadToken = 0;

const documentBlurb = computed(() => {
  // Journals already put the full body in description — don't duplicate as a blurb.
  if (props.current?.__meta?.furaffinity?.kind === "journal") return "";
  const desc = (props.current?.description || "").trim();
  if (!desc) return "";
  // Only show the FA description box when we successfully loaded separate file content.
  if (!documentBody.value || documentBody.value === desc) return "";
  return desc;
});

const documentBodyText = computed(() => {
  if (documentLoading.value) return "";
  if (documentBody.value) return documentBody.value;
  return (
    props.current?.description ||
    "No text available for this post."
  );
});

const pdfFrameUrl = computed(() => {
  if (resolvedPdfUrl.value) return resolvedPdfUrl.value;
  if (!isPdfPost.value || switched.value) return "";
  const url = props.current?.file.url;
  if (!url) return "";
  // Avoid embedding the preview thumbnail if enrich failed to attach a real file.
  const preview = props.current?.preview?.url || "";
  if (preview && url === preview) return "";
  return proxyDownloadUrl(url) || "";
});

/** Show the PDF iframe when we know it's a PDF (ext/url) or content-type said so. */
const showPdfFrame = computed(() => !!pdfFrameUrl.value);

const open = computed(() => !!props.current);

const looksLikeBinaryGarbage = (text: string) => {
  if (!text) return true;
  const sample = text.slice(0, 4000);
  let weird = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0) return true;
    if (code < 8 || (code >= 14 && code < 32 && code !== 27)) weird++;
  }
  return weird / sample.length > 0.05;
};

const loadDocumentContent = async (post: EnhancedPost) => {
  const token = ++documentLoadToken;
  documentBody.value = "";
  documentLoadError.value = "";
  documentLoading.value = false;
  resolvedPdfUrl.value = "";

  if (isPdfPost.value) return;

  const isJournal = post.__meta?.furaffinity?.kind === "journal";
  const url = post.file?.url || "";
  const preview = post.preview?.url || "";
  const ext = (post.file?.ext || urlExt(url)).toLowerCase();

  // Journals already carry the full body in description after enrich.
  if (isJournal || !url || url === preview || IMAGE_EXTS.has(ext)) {
    documentBody.value = post.description || "";
    return;
  }

  // Binary office formats aren't readable as plain text in-browser.
  if (ext === "doc" || ext === "rtf") {
    documentBody.value = post.description || "";
    documentLoadError.value =
      "This file format can't be previewed here — use Download or open externally.";
    return;
  }

  documentLoading.value = true;
  try {
    const fetchUrl = proxyDownloadUrl(url) || url;
    const res = await fetch(fetchUrl);
    if (token !== documentLoadToken) return;
    if (!res.ok) throw new Error(`Failed to load story file (${res.status})`);
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("pdf")) {
      resolvedPdfUrl.value = fetchUrl;
      documentBody.value = "";
      return;
    }
    if (contentType.startsWith("image/")) {
      documentBody.value = post.description || "";
      return;
    }
    const text = await res.text();
    if (token !== documentLoadToken) return;
    if (looksLikeBinaryGarbage(text)) {
      documentBody.value = post.description || "";
      documentLoadError.value =
        "Couldn't read this file as text — use Download or open externally.";
      return;
    }
    documentBody.value = text.replace(/^\uFEFF/, "");
  } catch (err) {
    if (token !== documentLoadToken) return;
    documentBody.value = post.description || "";
    documentLoadError.value =
      err instanceof Error ? err.message : "Failed to load story file";
  } finally {
    if (token === documentLoadToken) documentLoading.value = false;
  }
};

watch(
  open,
  (isOpen) => {
    ui.fullscreenOpen = isOpen;
    if (!isOpen) {
      notes.value = [];
      notesLoadedFor.value = null;
      documentLoadToken += 1;
      documentBody.value = "";
      documentLoadError.value = "";
      documentLoading.value = false;
      resolvedPdfUrl.value = "";
    }
  },
  { immediate: true },
);

const loadNotesForCurrent = async () => {
  const post = props.current;
  const originInkbunny =
    siteMode.isInkbunny || post?.__meta?.originMode === "inkbunny";
  const originFa =
    siteMode.isFurAffinity || post?.__meta?.originMode === "furaffinity";
  if (!post?.has_notes || isVideoExt(post.file.ext) || siteMode.isLocal || originInkbunny || originFa) {
    notes.value = [];
    return;
  }
  const postId = post.id;
  if (notesLoadedFor.value === postId) return;
  try {
    const origin = originAuthForPost(post, main.$state, siteMode.activeMode);
    const service = await getApiService();
    const result = await service.getNotes({
      postId,
      baseUrl: origin.baseUrl,
      mode: origin.mode,
    });
    // Ignore stale responses after the user switched posts (H6).
    if (props.current?.id !== postId) return;
    notes.value = result;
    notesLoadedFor.value = postId;
  } catch (error) {
    if (props.current?.id !== postId) return;
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
      scrollToPost(props.current!);
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
  if (isDocumentPost.value) {
    // Don't auto-advance while reading text / PDF.
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
const onImageError = () => {
  // Broken URL — stop hiding the (failed) full image behind the sample (M19).
  loadEnd();
};

/** If the browser already has the image cached, @load may have fired before we set loading. */
const syncCachedImageState = async () => {
  await nextTick();
  const img = fullImageEl.value;
  if (img?.complete && img.naturalWidth > 0) {
    loadEnd();
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
    originMode: props.current.__meta?.originMode,
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

const scrollToPost = (post: { id: number; __meta?: { originMode?: string } } | number) => {
  const id =
    typeof post === "number"
      ? `post_${post}`
      : `post_${postFeedKey(post).replace(":", "-")}`;
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
};

const switched = ref(false);
const loading = ref(false);

const currentFileUrl = computed(() => {
  if (switched.value) return false;
  const url = props.current?.file.url;
  if (!url) return false;
  const ext = props.current?.file.ext;
  // Firefox/Zen: same-origin proxy for video + PDF under COEP.
  if (isVideoExt(ext) || ext === "pdf" || urlExt(url) === "pdf") {
    return proxyDownloadUrl(url);
  }
  return url;
});
const currentSampleFileUrl = computed(() =>
  switched.value ? false : props.current?.preview.url,
);

watch(
  () => props.current,
  async (val, prev) => {
    if (val) lastFullscreenId.value = val.id;
    if (val && (!prev || val.id != prev.id)) {
      clearSlideshowTimer();
      scrollToPost(props.current!);
      switched.value = true;
      await nextTick();
      switched.value = false;
      if (val) {
        await nextTick();
        loading.value = true;
        const isDoc =
          DOCUMENT_EXTS.has(val.file.ext) ||
          DOCUMENT_EXTS.has(urlExt(val.file.url)) ||
          val.__meta?.furaffinity?.kind === "journal" ||
          /^(text|story|poetry)$/i.test(val.__meta?.furaffinity?.faType || "");
        if (isDoc) {
          isZoomed.value = false;
          await loadDocumentContent(val);
          loadEnd();
        } else if (slideshowPlaying.value && isVideoExt(val.file.ext)) {
          // Wait for video ended; ensure playback starts.
          await nextTick();
          applyFullscreenPlaybackPrefs();
          videoEl.value?.play().catch(() => undefined);
          loadEnd();
        } else if (isVideoExt(val.file.ext)) {
          await nextTick();
          applyFullscreenPlaybackPrefs();
          loadEnd();
        } else {
          // Cached images may not re-fire @load after remount (M19).
          await syncCachedImageState();
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

.fullscreen .flex .document-middle {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.fullscreen .flex .document-frame {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  border: 0;
  background: #111;
}

.fullscreen .flex .document-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.fullscreen .flex .document-body {
  max-width: 48rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 5rem;
}

.fullscreen .flex .document-blurb {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
  border-left: 3px solid rgba(255, 255, 255, 0.2);
  padding-left: 0.85rem;
}

.fullscreen .flex .document-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.6;
  color: inherit;
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
