<template>
  <v-dialog
    v-model="open"
    fullscreen
    :scrim="false"
    transition="dialog-bottom-transition"
    @keydown.esc="$emit('close')"
  >
    <div v-if="current" class="ib-dialog" @click.self="$emit('close')">
      <v-btn
        v-if="hasPrevious"
        class="ib-nav-post ib-nav-post--prev"
        icon="mdi-skip-previous"
        variant="text"
        color="white"
        @click="$emit('previous-post')"
      />
      <v-btn
        v-if="hasNext"
        class="ib-nav-post ib-nav-post--next"
        icon="mdi-skip-next"
        variant="text"
        color="white"
        @click="$emit('next-post')"
      />

      <div class="ib-dialog-main" @click.self="$emit('close')">
        <v-btn
          class="ib-dialog-close"
          icon="mdi-close"
          variant="text"
          color="white"
          size="small"
          @click="$emit('close')"
        />

        <div class="ib-media-wrap">
          <div v-if="loadingDetails" class="ib-writing">Loading…</div>
          <ruffle-player v-else-if="isFlash" class="ib-media" style="min-height: 400px" :url="currentFileUrl || null" />
          <video
            v-else-if="isVideo && currentFileUrl"
            class="ib-media"
            :src="currentFileUrl"
            controls
            autoplay
            loop
            :key="currentFileUrl"
          />
          <audio
            v-else-if="isAudio && currentFileUrl"
            class="ib-audio"
            :src="currentFileUrl"
            controls
            autoplay
            :key="currentFileUrl"
          />
          <img
            v-else-if="currentFileUrl && !isWritingOnly"
            class="ib-media"
            :src="currentFileUrl"
            :alt="title"
            :key="currentFileUrl"
          />
          <div v-else-if="writing" class="ib-writing">{{ writing }}</div>
          <div v-else class="ib-writing text-medium-emphasis">No preview</div>
        </div>

        <div v-if="files.length > 1" class="ib-strip">
          <div
            v-for="(file, i) in files"
            :key="file.file_id || i"
            class="ib-strip-thumb"
            :class="{ 'ib-strip-thumb--active': i === fileIndex }"
            @click.stop="fileIndex = i"
          >
            <img
              v-if="thumbUrl(file)"
              class="ib-strip-img"
              :src="thumbUrl(file)"
              loading="lazy"
            />
            <v-icon v-else size="18">mdi-file-document-outline</v-icon>
          </div>
        </div>

        <v-btn
          v-if="fileIndex > 0"
          class="ib-nav-media ib-nav-media--prev"
          icon="mdi-chevron-left"
          variant="tonal"
          color="white"
          @click.stop="fileIndex--"
        />
        <v-btn
          v-if="fileIndex < files.length - 1"
          class="ib-nav-media ib-nav-media--next"
          icon="mdi-chevron-right"
          variant="tonal"
          color="white"
          @click.stop="fileIndex++"
        />
      </div>

      <div class="ib-dialog-info">
        <div class="ib-info-header">
          <div class="ib-info-heading">
            <div class="ib-info-title">{{ title || `Submission ${current.id}` }}</div>
            <div class="ib-info-artist">{{ artist || "Unknown artist" }}</div>
          </div>
          <div class="ib-info-actions">
            <v-btn
              :href="submissionHref"
              target="_blank"
              rel="noopener"
              variant="outlined"
              size="x-small"
              append-icon="mdi-open-in-new"
            >
              Open
            </v-btn>
            <v-btn
              icon="mdi-close"
              variant="text"
              size="x-small"
              density="comfortable"
              aria-label="Close"
              @click="$emit('close')"
            />
          </div>
        </div>

        <div class="ib-info-stats">
          <span v-if="current.score.total" title="Views">
            <v-icon size="14">mdi-eye-outline</v-icon>
            {{ current.score.total.toLocaleString() }}
          </span>
          <span v-if="current.fav_count" title="Favorites">
            <v-icon size="14">mdi-heart-outline</v-icon>
            {{ current.fav_count }}
          </span>
          <span v-if="files.length > 1" title="Pages">
            <v-icon size="14">mdi-image-multiple</v-icon>
            {{ fileIndex + 1 }} / {{ files.length }}
          </span>
          <span v-if="ratingLabel">{{ ratingLabel }}</span>
        </div>

        <div v-if="visibleKeywords.length" class="ib-info-tags">
          <TagWithMenu
            v-for="name in visibleKeywords"
            :key="name"
            small
            :tag="{ name, category: 'general' }"
          />
          <v-chip
            v-if="hiddenKeywordCount > 0 || keywordsExpanded"
            size="x-small"
            variant="tonal"
            color="accent"
            class="mr-1 mb-1"
            @click.stop="keywordsExpanded = !keywordsExpanded"
          >
            {{ keywordsExpanded ? "Show less" : `+${hiddenKeywordCount} more` }}
          </v-chip>
        </div>

        <div v-if="poolEntries.length" class="ib-info-tags">
          <div
            v-for="pool in poolEntries"
            :key="pool.id"
            class="ib-pool-row"
          >
            <TagWithMenu
              small
              :tag="{ name: `pool:${pool.id}`, category: 'pool' }"
            />
            <span v-if="pool.name" class="text-caption text-medium-emphasis ml-1">
              {{ pool.name }}
            </span>
          </div>
        </div>

        <div class="ib-info-date text-caption text-medium-emphasis mt-1">
          {{ current.created_at }}
        </div>

        <div v-if="description" class="ib-section">
          <div class="ib-section-title">Description</div>
          <div class="ib-section-body">{{ description }}</div>
        </div>

        <div v-if="writing && !isWritingOnly" class="ib-section">
          <div class="ib-section-title">Writing</div>
          <div class="ib-section-body">{{ writing }}</div>
        </div>
      </div>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { PropType } from "vue";
