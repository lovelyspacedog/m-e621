<template>
  <v-dialog dark :model-value="open" fullscreen :scrim="false" transition="dialog-bottom-transition" scrollable
    persistent>
    <div class="fullscreen bg-grey-darken-4" :class="{ 'fullscreen--comments': commentsVisible && supportsComments }">
      <div class="flex">
        <div v-show="!hideUi" class="float-left" v-ripple="hasPreviousFullscreenPost" @click="showPreviousImage">
          <v-icon size="50" v-if="hasPreviousFullscreenPost">
            mdi-chevron-left
          </v-icon>
        </div>
        <!-- Document / story viewers need native scroll; ZoomPanImage hijacks wheel for zoom. -->
        <div
          v-if="current && isUnavailablePost"
          class="middle bg-black document-middle"
          :class="blacklistClasses"
        >
          <div class="unavailable-fullscreen">
            <v-icon size="72" color="white">mdi-image-off-outline</v-icon>
            <div class="text-h6 mt-4">Submission unavailable</div>
            <p class="mt-2 text-medium-emphasis text-center">
              This post is no longer on FurAffinity.
            </p>
          </div>
        </div>
        <div
          v-else-if="current && isDocumentPost"
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
            <div
              v-else-if="isAudioPost && currentFileUrl"
              class="overflow flash bg-black fullscreen-audio-wrap"
            >
              <img
                v-if="audioCoverUrl"
                :src="audioCoverUrl"
                class="fullscreen-audio-cover"
                alt=""
              />
              <v-icon v-else size="96" class="mb-4">mdi-music</v-icon>
              <audio
                class="fullscreen-audio"
                controls
                autoplay
                preload="metadata"
                :src="String(currentFileUrl)"
                @ended="onVideoEnded"
              />
            </div>
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
        <aside
          v-if="commentsVisible && supportsComments && current"
          class="fullscreen-comments"
          :style="{ width: `${commentsWidthPx}px` }"
          @click.stop
        >
          <div
            class="fullscreen-comments-resizer"
            title="Drag to resize"
            @pointerdown="startCommentsResize"
          />
          <div class="fullscreen-comments-header text-subtitle-2">
            <span>
              Comments
              <span v-if="current.comment_count" class="text-medium-emphasis">
                ({{ current.comment_count }})
              </span>
            </span>
            <v-btn
              icon
              size="small"
              variant="text"
              color="white"
              title="Hide comments"
              @click="toggleComments"
            >
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </div>
          <div class="fullscreen-comments-body">
            <section class="fullscreen-comments-section">
              <button
                class="fullscreen-comments-section-toggle text-caption text-medium-emphasis"
                type="button"
                :aria-expanded="infoExpanded"
                @click="infoExpanded = !infoExpanded"
              >
                <span>Info</span>
                <v-icon size="small">
                  {{ infoExpanded ? "mdi-chevron-up" : "mdi-chevron-down" }}
                </v-icon>
              </button>
              <post-info-list
                v-show="infoExpanded"
                :post="current"
                @set-post-vote="$emit('set-post-vote', $event)"
              />
            </section>
            <section class="fullscreen-comments-section">
              <button
                class="fullscreen-comments-section-toggle text-caption text-medium-emphasis"
                type="button"
                :aria-expanded="descriptionExpanded"
                @click="descriptionExpanded = !descriptionExpanded"
              >
                <span>Description</span>
                <v-icon size="small">
                  {{ descriptionExpanded ? "mdi-chevron-up" : "mdi-chevron-down" }}
                </v-icon>
              </button>
              <div v-show="descriptionExpanded">
                <div
                  v-if="isSofurryStory"
                  class="text-body-2 sofurry-story"
                >
                  <div v-if="sofurryStoryTitle" class="text-subtitle-2 mb-2">
                    {{ sofurryStoryTitle }}
                  </div>
                  <pre class="sofurry-story-text">{{
                    current.description || "No story text"
                  }}</pre>
                </div>
                <div v-else class="text-body-2">
                  <d-text :text="current.description || 'No description'" />
                </div>
              </div>
            </section>
            <section class="fullscreen-comments-section fullscreen-comments-section--last">
              <div class="text-caption text-medium-emphasis mb-2">Comments</div>
              <post-comments-panel :post="current" />
            </section>
          </div>
        </aside>
      </div>
      <div
        class="top-right"
        :style="commentsChromeOffset"
        v-ripple
        @click.stop="exitFullscreen"
      >
        <v-icon size="40" class="ml-2 mt-2">mdi-close</v-icon>
      </div>
      <div class="bottom-left" v-show="!hideUi && !isDocumentPost && !isUnavailablePost">
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
        <v-btn
          v-if="supportsComments"
          icon
          size="large"
          color="white"
          variant="text"
          :title="commentsVisible ? 'Hide comments' : 'Show comments'"
          @click="toggleComments"
        >
          <v-icon size="36">{{ commentsVisible ? "mdi-comment" : "mdi-comment-outline" }}</v-icon>
        </v-btn>
      </div>
      <div class="bottom-right" v-show="!hideUi" :style="commentsChromeOffset">
        <post-buttons v-if="current" :key="current.id" :buttons="buttons" :post="current"
          @open-post-details="$emit('open-post-details', $event)" @open-post-fullscreen="exitFullscreen()"
          @set-post-favorite="$emit('set-post-favorite', $event)"
          @open-fluffle-search="$emit('open-fluffle-search', $event)" />
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
import PostCommentsPanel from "./PostCommentsPanel.vue";
import PostInfoList from "./PostInfoList.vue";
import DText from "../Parser/DText.vue";
import { useBlacklistClasses } from "../misc/util/blacklist";
import { isAudioExt } from "@/misc/util/audioExts";
import { proxyDownloadUrl } from "@/misc/util/mediaProxy";
import { isDocumentPost as postIsDocument } from "@/misc/util/documentPost";
import { docxToText, isDocx } from "@/misc/util/docxToText";
import { isRtf, rtfToText } from "@/misc/util/rtfToText";
import { openPostOnSourceSite } from "@/misc/util/url";
import { originAuthForPost, originModeOf, postFeedKey } from "@/misc/util/postOrigin";
import {
  modeSupportsNotes,
  postSupportsComments,
} from "@/misc/util/siteCapabilities";
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
import { useRoute } from "vue-router";
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

