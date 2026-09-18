<template>
  <!-- Documents skip FixedAspectRatioBox: landscape covers + padding-ratio
       boxes clip the centered badge. Use aspect-ratio + min-height instead. -->
  <div
    v-if="isDocument"
    class="document-card clickable"
    v-ripple
    @click="handleClick"
  >
    <img
      v-if="documentThumbSrc"
      :loading="loading"
      :src="documentThumbSrc"
      class="document-thumb"
      alt=""
    />
    <div class="document-scrim" :class="{ 'document-scrim--plain': !documentThumbSrc }" />
    <div class="document-badge">
      <v-icon size="40">{{ documentIcon }}</v-icon>
      <span class="document-label">{{ documentLabel }}</span>
    </div>
    <p v-if="title" class="document-title">{{ title }}</p>
    <p v-if="!documentThumbSrc && documentExcerpt" class="document-excerpt">
      {{ documentExcerpt }}
    </p>
  </div>
  <div
    v-else-if="isAudio"
    class="audio-card clickable"
    :class="{ 'audio-card--with-title': !!title }"
    v-ripple
    @click="handleClick"
  >
    <img
      v-if="audioCoverSrc"
      :loading="loading"
      :src="audioCoverSrc"
      class="audio-card-cover"
      alt=""
    />
    <div class="audio-card-scrim" :class="{ 'audio-card-scrim--plain': !audioCoverSrc }" />
    <div class="audio-badge">
      <v-icon size="40">mdi-music</v-icon>
      <span class="audio-label">Music</span>
    </div>
    <p v-if="title" class="audio-title">{{ title }}</p>
    <div class="audio-card-controls" @click.stop>
      <audio
        v-if="audioSrc"
        class="audio-card-player"
        controls
        preload="metadata"
        :src="audioSrc"
      />
      <v-chip
        v-else-if="audioPending"
        color="secondary"
        variant="flat"
        size="small"
      >
        Loading audio…
      </v-chip>
      <v-chip v-else color="warning" variant="flat" size="small">
        No playable URL
      </v-chip>
    </div>
  </div>
  <fixed-aspect-ratio-box
    v-else
    @click="handleClick"
    :ratio="displayRatio"
    v-ripple="!canPlayInline && !unplayable"
  >
    <video
      v-if="playableUrl"
      :ref="setVideoEl"
      class="card-video"
      :controls="videoSrcLive"
      playsinline
      loop
      :preload="videoSrcLive ? 'metadata' : 'none'"
      :src="videoSrcLive ? playableUrl : undefined"
      :poster="previewPoster || undefined"
      @click.stop="onVideoSurfaceClick"
      @volumechange="onVolumeChange"
      @ratechange="onRateChange"
      @error="onVideoError"
    />
    <!-- Keep overlays inside playableUrl branch so the else-if chain below
         stays mutually exclusive with the <video> (not with cold-buffer UI). -->
    <template v-if="playableUrl">
      <!-- Empty <video controls> with no src renders as 0:00 + disabled play. -->
      <div
        v-if="!videoSrcLive && !videoLoadFailed"
        class="centered clickable play-button"
        @click.stop="onVideoSurfaceClick"
      >
        <v-icon size="100">mdi-play</v-icon>
      </div>
      <div v-else-if="videoLoadFailed" class="centered unplayable-overlay">
        <v-icon size="64">mdi-file-video-outline</v-icon>
        <v-chip class="mt-2" color="warning" variant="flat">
          Can't play this video
        </v-chip>
      </div>
    </template>
    <template v-else-if="unplayable">
      <img
        v-if="imageSrc"
        :loading="loading"
        :src="imageSrc"
        class="clickable unplayable-media"
        @load="onPreviewLoad"
      />
      <div class="centered unplayable-overlay">
        <v-icon size="64">mdi-file-video-outline</v-icon>
        <v-chip class="mt-2" color="warning" variant="flat">
          Can't play .{{ file.ext }} in browser
        </v-chip>
        <v-btn
          class="mt-3"
          color="accent"
          variant="flat"
          :loading="remuxing"
          :disabled="remuxing"
          @click.stop="onRemux"
        >
          Remux to MP4
        </v-btn>
        <p v-if="remuxError" class="pa-3 text-center text-error">{{ remuxError }}</p>
        <p v-else class="pa-3 text-center text-medium-emphasis">
          Converts in the browser (first run downloads ffmpeg.wasm).
        </p>
      </div>
    </template>
    <div v-else-if="showUnavailable" class="centered clickable unavailable-media">
      <v-icon size="64">mdi-image-off-outline</v-icon>
      <v-chip class="mt-2" color="secondary" variant="outlined">
        {{ unavailableLabel }}
      </v-chip>
      <p class="pa-3 text-center text-medium-emphasis">
        {{ unavailableHint }}
      </p>
    </div>
    <img
      :loading="loading"
      v-else-if="(isImage || isVideo) && imageSrc"
      :src="imageSrc"
      class="clickable preview-media"
      @load="onPreviewLoad"
      @error="onPreviewError"
    />
    <div v-else-if="isImage || isVideo" class="centered clickable play-button">
      <v-chip color="red" class="text-white">Global Blacklist</v-chip>
      <p class="pa-3 text-center">
        This post is on the server-side blacklist for unauthenticated users. Log
        in to view, or update the blacklist settings.
      </p>
    </div>
    <div v-if="isSwf" class="centered clickable" v-ripple>
      <v-icon size="100">mdi-flash</v-icon>
      <div>Flash</div>
    </div>
    <div v-else-if="isVideo && !canPlayInline && !unplayable && imageSrc" class="centered clickable play-button">
      <v-icon size="100">mdi-play</v-icon>
    </div>
  </fixed-aspect-ratio-box>