import type { EnhancedPost } from "@/worker/ApiService";
import type { InkbunnyFile } from "@/worker/inkbunny/api";
import {
  INKBUNNY_SUBMISSION_TYPE_WRITING,
  inkbunnyFileIsDisplayableMedia,
  submissionUrl,
} from "@/worker/inkbunny/api";
import TagWithMenu from "@/Tag/TagWithMenu.vue";
import RufflePlayer from "@/Post/RufflePlayer.vue";
import { useShortcutService, useUiStore } from "@/services";
import { openPostOnSourceSite } from "@/misc/util/url";

const KEYWORD_LIMIT = 6;

const props = defineProps({
  current: { type: Object as PropType<EnhancedPost | null>, default: null },
  hasPrevious: { type: Boolean, default: false },
  hasNext: { type: Boolean, default: false },
  loadingDetails: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "next-post", "previous-post"]);

const fileIndex = ref(0);
const keywordsExpanded = ref(false);
const shortcutService = useShortcutService();
const ui = useUiStore();

const open = computed({
  get: () => !!props.current,
  set: (value) => {
    if (!value) emit("close");
  },
});

watch(
  () => !!props.current,
  (isOpen) => {
    ui.fullscreenOpen = isOpen;
  },
  { immediate: true },
);

const nextPost = () => {
  if (props.hasNext) emit("next-post");
};
const previousPost = () => {
  if (props.hasPrevious) emit("previous-post");
};
const exit = () => emit("close");
const openCurrentOnSource = () => {
  if (props.current) openPostOnSourceSite(props.current);
};
const nextFile = () => {
  if (fileIndex.value < files.value.length - 1) fileIndex.value += 1;
  else nextPost();
};
const previousFile = () => {
  if (fileIndex.value > 0) fileIndex.value -= 1;
  else previousPost();
};

const onKeydown = (event: KeyboardEvent) => {
  if (!props.current) return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    nextFile();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    previousFile();
  }
};

onMounted(() => {
  shortcutService.emitter.on("fullscreenNext", nextPost);
  shortcutService.emitter.on("fullscreenPrevious", previousPost);
  shortcutService.emitter.on("fullscreenExit", exit);
  shortcutService.emitter.on("openPostSource", openCurrentOnSource);
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  ui.fullscreenOpen = false;
  shortcutService.emitter.off("fullscreenNext", nextPost);
  shortcutService.emitter.off("fullscreenPrevious", previousPost);
  shortcutService.emitter.off("fullscreenExit", exit);
  shortcutService.emitter.off("openPostSource", openCurrentOnSource);
  window.removeEventListener("keydown", onKeydown);
});

const meta = computed(() => props.current?.__meta.inkbunny);
const poolEntries = computed(() => {
  const named = meta.value?.pools || [];
  const byId = new Map(named.map((p) => [p.id, p.name] as const));
  const ids =
    props.current?.pools?.length
      ? props.current.pools
      : named.map((p) => p.id);
  return ids.map((id) => ({ id, name: byId.get(id) || "" }));
});
const files = computed<InkbunnyFile[]>(() => {
  const list = meta.value?.files || [];
  if (list.length) return list;
  if (meta.value?.typeId === INKBUNNY_SUBMISSION_TYPE_WRITING) return [];
  const post = props.current;
  if (!post?.file.url) return [];
  return [
    {
      file_id: post.id,
      file_name: `submission.${post.file.ext || "jpg"}`,
      mimetype: "",
      submission_file_order: 0,
      file_url_full: post.file.url,
      file_url_screen: post.sample.url || post.file.url,
      thumbnail_url_medium: post.preview.url,
    },
  ];
});

