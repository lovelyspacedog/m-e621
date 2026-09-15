<template>
  <fixed-aspect-ratio-box @click="handleClick" :ratio="file.height / file.width" v-ripple="!canPlayInline && !unplayable">
    <video
      v-if="playableUrl"
      :ref="setVideoEl"
      class="card-video"
      controls
      playsinline
      preload="metadata"
      :src="playableUrl"
      :poster="preview.url || undefined"
      @click.stop
      @volumechange="onVolumeChange"
      @ratechange="onRateChange"
    />
    <template v-else-if="unplayable">
      <img
        v-if="imageSrc"
        :loading="loading"
        :src="imageSrc"
        class="clickable unplayable-media"
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
    <div v-else-if="isDocument" class="centered clickable">
      <v-icon size="100">mdi-text-box-outline</v-icon>
      <div>{{ file.ext === "txt" ? "Journal / story" : file.ext.toUpperCase() }}</div>
    </div>
    <img :loading="loading" v-else-if="(isImage || isVideo) && imageSrc" :src="imageSrc" class="clickable" />
    <div v-else-if="isImage || isVideo" class="centered clickable play-button">
      <v-chip color="red" text-color="white">Global Blacklist</v-chip>
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
import { useDataSaverInfo } from "@/misc/util/dataSaver";
import { remuxLocalPath } from "@/misc/util/localMedia";
import { proxyDownloadUrl } from "@/misc/util/mediaProxy";
import { usePostsStore, useSnackbarStore } from "@/services";
import { DataSaverType } from "@/services/types";
import type { File, Preview, Sample } from "@/worker/api";
import type { PropType } from "vue";
import { computed, defineComponent, onBeforeUnmount, ref } from "vue";
import FixedAspectRatioBox from "./FixedAspectRatioBox.vue";
import { useRouter } from "vue-router";

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
    unplayable: {
      type: Boolean,
      default: false,
    },
    localPath: {
      type: String,
      default: "",
    },
  },
  emits: ["open-post", "remuxed"],
  setup(props, context) {
    const posts = usePostsStore();
    const snackbar = useSnackbarStore();
    const remuxing = ref(false);
    const remuxError = ref("");
    const isSwf = computed(() => props.file.ext === "swf");
    const isVideo = computed(() => VIDEO_EXTS.has(props.file.ext));
    const isDocument = computed(() =>
      ["txt", "pdf", "html", "doc", "rtf"].includes(props.file.ext),
    );
    const isImage = computed(() => !isSwf.value && !isVideo.value && !isDocument.value);
    const playableUrl = computed(() =>
      !props.unplayable && isVideo.value && props.file.url
        ? proxyDownloadUrl(props.file.url)
        : null,
    );
    let visibilityObserver: IntersectionObserver | null = null;
    let boundVideo: HTMLVideoElement | null = null;

    const applyPlaybackPrefs = (el: HTMLVideoElement) => {
      el.muted = posts.videoMuted;
      el.volume = Math.min(1, Math.max(0, posts.videoVolume));
      el.playbackRate = posts.videoPlaybackRate || 1;
    };

    const setVideoEl = (el: unknown) => {
      visibilityObserver?.disconnect();
      visibilityObserver = null;
      boundVideo = null;
      if (!(el instanceof HTMLVideoElement)) return;
      boundVideo = el;
      applyPlaybackPrefs(el);
      if (typeof IntersectionObserver === "undefined") return;
      visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) {
            el.pause();
          }
        },
        { threshold: 0.15 },
      );
      visibilityObserver.observe(el);
    };

    const onVolumeChange = () => {
      if (!boundVideo) return;
      posts.videoMuted = boundVideo.muted;
      posts.videoVolume = boundVideo.volume;
    };

    const onRateChange = () => {
      if (!boundVideo) return;
      posts.videoPlaybackRate = boundVideo.playbackRate;
    };

    onBeforeUnmount(() => {
      visibilityObserver?.disconnect();
    });

    const canPlayInline = computed(() => !!playableUrl.value);
    const router = useRouter();

    const handleClick = async () => {
      if (canPlayInline.value || props.unplayable) {
        return;
      }
      if (imageSrc.value || isDocument.value) {
        context.emit("open-post");
      } else {
        router.push({ name: "AccountSettings" });
      }
    };

    const onRemux = async () => {
      if (!props.localPath || remuxing.value) return;
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
      return {
        high: props.file.url || props.sample.url || props.preview.url,
        medium: props.sample.url || props.preview.url,
        low: props.preview.url,
      };
    });

    const imageSrc = computed<string>(() => {
      switch (posts.dataSaver) {
        case DataSaverType.lowest:
          return imageSrcPerQuality.value.low;
        case DataSaverType.medium:
          return imageSrcPerQuality.value.medium;
        case DataSaverType.highest:
          return imageSrcPerQuality.value.high;
        default:
        case DataSaverType.auto:
          if (dataSaverInfo.value.effectiveTypeSupported && (dataSaverInfo.value.effectiveType === "slow-2g" || dataSaverInfo.value.effectiveType === "2g")) {
            return imageSrcPerQuality.value.low;
          }
          if (!dataSaverInfo.value.typeSupported) {
            if(dataSaverInfo.value.saveData) return imageSrcPerQuality.value.low;
            return imageSrcPerQuality.value.medium;
          }
          if (
            dataSaverInfo.value.type === "bluetooth" ||
            dataSaverInfo.value.type === "cellular"
          ) {
            return imageSrcPerQuality.value.low;
          }
          if (
            dataSaverInfo.value.type === "ethernet" ||
            dataSaverInfo.value.type === "wifi"
          ) {
            if (dataSaverInfo.value.saveData) {
              return imageSrcPerQuality.value.medium;
            }
            return imageSrcPerQuality.value.high;
          }
          return imageSrcPerQuality.value.medium;
      }
    });

    const loading = computed(() => {
      return posts.lazyLoad ? "lazy" : "eager";
    });

    return {
      isSwf,
      isVideo,
      isDocument,
      isImage,
      canPlayInline,
      playableUrl,
      setVideoEl,
      imageSrc,
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
	 pointer-events: none;
}
 .card-video {
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
 
</style>