</template>

<script lang="ts">
import { isAudioExt } from "@/misc/util/audioExts";
import {
  resolveDataSaverQuality,
  useDataSaverInfo,
} from "@/misc/util/dataSaver";
import { remuxLocalPath } from "@/misc/util/localMedia";
import { proxyDownloadUrl } from "@/misc/util/mediaProxy";
import {
  applyPlaybackPrefsWriteback,
  resolvePlaybackPrefs,
  type PlaybackMediaKind,
} from "@/misc/util/playbackPrefs";
import { useMainStore, usePostsStore, useSnackbarStore } from "@/services";
import { type SiteMode } from "@/services/types";
import type { File, Preview, Sample } from "@/worker/api";
import type { PropType } from "vue";
import { computed, defineComponent, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import FixedAspectRatioBox from "./FixedAspectRatioBox.vue";
import { useRouter } from "vue-router";
import { openSettings } from "@/Settings/settingsOverlay";

const VIDEO_EXTS = new Set(["webm", "mp4", "mkv", "mov"]);

export default defineComponent({
  components: { FixedAspectRatioBox },
  props: {
    file: {
      type: Object as PropType<File>,
      required: true,
    },
    preview: {
      type: Object as PropType<Preview>,
      required: true,
    },
    sample: {
      type: Object as PropType<Sample>,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    title: {
      type: String,
      default: "",
    },
    documentKind: {
      type: String as PropType<"journal" | "story" | "">,
      default: "",
    },
    unplayable: {
      type: Boolean,
      default: false,
    },
    unavailable: {
      type: Boolean,
      default: false,
    },
    localPath: {
      type: String,
      default: "",
    },
    originMode: {
      type: String as PropType<SiteMode | "">,
      default: "",
    },
    /** Compact cards on touch: first media tap expands chrome instead of opening. */
    compactTouchExpand: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["open-post", "expand-chrome", "remuxed"],
  setup(props, context) {
    const posts = usePostsStore();
    const main = useMainStore();
    const snackbar = useSnackbarStore();
    const tryRemuxTip = inject<() => void>("tryRemuxTip", () => undefined);
    const remuxing = ref(false);
    const remuxError = ref("");
    const naturalRatio = ref<number | null>(null);
    const mediaFailed = ref(false);
    const videoLoadFailed = ref(false);
    const isSwf = computed(() => props.file.ext === "swf");
    const isVideo = computed(() => VIDEO_EXTS.has(props.file.ext));
    const isAudio = computed(() => isAudioExt(props.file.ext));
    const playbackKind = computed((): PlaybackMediaKind | null => {
      if (isAudio.value) return "audio";
      if (isVideo.value) return "video";
      return null;
    });
    const originForPrefs = computed((): SiteMode | null =>
      props.originMode ? (props.originMode as SiteMode) : null,
    );
    const resolvedPlayback = () =>
      resolvePlaybackPrefs(
        {
          volume: posts.videoVolume,
          muted: posts.videoMuted,
          playbackRate: posts.videoPlaybackRate || 1,
        },
        posts.playbackPrefs,
        {
          kind: playbackKind.value || "video",
          origin: originForPrefs.value,
        },
      );
    const audioCoverSrc = computed(
      () =>
        proxyDownloadUrl(props.preview.url) ||
        proxyDownloadUrl(props.sample.url) ||
        "",
    );
    const audioSrc = computed(() =>
      props.file.url ? proxyDownloadUrl(props.file.url) || props.file.url : "",
    );
    // FA music listings enrich in the feed; show cover until file.url arrives.
    const audioPending = computed(() => isAudio.value && !props.file.url);
    // e621-style preview/sample URLs are static frames; only the full file animates.
    const isAnimatedImage = computed(() => props.file.ext === "gif");
    const fileUrlExt = computed(() => {
      const url = props.file.url || "";
      try {
        const path = new URL(url, "https://local.invalid").pathname.toLowerCase();
        const ext = path.split(".").pop() || "";
        return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "";
      } catch {
        return "";
      }
    });
    const isDocument = computed(() => {
      const ext = props.file.ext;
      const fromUrl = fileUrlExt.value;
      return (
        ["txt", "pdf", "html", "doc", "docx", "rtf"].includes(ext) ||
        ["txt", "pdf", "html", "doc", "docx", "rtf"].includes(fromUrl) ||
        props.documentKind === "journal" ||
        props.documentKind === "story"
      );
    });
    const isImage = computed(
      () => !isSwf.value && !isVideo.value && !isAudio.value && !isDocument.value,
    );
    const documentLabel = computed(() => {
      if (props.documentKind === "journal") return "Journal";
      const ext = props.file.ext === "pdf" || fileUrlExt.value === "pdf"
        ? "pdf"
        : props.file.ext || fileUrlExt.value;
      if (ext === "pdf") return "PDF";
      if (ext === "doc") return "DOC (unsupported)";
      if (props.documentKind === "story" || ext === "txt") return "Story";
      if (ext === "html") return "HTML";
      return (ext || "DOC").toUpperCase();
    });
    const documentIcon = computed(() => {
      if (props.file.ext === "pdf" || fileUrlExt.value === "pdf") return "mdi-file-pdf-box";
      if (props.documentKind === "journal") return "mdi-notebook-outline";
      return "mdi-text-box-outline";
    });
    const documentThumbSrc = computed(() => {
      // Never use file.url for documents — it is the PDF/text file, not an image.
      return props.preview.url || props.sample.url || "";
    });
    const documentExcerpt = computed(() => {
      const text = (props.description || "").replace(/\s+/g, " ").trim();
      if (!text) return "";
      return text.length > 160 ? `${text.slice(0, 157)}…` : text;
    });
    // Grid cells are thumbnails — never load/play full video from the card.
    const isGrid = computed(() => posts.feedLayout === "grid");
    const playableUrl = computed(() =>
      !isGrid.value && !props.unplayable && isVideo.value && props.file.url
        ? proxyDownloadUrl(props.file.url)
        : null,
    );
    // Poster through same-origin proxy so COEP pages keep a still while src is dropped.
    const previewPoster = computed(
      () =>
        proxyDownloadUrl(props.preview.url) ||
        proxyDownloadUrl(props.sample.url) ||
        "",
    );
    const displayRatio = computed(() => {
      if (naturalRatio.value && naturalRatio.value > 0) return naturalRatio.value;
      const width = props.file.width;
      const height = props.file.height;
      if (width > 0 && height > 0) return height / width;
      return 1;
    });
    const onPreviewLoad = (event: Event) => {
      const img = event.target as HTMLImageElement | null;
      mediaFailed.value = false;
      if (!img?.naturalWidth || !img.naturalHeight) return;
      naturalRatio.value = img.naturalHeight / img.naturalWidth;
    };
    const onPreviewError = () => {
      mediaFailed.value = true;
    };
    watch(
      () => [props.preview.url, props.file.url, props.file.width, props.file.height],
      () => {
        naturalRatio.value = null;
        mediaFailed.value = false;
        videoLoadFailed.value = false;
      },
    );
    let visibilityObserver: IntersectionObserver | null = null;
    let boundVideo: HTMLVideoElement | null = null;
    let videoIsIntersecting = false;
    // With feed autoplay, only keep src while on-screen so off-screen cards free buffers.
    const videoSrcLive = ref(!posts.autoplayFeedVideo);

    const applyPlaybackPrefs = (el: HTMLVideoElement, forAutoplay = false) => {
      const prefs = resolvedPlayback();
      const forceSilent = forAutoplay && posts.autoplayFeedVideoSilent;
      el.muted = forceSilent || prefs.muted;
      el.volume = prefs.volume;
      el.playbackRate = prefs.playbackRate;
      // Loop so feed previews keep moving; card auto-next uses a dwell timer when looped.
      el.loop = true;
    };

    const releaseVideoBuffer = (el: HTMLVideoElement) => {
      el.pause();
      if (!posts.autoplayFeedVideo) return;
      videoSrcLive.value = false;
      // Drop decoder/network buffers immediately; poster still shows.
      el.removeAttribute("src");
      el.load();
    };

    const playWhenVisible = (el: HTMLVideoElement, force = false) => {
      if (!force && !posts.autoplayFeedVideo) return;
      applyPlaybackPrefs(el, !force && posts.autoplayFeedVideo);
      const playResult = el.play();
      if (playResult && typeof playResult.then === "function") {
        playResult.catch(() => {
          /* autoplay can fail until the user interacts; ignore */
        });
      }
    };

    const attachAndMaybePlay = async (el: HTMLVideoElement, forcePlay = false) => {
      videoLoadFailed.value = false;
      if (!videoSrcLive.value) {
        videoSrcLive.value = true;
        await nextTick();
      }
      if (!el.isConnected) return;
      const url = playableUrl.value;
      // Belt-and-suspenders if the binding hasn't landed yet.
      if (url && !el.getAttribute("src")) {
        el.src = url;
      }
      playWhenVisible(el, forcePlay);
    };

    const onVideoSurfaceClick = () => {
      if (props.compactTouchExpand) {
        context.emit("expand-chrome");
        return;
      }
      if (!boundVideo || videoLoadFailed.value) return;
      // Manual play when autoplay eviction left the buffer cold, or autoplay was blocked.
      void attachAndMaybePlay(boundVideo, true);
    };

    const onVideoError = () => {
      if (!videoSrcLive.value) return;
      videoLoadFailed.value = true;
    };

    const setVideoEl = (el: unknown) => {
      if (!(el instanceof HTMLVideoElement)) {
        visibilityObserver?.disconnect();
        visibilityObserver = null;
        boundVideo = null;
        videoIsIntersecting = false;
        return;
      }
      // Function refs re-fire on re-render with the same node. Re-init would set
      // videoSrcLive=false again and undo attach/click — stuck on the play overlay.
      if (boundVideo === el) return;

      visibilityObserver?.disconnect();
      visibilityObserver = null;
      videoIsIntersecting = false;
      boundVideo = el;
      // Fresh mount: if autoplay is on, wait for intersection before loading src.
      if (posts.autoplayFeedVideo) {
        videoSrcLive.value = false;
        el.removeAttribute("src");
        el.load();
      } else {
        videoSrcLive.value = true;
        applyPlaybackPrefs(el, false);
      }
      if (typeof IntersectionObserver === "undefined") {
        void attachAndMaybePlay(el);
        return;
      }
      // Observe the aspect-ratio box when present — more stable than the absolute video.
      const observeTarget =
        (el.closest(".aspect-ratio-box") as Element | null) || el;
      visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          videoIsIntersecting = !!entry?.isIntersecting;
          if (!videoIsIntersecting) {
            releaseVideoBuffer(el);
            return;
          }
          void attachAndMaybePlay(el);
        },
        // Any visible slice is enough; 0.15 left tall cards stuck with a cold src.
        { threshold: 0.01 },
      );
      visibilityObserver.observe(observeTarget);
    };

    watch(
      () =>
        [
          posts.videoMuted,
          posts.videoVolume,
          posts.videoPlaybackRate,
          posts.playbackPrefs,
          posts.autoplayFeedVideo,
          posts.autoplayFeedVideoSilent,
        ] as const,
      () => {
        if (!boundVideo) return;
        if (!posts.autoplayFeedVideo) {
          // Manual mode: keep src loaded, stop autoplay eviction.
          void (async () => {
            if (!boundVideo) return;
            if (!videoSrcLive.value) {
              videoSrcLive.value = true;
              await nextTick();
            }
            if (!boundVideo) return;
            boundVideo.pause();
            applyPlaybackPrefs(boundVideo, false);
          })();
          return;
        }
        if (!videoIsIntersecting) {
          releaseVideoBuffer(boundVideo);
          return;
        }
        // Observer handles play on visibility; only refresh mute/volume/rate here.
        applyPlaybackPrefs(boundVideo, !boundVideo.paused);
      },
    );

    const onVolumeChange = () => {
      if (!boundVideo || !playbackKind.value) return;
      // Silent autoplay forces mute; don't overwrite the remembered mute preference.
      applyPlaybackPrefsWriteback(
        main.posts,
        { kind: playbackKind.value, origin: originForPrefs.value },
        {
          muted: posts.autoplayFeedVideoSilent ? undefined : boundVideo.muted,
          volume: boundVideo.volume,
        },
      );
    };

    const onRateChange = () => {
      if (!boundVideo || !playbackKind.value) return;
      applyPlaybackPrefsWriteback(
        main.posts,
        { kind: playbackKind.value, origin: originForPrefs.value },
        { playbackRate: boundVideo.playbackRate },
      );
    };

    onBeforeUnmount(() => {
      visibilityObserver?.disconnect();
      if (boundVideo) releaseVideoBuffer(boundVideo);
    });

    const canPlayInline = computed(() => !!playableUrl.value);
    const router = useRouter();

    const handleClick = async () => {
      if (props.compactTouchExpand) {
        context.emit("expand-chrome");
        return;
      }
      if (canPlayInline.value || props.unplayable) {
        return;
      }
      if (imageSrc.value || isDocument.value || showUnavailable.value) {
        context.emit("open-post");
      } else {
        openSettings({ name: "AccountSettings" });
      }
    };

    const onRemux = async () => {
      if (!props.localPath || remuxing.value) return;
      tryRemuxTip();
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        remuxError.value =
          "Remux needs a network connection the first time (ffmpeg core). It is not queued offline.";
        snackbar.addMessage(remuxError.value);
        return;
      }
      remuxing.value = true;
      remuxError.value = "";
      try {
        const result = await remuxLocalPath(props.localPath, () => undefined);
        snackbar.addMessage(`Remuxed to ${result.newPath.split("/").pop()}`);
        context.emit("remuxed", result.newPath);
      } catch (err) {
        remuxError.value =
          err instanceof Error ? err.message : "Remux failed";
        snackbar.addMessage(remuxError.value);
      } finally {
        remuxing.value = false;
      }
    };

    const { dataSaverInfo } = useDataSaverInfo();

    const imageSrcPerQuality = computed<{ high: string, low: string, medium: string }>(() => {
      if (isSwf.value) {
        return {
          high: props.preview.url,
          medium: props.preview.url,
          low: props.preview.url,
        };
      }
      if (isVideo.value) {
        return {
          high: props.sample.url || props.preview.url,
          medium: props.sample.url || props.preview.url,
          low: props.preview.url,
        };
      }
      // GIFs must use file.url in list — sample/preview are usually still frames.
      // Grid stays on still thumbs; full animated GIFs are too heavy for a dense grid.
      if (
        !isGrid.value &&
        isAnimatedImage.value &&
        posts.animateFeedGifs &&
        props.file.url
      ) {
        const animated = props.file.url;
        return { high: animated, medium: animated, low: animated };
      }
      const sampleOrPreview = props.sample.url || props.preview.url;
      return {
        // Grid thumbnails never pull file.url (full res).
        // file.url may be null (e621 global blacklist / deleted).
        high: isGrid.value
          ? sampleOrPreview || props.file.url || props.preview.url || ""
          : props.file.url || sampleOrPreview || props.preview.url || "",
        medium: sampleOrPreview || props.preview.url || "",
        low: props.preview.url || "",
      };
    });

    const imageSrc = computed<string>(() => {
      const quality = resolveDataSaverQuality(
        posts.dataSaver,
        dataSaverInfo.value,
      );
      return imageSrcPerQuality.value[quality];
    });

    const loading = computed(() => {
      return posts.lazyLoad ? "lazy" : "eager";
    });

    const showUnavailable = computed(
      () => props.unavailable || mediaFailed.value,
    );
    // Prefer explicit unavailable from enrich; img @error uses the softer copy.
    const unavailableLabel = computed(() =>
      props.unavailable ? "Submission unavailable" : "Couldn't load media",
    );
    const unavailableHint = computed(() =>
      props.unavailable
        ? "This post is no longer on FurAffinity."
        : "The preview failed to load.",
    );

    return {
      isSwf,
      isVideo,
      isAudio,
      audioCoverSrc,
      audioSrc,
      audioPending,
      isDocument,
      isImage,
      documentLabel,
      documentIcon,
      documentThumbSrc,
      documentExcerpt,
      canPlayInline,
      playableUrl,
      previewPoster,
      videoSrcLive,
      videoLoadFailed,
      setVideoEl,
      imageSrc,
      displayRatio,
      onPreviewLoad,
      onPreviewError,
      onVideoSurfaceClick,
      onVideoError,
      showUnavailable,
      unavailableLabel,
      unavailableHint,
      handleClick,
      loading,
      remuxing,
      remuxError,
      onRemux,
      onVolumeChange,
      onRateChange,
    };
  },
});
</script>