const currentFile = computed(() => files.value[fileIndex.value] || files.value[0]);
const currentFileUrl = computed(() => {
  const fromCurrent =
    currentFile.value?.file_url_full ||
    currentFile.value?.file_url_screen ||
    currentFile.value?.file_url_preview ||
    "";
  if (fromCurrent) return fromCurrent;
  const post = props.current;
  const url = post?.file.url || "";
  if (!url || !post) return "";
  if (
    meta.value?.typeId === INKBUNNY_SUBMISSION_TYPE_WRITING &&
    !inkbunnyFileIsDisplayableMedia({
      file_name: `file.${post.file.ext || "txt"}`,
      mimetype: "",
    })
  ) {
    return "";
  }
  return url;
});
const mime = computed(() => (currentFile.value?.mimetype || "").toLowerCase());
const isVideo = computed(() => mime.value.startsWith("video/"));
const isAudio = computed(() => mime.value.startsWith("audio/"));
const isFlash = computed(
  () =>
    mime.value.includes("flash") ||
    mime.value.includes("shockwave") ||
    (currentFile.value?.file_name || "").toLowerCase().endsWith(".swf"),
);
const isWritingOnly = computed(() => {
  if (meta.value?.typeId !== INKBUNNY_SUBMISSION_TYPE_WRITING) return false;
  if (inkbunnyFileIsDisplayableMedia(currentFile.value)) return false;
  return !!writing.value || !currentFileUrl.value;
});
const writing = computed(() => meta.value?.writing || "");
const title = computed(() => meta.value?.title || props.current?.description || "");
const artist = computed(() => props.current?.tags.artist?.[0] || props.current?.uploader_name || "");
const description = computed(() => {
  const text = props.current?.description || "";
  if (text && text !== title.value) return text;
  return "";
});
const keywords = computed(() => props.current?.tags.general || []);
const visibleKeywords = computed(() =>
  keywordsExpanded.value ? keywords.value : keywords.value.slice(0, KEYWORD_LIMIT),
);
const hiddenKeywordCount = computed(() => Math.max(0, keywords.value.length - KEYWORD_LIMIT));
const submissionHref = computed(() =>
  props.current ? submissionUrl(props.current.id) : "https://inkbunny.net/",
);
const ratingLabel = computed(() => {
  switch (props.current?.rating) {
    case "s":
      return "General";
    case "q":
      return "Mature";
    case "e":
      return "Adult";
    default:
      return "";
  }
});

const thumbUrl = (file: InkbunnyFile) =>
  file.thumbnail_url_medium || file.thumbnail_url_large || file.file_url_preview || "";

watch(
  () => props.current?.id,
  () => {
    fileIndex.value = 0;
    keywordsExpanded.value = false;
  },
);
</script>

<style scoped>
.ib-dialog {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #111;
  color: #fff;
}
.ib-dialog-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
}
.ib-nav-post {
  position: absolute;
  top: 12px;
  z-index: 3;
}
.ib-nav-post--prev { left: 8px; }
.ib-nav-post--next { right: 48px; }
.ib-dialog-main {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-height: 0;
}
.ib-media-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex: 1;
  min-height: 0;
  padding: 0 56px;
}
.ib-media {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
}
.ib-audio {
  width: min(480px, 90%);
}
.ib-writing {
  max-width: 720px;
  max-height: 100%;
  overflow: auto;
  padding: 16px;
  white-space: pre-wrap;
  line-height: 1.45;
}
.ib-strip {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  overflow-x: auto;
  background: rgba(0, 0, 0, 0.5);
  width: 100%;
  flex-shrink: 0;
}
.ib-strip-thumb {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  opacity: 0.55;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ib-strip-thumb--active {
  opacity: 1;
  border-color: rgba(var(--v-theme-primary), 1);
}
.ib-strip-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ib-nav-media {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}
.ib-nav-media--prev { left: 4px; }
.ib-nav-media--next { right: 4px; }
.ib-dialog-info {
  background: rgba(20, 20, 20, 0.95);
  padding: 10px 14px 12px;
  flex-shrink: 0;
  border-top: 1px solid rgba(255,255,255,0.08);
  max-height: 42%;
  overflow-y: auto;
}
.ib-info-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.ib-info-heading { min-width: 0; flex: 1; }
.ib-info-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.ib-info-title { font-weight: 700; font-size: 0.95rem; line-height: 1.3; }
.ib-info-artist { font-size: 0.8rem; color: rgba(255,255,255,0.6); margin-top: 1px; }
.ib-info-stats {
  display: flex;
  gap: 12px;
  font-size: 0.78rem;
  color: rgba(255,255,255,0.65);
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.ib-info-stats span { display: flex; align-items: center; gap: 3px; }
.ib-info-tags { display: flex; flex-wrap: wrap; margin-bottom: 2px; }
.ib-pool-row { display: flex; align-items: center; flex-wrap: wrap; margin-bottom: 2px; width: 100%; }
.ib-info-date { font-size: 0.72rem; }
.ib-section { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); }
.ib-section-title { font-size: 0.8rem; font-weight: 700; margin-bottom: 4px; }
.ib-section-body {
  font-size: 0.8rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow-y: auto;
}
@media (min-width: 900px) {
  .ib-dialog { flex-direction: row; }
  .ib-dialog-info {
    width: 300px;
    max-height: none;
    border-top: none;
    border-left: 1px solid rgba(255,255,255,0.08);
  }
  .ib-nav-post--next { right: 308px; }
  .ib-strip {
    flex-direction: column;
    width: 56px;
    height: auto;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 6px;
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    max-height: 70%;
    border-radius: 8px;
  }
}
</style>