const emit = defineEmits<{
  close: [];
  "next-post": [opts?: { skipDocuments?: boolean }];
  "previous-post": [];
  "set-post-favorite": [payload: unknown];
  "set-post-vote": [payload: unknown];
  "open-post-details": [payload: unknown];
  "open-fluffle-search": [post: EnhancedPost];
}>();


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
const route = useRoute();

const COMMENTS_POOL_KEY = "fullscreen-comments-pools";
const COMMENTS_FEED_KEY = "fullscreen-comments-feed";
const COMMENTS_WIDTH_KEY = "fullscreen-comments-width";
const COMMENTS_WIDTH_DEFAULT = 360;
const COMMENTS_WIDTH_MIN = 240;
const infoExpanded = ref(true);
const descriptionExpanded = ref(true);

const clampCommentsWidth = (px: number) => {
  const max = Math.max(
    COMMENTS_WIDTH_MIN,
    Math.floor(window.innerWidth * 0.7),
  );
  return Math.min(max, Math.max(COMMENTS_WIDTH_MIN, Math.round(px)));
};

const readCommentsWidth = () => {
  try {
    const raw = localStorage.getItem(COMMENTS_WIDTH_KEY);
    if (raw == null) return COMMENTS_WIDTH_DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return COMMENTS_WIDTH_DEFAULT;
    return clampCommentsWidth(n);
  } catch {
    return COMMENTS_WIDTH_DEFAULT;
  }
};

const writeCommentsWidth = (px: number) => {
  try {
    localStorage.setItem(COMMENTS_WIDTH_KEY, String(px));
  } catch {
    /* ignore */
  }
};

const readCommentsPref = (pools: boolean): boolean => {
  try {
    const raw = localStorage.getItem(pools ? COMMENTS_POOL_KEY : COMMENTS_FEED_KEY);
    if (raw === null) return pools; // pools default on; feed default off
    return raw === "1";
  } catch {
    return pools;
  }
};

