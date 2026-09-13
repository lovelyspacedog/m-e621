<template>
  <fixed-aspect-ratio-box @click.native="handleClick" :ratio="file.height / file.width" v-ripple="!canPlayInline">
    <video
      v-if="playableUrl"
      :ref="setVideoEl"
      class="card-video"
      controls
      playsinline
      preload="metadata"
      :poster="preview.url || undefined"
      @click.stop
    >
      <source :src="playableUrl" :type="videoType" />
    </video>
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
        <p class="pa-3 text-center text-medium-emphasis">
          Remux to MP4/WebM to watch inline.
        </p>
      </div>
    </template>
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
import { usePostsStore } from "@/services";
import { DataSaverType } from "@/services/types";
import type { File, Preview, Sample } from "@/worker/api";
import type { PropType } from "vue";
import { computed, defineComponent, onBeforeUnmount } from "vue";
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
  },
  setup(props, context) {
    const posts = usePostsStore();
    const isSwf = computed(() => props.file.ext === "swf");
    const isVideo = computed(() => VIDEO_EXTS.has(props.file.ext));
    const isImage = computed(() => !isSwf.value && !isVideo.value);
    const playableUrl = computed(() =>
      !props.unplayable && isVideo.value && props.file.url ? props.file.url : null,
    );
    let visibilityObserver: IntersectionObserver | null = null;
    const setVideoEl = (el: unknown) => {
      visibilityObserver?.disconnect();
      visibilityObserver = null;
      if (!(el instanceof HTMLVideoElement)) return;
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
    onBeforeUnmount(() => {
      visibilityObserver?.disconnect();
    });
    const canPlayInline = computed(() => !!playableUrl.value);
    const videoType = computed(() =>
      props.file.ext === "mp4" ? "video/mp4" : "video/webm",
    );
    const router = useRouter();

    const handleClick = async () => {
      if (canPlayInline.value || props.unplayable) {
        return;
      }
      if (imageSrc.value) {
        context.emit("open-post");
      } else {
        router.push({ name: "AccountSettings" });
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
      isImage,
      canPlayInline,
      playableUrl,
      setVideoEl,
      videoType,
      imageSrc,
      handleClick,
      loading,
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
	 pointer-events: none;
}
 
</style>