<style scoped>
.centered {
	 display: flex;
	 justify-content: center;
	 align-items: center;
	 flex-direction: column;
	 height: 100%;
	 width: 100%;
}
 .clickable {
	 cursor: pointer;
}
 .play-button {
	 position: absolute;
	 top: 0;
	 height: 100%;
	 /* Allow click-to-load when autoplay left the buffer cold. */
	 pointer-events: auto;
	 z-index: 1;
}
 .card-video {
	 object-fit: contain;
	 background: #000;
}
 .preview-media {
	 width: 100%;
	 height: 100%;
	 object-fit: contain;
	 background: #000;
}
 .unplayable-media {
	 width: 100%;
	 height: 100%;
	 object-fit: contain;
	 opacity: 0.35;
	 background: #000;
}
 .unplayable-overlay {
	 position: absolute;
	 inset: 0;
	 background: rgba(0, 0, 0, 0.55);
}
 .unavailable-media {
	 background: #000;
	 color: rgba(255, 255, 255, 0.85);
	 padding: 1rem;
	 box-sizing: border-box;
}
 .audio-card {
	 position: relative;
	 width: 100%;
	 min-height: 14rem;
	 aspect-ratio: 4 / 3;
	 overflow: hidden;
	 background: #0d1117;
}
 .audio-card-cover {
	 position: absolute;
	 inset: 0;
	 width: 100%;
	 height: 100%;
	 object-fit: cover;
	 opacity: 0.5;
	 filter: saturate(0.85);
}
 .audio-card-scrim {
	 position: absolute;
	 inset: 0;
	 background: linear-gradient(
		 180deg,
		 rgba(8, 12, 20, 0.25) 0%,
		 rgba(8, 12, 20, 0.55) 55%,
		 rgba(8, 12, 20, 0.78) 100%
	 );
	 pointer-events: none;
}
 .audio-card-scrim--plain {
	 background: radial-gradient(
		 ellipse at center,
		 rgba(30, 41, 59, 0.95) 0%,
		 rgba(8, 12, 20, 1) 75%
	 );
}
 .audio-badge {
	 position: absolute;
	 left: 50%;
	 top: 42%;
	 transform: translate(-50%, -50%);
	 z-index: 1;
	 display: flex;
	 flex-direction: column;
	 align-items: center;
	 gap: 0.35rem;
	 padding: 0.75rem 1rem;
	 border-radius: 0.75rem;
	 background: rgba(8, 12, 20, 0.72);
	 border: 1px solid rgba(255, 255, 255, 0.14);
	 color: #fff;
	 pointer-events: none;
}
 .audio-card--with-title .audio-badge {
	 top: 36%;
}
 .audio-label {
	 font-size: 0.8rem;
	 font-weight: 600;
	 letter-spacing: 0.06em;
	 text-transform: uppercase;
	 line-height: 1;
}
 .audio-title {
	 position: absolute;
	 left: 1rem;
	 right: 1rem;
	 bottom: 5rem;
	 z-index: 1;
	 margin: 0;
	 font-size: 0.9rem;
	 font-weight: 600;
	 line-height: 1.3;
	 color: rgba(255, 255, 255, 0.92);
	 text-align: center;
	 display: -webkit-box;
	 -webkit-line-clamp: 2;
	 -webkit-box-orient: vertical;
	 overflow: hidden;
	 pointer-events: none;
}
 .audio-card-controls {
	 position: absolute;
	 left: 1rem;
	 right: 1rem;
	 bottom: 1rem;
	 z-index: 1;
	 display: flex;
	 justify-content: center;
}
 .audio-card-player {
	 width: min(100%, 18rem);
 }
 .document-card {
	 position: relative;
	 width: 100%;
	 min-height: 14rem;
	 aspect-ratio: 4 / 3;
	 overflow: hidden;
	 background: #0d1117;
}
 .document-thumb {
	 position: absolute;
	 inset: 0;
	 width: 100%;
	 height: 100%;
	 object-fit: cover;
	 opacity: 0.5;
	 filter: saturate(0.85);
}
 .document-scrim {
	 position: absolute;
	 inset: 0;
	 background: linear-gradient(
		 180deg,
		 rgba(8, 12, 20, 0.25) 0%,
		 rgba(8, 12, 20, 0.55) 55%,
		 rgba(8, 12, 20, 0.72) 100%
	 );
	 pointer-events: none;
}
 .document-scrim--plain {
	 background: radial-gradient(
		 ellipse at center,
		 rgba(30, 41, 59, 0.95) 0%,
		 rgba(8, 12, 20, 1) 75%
	 );
}
 .document-badge {
	 position: absolute;
	 left: 50%;
	 top: 50%;
	 transform: translate(-50%, -50%);
	 z-index: 1;
	 display: flex;
	 flex-direction: column;
	 align-items: center;
	 gap: 0.35rem;
	 padding: 0.75rem 1rem;
	 border-radius: 0.75rem;
	 background: rgba(8, 12, 20, 0.72);
	 border: 1px solid rgba(255, 255, 255, 0.14);
	 color: #fff;
	 pointer-events: none;
}
 .document-label {
	 font-size: 0.8rem;
	 font-weight: 600;
	 letter-spacing: 0.06em;
	 text-transform: uppercase;
	 line-height: 1;
}
 .document-title {
	 position: absolute;
	 left: 1rem;
	 right: 1rem;
	 bottom: 1rem;
	 z-index: 1;
	 margin: 0;
	 font-size: 0.9rem;
	 font-weight: 600;
	 line-height: 1.3;
	 color: rgba(255, 255, 255, 0.92);
	 text-align: center;
	 display: -webkit-box;
	 -webkit-line-clamp: 2;
	 -webkit-box-orient: vertical;
	 overflow: hidden;
	 pointer-events: none;
}
 .document-excerpt {
	 position: absolute;
	 left: 1rem;
	 right: 1rem;
	 bottom: 1rem;
	 z-index: 1;
	 margin: 0;
	 font-size: 0.8rem;
	 line-height: 1.35;
	 color: rgba(255, 255, 255, 0.78);
	 display: -webkit-box;
	 -webkit-line-clamp: 3;
	 -webkit-box-orient: vertical;
	 overflow: hidden;
	 pointer-events: none;
}
 /* Title takes the bottom slot; nudge excerpt above it when both show. */
 .document-title + .document-excerpt {
	 bottom: 3.5rem;
	 -webkit-line-clamp: 2;
}
 
</style>