const writeCommentsPref = (pools: boolean, value: boolean) => {
  try {
    localStorage.setItem(
      pools ? COMMENTS_POOL_KEY : COMMENTS_FEED_KEY,
      value ? "1" : "0",
    );
  } catch {
    /* ignore */
  }
};

const isPoolsFullscreen = computed(() => route.name === "Pool");
const commentsVisible = ref(readCommentsPref(route.name === "Pool"));
const commentsWidthPx = ref(readCommentsWidth());

const supportsComments = computed(() =>
  postSupportsComments(props.current, siteMode.activeMode),
);

/** Shift fixed chrome left of the comments rail (inline wins over CSS). */
const commentsChromeOffset = computed(() =>
  commentsVisible.value && supportsComments.value
    ? { right: `${commentsWidthPx.value}px` }
    : undefined,
);
const toggleComments = () => {
  commentsVisible.value = !commentsVisible.value;
  writeCommentsPref(isPoolsFullscreen.value, commentsVisible.value);
};

let commentsResizeCleanup: (() => void) | null = null;

const startCommentsResize = (event: PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startWidth = commentsWidthPx.value;
  const target = event.currentTarget as HTMLElement | null;
  target?.setPointerCapture?.(event.pointerId);

  const onMove = (ev: PointerEvent) => {
    // Dragging the left edge leftward widens the panel.
    commentsWidthPx.value = clampCommentsWidth(startWidth + (startX - ev.clientX));
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    writeCommentsWidth(commentsWidthPx.value);
    commentsResizeCleanup = null;
  };
  commentsResizeCleanup?.();
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  commentsResizeCleanup = onUp;
};

watch(isPoolsFullscreen, (pools) => {
  commentsVisible.value = readCommentsPref(pools);
});

const lastFullscreenId = ref<number | null>();
const isZoomed = ref(false);
const slideshowPlaying = ref(false);
const slideshowTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const fullImageEl = ref<HTMLImageElement | null>(null);
const notes = ref<Note[]>([]);
const notesVisible = ref(true);
const notesLoadedFor = ref<string | null>(null);
const postIsBlacklisted = computed(() =>
  Boolean(props?.current?.__meta.isBlacklisted),
);
const isUnavailablePost = computed(() =>
  Boolean(props.current?.__meta?.furaffinity?.unavailable),
);
const { classes: blacklistClasses } = useBlacklistClasses({
  mode: blacklist.mode,
  postIsBlacklisted,
});

const buttons = computed(() =>
  siteMode.filterButtonsForPost(posts.fullscreenButtons, props.current),
);
const isVideoExt = (ext?: string) => ext === "webm" || ext === "mp4";
const isVideoPost = computed(() => isVideoExt(props.current?.file.ext));
const isAudioPost = computed(() => isAudioExt(props.current?.file.ext));
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

const isDocumentPost = computed(() => postIsDocument(props.current));

/** True when the downloadable file is a PDF (ext or URL), not merely a story blurb. */
const isPdfPost = computed(() => {
  const ext = props.current?.file.ext || "";
  if (ext === "pdf") return true;
  return urlExt(props.current?.file.url) === "pdf";
});

const documentTitle = computed(
  () =>
    props.current?.__meta?.sofurry?.title ||
    props.current?.__meta?.furaffinity?.title ||
    "",
);

const isSofurryStory = computed(
  () =>
    props.current?.__meta?.kind === "story" &&
    !!props.current?.__meta?.sofurry,
);

const sofurryStoryTitle = computed(
  () => props.current?.__meta?.sofurry?.title || "",
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
  const softBlurb = props.current?.__meta?.sofurry?.blurb?.trim();
  if (softBlurb && documentBody.value && softBlurb !== documentBody.value) {
    return softBlurb;
  }
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
  const isSoftStory = post.__meta?.kind === "story" && !!post.__meta?.sofurry;
  const url = post.file?.url || "";
  const preview = post.preview?.url || "";
  const ext = (post.file?.ext || urlExt(url)).toLowerCase();

  // Journals / Soft stories carry the full body in description after enrich.
  if (isJournal || isSoftStory || !url || url === preview || IMAGE_EXTS.has(ext)) {
    documentBody.value = post.description || "";
    return;
  }

  // Legacy .doc (OLE) isn't readable as text; RTF/DOCX handled below.
  if (ext === "doc") {
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

    const isDocxType =
      ext === "docx" ||
      contentType.includes("wordprocessingml") ||
      contentType.includes("application/vnd.openxmlformats-officedocument");

    if (isDocxType) {
      const buf = await res.arrayBuffer();
      if (token !== documentLoadToken) return;
      if (!isDocx(buf)) {
        documentBody.value = post.description || "";
        documentLoadError.value =
          "Couldn't read this Word file — use Download or open externally.";
        return;
      }
      documentBody.value = await docxToText(buf);
      return;
    }

    let text = (await res.text()).replace(/^\uFEFF/, "");
    if (token !== documentLoadToken) return;
    if (ext === "rtf" || contentType.includes("rtf") || isRtf(text)) {
      text = rtfToText(text);
    }
    if (looksLikeBinaryGarbage(text)) {
      // Mislabelled DOCX sometimes arrives as octet-stream / wrong ext.
      const retry = await fetch(fetchUrl);
      if (token !== documentLoadToken) return;
      if (retry.ok) {
        const buf = await retry.arrayBuffer();
        if (token !== documentLoadToken) return;
        if (isDocx(buf)) {
          documentBody.value = await docxToText(buf);
          return;
        }
      }
      documentBody.value = post.description || "";
      documentLoadError.value =
        "Couldn't read this file as text — use Download or open externally.";
      return;
    }
    documentBody.value = text;
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
  if (
    !post?.has_notes ||
    isVideoExt(post.file.ext) ||
    !modeSupportsNotes(originModeOf(post, siteMode.activeMode))
  ) {
    notes.value = [];
    return;
  }
  const feedKey = postFeedKey(post);
  if (notesLoadedFor.value === feedKey) return;
  try {
    const origin = originAuthForPost(post, main.$state, siteMode.activeMode);
    const service = await getApiService();
    const result = await service.getNotes({
      postId: post.id,
      baseUrl: origin.baseUrl,
      mode: origin.mode,
    });
    // Ignore stale responses after the user switched posts (H6).
    if (!props.current || postFeedKey(props.current) !== feedKey) return;
    notes.value = result;
    notesLoadedFor.value = feedKey;
  } catch (error) {
    if (!props.current || postFeedKey(props.current) !== feedKey) return;
    console.error(error);
    notes.value = [];
  }
};

watch(
  () => (props.current ? postFeedKey(props.current) : null),
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
  if (isDocumentPost.value) {
    // Stories/PDFs are skipped — jump to the next media post.
    void advanceSlideshow();
    return;
  }
  if (isVideoExt(props.current.file.ext) || isAudioExt(props.current.file.ext)) {
    // Video/audio advances on @ended while slideshow is playing.
    return;
  }
  slideshowTimer.value = setTimeout(() => {
    if (!slideshowPlaying.value) return;
    void advanceSlideshow();
  }, posts.slideshowIntervalMs);
};

const advanceSlideshow = () => {
  if (!slideshowPlaying.value) return;
  if (!props.hasNextFullscreenPost) {
    stopSlideshow();
    return;
  }
  clearSlideshowTimer();
  loadStart();
  emit("next-post", { skipDocuments: true });
  setTransitionNames("right");
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
  void advanceSlideshow();
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
  // Manual next keeps stories reachable; slideshow skips them.
  emit(
    "next-post",
    slideshowPlaying.value ? { skipDocuments: true } : undefined,
  );
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

const openCurrentOnSource = () => {
  if (props.current) openPostOnSourceSite(props.current);
};

onBeforeUnmount(() => {
  commentsResizeCleanup?.();
  ui.fullscreenOpen = false;
  stopSlideshow();
  shortcutService.emitter.off("fullscreenNext", showNextImage);
  shortcutService.emitter.off("fullscreenPrevious", showPreviousImage);
  shortcutService.emitter.off("fullscreenExit", exitFullscreen);
  shortcutService.emitter.off("fullscreenAddFavorite", addFavorite);
  shortcutService.emitter.off("fullscreenRemoveFavorite", removeFavorite);
  shortcutService.emitter.off("fullscreenToggleFavorite", toggleFavorite);
  shortcutService.emitter.off("fullscreenSlideshowToggle", toggleSlideshow);
  shortcutService.emitter.off("fullscreenSlideshowStop", stopSlideshow);
  shortcutService.emitter.off("openPostSource", openCurrentOnSource);
});
onMounted(() => {
  shortcutService.emitter.on("fullscreenNext", showNextImage);
  shortcutService.emitter.on("fullscreenPrevious", showPreviousImage);
  shortcutService.emitter.on("fullscreenExit", exitFullscreen);
  shortcutService.emitter.on("fullscreenAddFavorite", addFavorite);
  shortcutService.emitter.on("fullscreenRemoveFavorite", removeFavorite);
  shortcutService.emitter.on("fullscreenToggleFavorite", toggleFavorite);
  shortcutService.emitter.on("fullscreenSlideshowToggle", toggleSlideshow);
  shortcutService.emitter.on("fullscreenSlideshowStop", stopSlideshow);
  shortcutService.emitter.on("openPostSource", openCurrentOnSource);
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
  // Firefox/Zen: same-origin proxy for video, audio, and PDF under COEP.
  if (
    isVideoExt(ext) ||
    isAudioExt(ext) ||
    ext === "pdf" ||
    urlExt(url) === "pdf"
  ) {
    return proxyDownloadUrl(url);
  }
  return url;
});
const currentSampleFileUrl = computed(() =>
  switched.value ? false : props.current?.preview.url,
);
const audioCoverUrl = computed(() => {
  if (!isAudioPost.value || switched.value) return "";
  const preview = props.current?.preview?.url;
  const sample = props.current?.sample?.url;
  return proxyDownloadUrl(preview) || proxyDownloadUrl(sample) || "";
});

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
        const isDoc = postIsDocument(val);
        if (isDoc) {
          isZoomed.value = false;
          await loadDocumentContent(val);
          loadEnd();
        } else if (
          slideshowPlaying.value &&
          (isVideoExt(val.file.ext) || isAudioExt(val.file.ext))
        ) {
          // Wait for media ended; ensure playback starts.
          await nextTick();
          applyFullscreenPlaybackPrefs();
          videoEl.value?.play().catch(() => undefined);
          loadEnd();
        } else if (isVideoExt(val.file.ext) || isAudioExt(val.file.ext)) {
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

.fullscreen--comments .top-right,
.fullscreen--comments .bottom-right {
  z-index: 1012;
}

.fullscreen-comments {
  position: relative;
  flex: 0 0 auto;
  align-self: stretch;
  height: 100vh;
  min-width: 0;
  z-index: 1010;
  display: flex;
  flex-direction: column;
  background: rgba(18, 18, 22, 0.96);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  pointer-events: auto;
}

.fullscreen-comments-resizer {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 8px;
  transform: translateX(-50%);
  cursor: col-resize;
  z-index: 2;
  touch-action: none;
}
.fullscreen-comments-resizer::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 3px;
  height: 48px;
  transform: translate(-50%, -50%);
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.28);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.fullscreen-comments-resizer:hover::after,
.fullscreen-comments-resizer:active::after {
  opacity: 1;
}

.fullscreen-comments-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 8px 8px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.fullscreen-comments-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 12px 16px 24px;
  min-height: 0;
}

.fullscreen-comments-section {
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.fullscreen-comments-section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 8px;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.fullscreen-comments-section--last {
  padding-bottom: 0;
  margin-bottom: 0;
  border-bottom: none;
}

.sofurry-story-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  margin: 0;
  line-height: 1.55;
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
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
}

.fullscreen .flex .document-middle {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.unavailable-fullscreen {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: rgba(255, 255, 255, 0.9);
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

.fullscreen-audio-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  width: 100%;
  height: 100%;
  color: rgba(255, 255, 255, 0.9);
  padding: 1.5rem;
  box-sizing: border-box;
}

.fullscreen-audio-cover {
  max-width: min(60vw, 28rem);
  max-height: min(50vh, 28rem);
  object-fit: contain;
  border-radius: 0.5rem;
  opacity: 0.95;
}

.fullscreen-audio {
  width: min(100%, 28rem);
}
</style>
