<template>
  <div>
    <div class="pool-reader-toolbar">
      <v-btn-toggle
        v-model="viewMode"
        mandatory
        density="compact"
        variant="outlined"
        divided
      >
        <v-btn value="gallery" size="small" title="Gallery">
          <v-icon size="18">mdi-view-grid</v-icon>
          <span class="pool-reader-label">Gallery</span>
        </v-btn>
        <v-btn value="scroll" size="small" title="Scroll">
          <v-icon size="18">mdi-view-agenda</v-icon>
          <span class="pool-reader-label">Scroll</span>
        </v-btn>
      </v-btn-toggle>
      <v-btn
        v-if="viewMode === 'scroll'"
        size="small"
        variant="outlined"
        :color="fullWidthScroll ? 'primary' : undefined"
        :title="fullWidthScroll ? 'Exit full width' : 'Full width'"
        @click="fullWidthScroll = !fullWidthScroll"
      >
        <v-icon size="18">mdi-arrow-expand-horizontal</v-icon>
        <span class="pool-reader-label">
          {{ fullWidthScroll ? "Fit" : "Full width" }}
        </span>
      </v-btn>
      <v-chip
        v-if="hiddenCount > 0"
        size="small"
        variant="tonal"
        color="warning"
        label
        :title="`${hiddenCount} page(s) hidden or unavailable in this chunk`"
      >
        {{ hiddenCount }} hidden
      </v-chip>
      <v-spacer />
      <v-btn
        size="small"
        variant="outlined"
        :loading="savingChunk"
        :disabled="loading || savingAll || !savableInChunk"
        title="Save this chunk locally"
        @click="emit('save-chunk')"
      >
        <v-icon size="18" start>mdi-content-save</v-icon>
        <span class="pool-reader-label">Save chunk</span>
      </v-btn>
      <v-btn
        size="small"
        variant="outlined"
        :loading="savingAll"
        :disabled="loading || savingChunk || !totalCount"
        title="Save every page in this pool locally"
        @click="emit('save-all')"
      >
        <v-icon size="18" start>mdi-download-multiple</v-icon>
        <span class="pool-reader-label">Save all</span>
      </v-btn>
    </div>

    <div v-if="loading && !posts.length" class="pool-reader-grid">
      <v-skeleton-loader
        v-for="n in 12"
        :key="n"
        type="image"
        class="pool-page-skeleton"
      />
    </div>

    <div v-else-if="viewMode === 'gallery'" class="pool-reader-grid">
      <template v-for="slot in pageSlots" :key="slot.key">
        <button
          v-if="slot.kind === 'post'"
          type="button"
          class="pool-page-card"
          :class="{ 'pool-page-card--blur': slot.blurred }"
          :title="`Post ${slot.sequence}`"
          @click="emit('open-post', slot.post.id)"
        >
          <div class="pool-page-thumb">
            <img
              v-if="thumbUrl(slot.post)"
              class="pool-page-img"
              :src="thumbUrl(slot.post)!"
              loading="lazy"
              :alt="`Post ${slot.post.id}`"
            />
            <div v-else class="pool-page-placeholder">
              <v-icon size="28">mdi-image-off-outline</v-icon>
            </div>
            <div v-if="slot.blurred" class="pool-page-hidden-label">Hidden</div>
            <div class="pool-page-num">{{ slot.sequence }}</div>
          </div>
        </button>
        <div
          v-else
          class="pool-page-card pool-page-card--gap"
          :title="`Page ${slot.sequence} hidden`"
        >
          <div class="pool-page-thumb pool-page-thumb--gap">
            <v-icon size="28">mdi-eye-off-outline</v-icon>
            <span class="pool-page-gap-text">Hidden</span>
            <div class="pool-page-num">{{ slot.sequence }}</div>
          </div>
        </div>
      </template>
    </div>

    <div
      v-else
      class="pool-scroll"
      :class="{ 'pool-scroll--full': fullWidthScroll }"
    >
      <template v-for="slot in pageSlots" :key="slot.key">
        <div
          v-if="slot.kind === 'post'"
          :id="`pool-post-${slot.post.id}`"
          class="pool-scroll-page"
          :class="{ 'pool-scroll-page--blur': slot.blurred }"
        >
          <button
            type="button"
            class="pool-scroll-img-btn"
            :title="`Post ${slot.sequence}`"
            @click="emit('open-post', slot.post.id)"
          >
            <img
              v-if="scrollUrl(slot.post)"
              class="pool-scroll-img"
              :src="scrollUrl(slot.post)!"
              loading="lazy"
              decoding="async"
              :alt="`Post ${slot.post.id}`"
            />
          </button>
          <div class="pool-scroll-caption">
            {{ slot.sequence }}
            <template v-if="totalCount"> / {{ totalCount }}</template>
            <span v-if="slot.blurred"> · hidden</span>
          </div>
        </div>
        <div
          v-else
          :id="`pool-post-${slot.postId}`"
          class="pool-scroll-page pool-scroll-page--gap"
        >
          <div class="pool-scroll-gap">
            <v-icon size="36">mdi-eye-off-outline</v-icon>
            <div>Page {{ slot.sequence }} hidden</div>
          </div>
          <div class="pool-scroll-caption">
            {{ slot.sequence }}
            <template v-if="totalCount"> / {{ totalCount }}</template>
          </div>
        </div>
      </template>
      <div class="pool-scroll-end">
        <v-btn
          variant="outlined"
          size="small"
          prepend-icon="mdi-arrow-up"
          @click="scrollToTop"
        >
          To top
        </v-btn>
      </div>
    </div>

    <div v-if="chunkCount > 1" class="pool-chunk-pagination">
      <v-btn
        :disabled="chunk <= 1 || loading"
        variant="outlined"
        size="small"
        icon="mdi-chevron-left"
        @click="emit('change-chunk', chunk - 1)"
      />
      <template v-for="(p, i) in chunkButtons" :key="`${p}-${i}`">
        <v-btn
          v-if="p !== '...'"
          :variant="p === chunk ? 'flat' : 'text'"
          :color="p === chunk ? 'primary' : undefined"
          size="small"
          min-width="36"
          :disabled="loading"
          @click="emit('change-chunk', Number(p))"
        >
          {{ p }}
        </v-btn>
        <span v-else class="pool-chunk-ellipsis">…</span>
      </template>
      <v-btn
        :disabled="chunk >= chunkCount || loading"
        variant="outlined"
        size="small"
        icon="mdi-chevron-right"
        @click="emit('change-chunk', chunk + 1)"
      />
      <span class="pool-chunk-range text-caption">{{ chunkRangeLabel }}</span>
    </div>

    <TipDialog
      :tip-id="TIP_IDS.poolReader"
      title="Pool reader"
      v-model="poolReaderTipOpen"
    >
      <p class="mb-3">
        Gallery shows page thumbnails; Scroll reads the chunk top to bottom
        (optional full width). Hidden pages stay as placeholders when blacklist
        or fetch gaps apply.
      </p>
      <p class="mb-0">
        Save chunk downloads this page range locally; Save all walks the whole
        pool. Fullscreen continues across chunks when you page next/prev.
      </p>
    </TipDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { EnhancedPost } from "@/worker/ApiService";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import { proxyDownloadUrl } from "@/misc/util/mediaProxy";
import {
  buildChunkButtons,
  loadComicFullWidthScroll,
  loadComicViewMode,
  saveComicFullWidthScroll,
  saveComicViewMode,
  type ComicReaderViewMode,
} from "@/misc/util/comicReader";

export type PoolViewMode = ComicReaderViewMode;

type PageSlot =
  | {
      kind: "post";
      key: string;
      post: EnhancedPost;
      sequence: number;
      blurred: boolean;
    }
  | {
      kind: "gap";
      key: string;
      postId: number;
      sequence: number;
    };

const VIEW_MODE_KEY = "pools-view-mode";
const FULL_WIDTH_KEY = "pools-scroll-full-width";

const props = defineProps<{
  posts: EnhancedPost[];
  loading: boolean;
  chunk: number;
  chunkCount: number;
  totalCount: number;
  postIds: number[];
  /** Ordered ids for the current chunk (for honest gaps). */
  chunkIds: number[];
  /** When set, scroll mode scrolls this post into view once it is present. */
  focusPostId?: number;
  savingChunk?: boolean;
  savingAll?: boolean;
}>();

const emit = defineEmits<{
  (e: "open-post", postId: number): void;
  (e: "change-chunk", chunk: number): void;
  (e: "view-mode-change", mode: PoolViewMode): void;
  (e: "focus-applied"): void;
  (e: "save-chunk"): void;
  (e: "save-all"): void;
}>();

const viewMode = ref<PoolViewMode>(loadComicViewMode(VIEW_MODE_KEY));
const fullWidthScroll = ref(loadComicFullWidthScroll(FULL_WIDTH_KEY));
const { open: poolReaderTipOpen, tryOpen: tryPoolReaderTip } = useTipOpen(
  TIP_IDS.poolReader,
);
onMounted(() => tryPoolReaderTip());

watch(
  viewMode,
  (mode) => {
    saveComicViewMode(VIEW_MODE_KEY, mode);
    emit("view-mode-change", mode);
  },
  { immediate: true },
);

watch(fullWidthScroll, (value) => {
  saveComicFullWidthScroll(FULL_WIDTH_KEY, value);
});

const postsById = computed(() => {
  const map = new Map<number, EnhancedPost>();
  for (const post of props.posts) map.set(post.id, post);
  return map;
});

const pageSlots = computed((): PageSlot[] => {
  const ids = props.chunkIds.length
    ? props.chunkIds
    : props.posts.map((p) => p.id);
  return ids.map((id, index) => {
    const sequence =
      props.postIds.indexOf(id) >= 0 ? props.postIds.indexOf(id) + 1 : index + 1;
    const post = postsById.value.get(id);
    if (!post) {
      return { kind: "gap", key: `gap-${id}`, postId: id, sequence };
    }
    const blurred = !!post.__meta?.isBlacklisted;
    return {
      kind: "post",
      key: `post-${id}`,
      post,
      sequence,
      blurred,
    };
  });
});

const hiddenCount = computed(
  () =>
    pageSlots.value.filter(
      (slot) => slot.kind === "gap" || (slot.kind === "post" && slot.blurred),
    ).length,
);

const savableInChunk = computed(() =>
  pageSlots.value.some(
    (slot) =>
      slot.kind === "post" &&
      !slot.blurred &&
      !!slot.post.file?.url,
  ),
);

const chunkRangeLabel = computed(() => {
  const total = props.totalCount || props.postIds.length;
  if (!total) return "";
  if (!pageSlots.value.length) return `— / ${total}`;
  const first = pageSlots.value[0]!.sequence;
  const last = pageSlots.value[pageSlots.value.length - 1]!.sequence;
  return `${first}–${last} / ${total}`;
});

const chunkButtons = computed(() =>
  buildChunkButtons(props.chunkCount, props.chunk),
);

const thumbUrl = (post: EnhancedPost) =>
  proxyDownloadUrl(post.preview?.url || post.sample?.url || post.file?.url);

const scrollUrl = (post: EnhancedPost) =>
  proxyDownloadUrl(post.sample?.url || post.file?.url || post.preview?.url);

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
};

watch(
  () => [props.focusPostId, props.posts, props.chunkIds, viewMode.value] as const,
  async ([focusId]) => {
    if (!focusId || viewMode.value !== "scroll") return;
    await nextTick();
    const el = document.getElementById(`pool-post-${focusId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    emit("focus-applied");
  },
);
</script>

<style scoped>
.pool-reader-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 0 0.75rem 1rem;
  max-width: 1400px;
  margin: 0 auto;
}
.pool-reader-label {
  margin-left: 4px;
}
@media (max-width: 600px) {
  .pool-reader-label {
    display: none;
  }
}

.pool-reader-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  padding: 0 0.75rem;
  max-width: 1400px;
  margin: 0 auto;
}
@media (min-width: 600px) {
  .pool-reader-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
    padding: 0 1.25rem;
  }
}
@media (min-width: 960px) {
  .pool-reader-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}

.pool-page-card {
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: zoom-in;
  border-radius: 6px;
  overflow: hidden;
}
.pool-page-card--gap {
  cursor: default;
}
.pool-page-card--blur .pool-page-img {
  filter: blur(10px);
  transform: scale(1.08);
}
.pool-page-thumb {
  position: relative;
  aspect-ratio: 1;
  background: rgba(var(--v-border-color), 0.15);
  overflow: hidden;
  border-radius: 6px;
}
.pool-page-thumb--gap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  opacity: 0.55;
}
.pool-page-gap-text {
  font-size: 0.7rem;
  font-weight: 600;
}
.pool-page-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pool-page-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
}
.pool-page-hidden-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.pool-page-num {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
}
.pool-page-skeleton {
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
}

.pool-scroll {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  padding: 0.5rem 0.75rem 2rem;
  max-width: 1100px;
  margin: 0 auto;
}
.pool-scroll--full {
  max-width: none;
  padding-left: 0;
  padding-right: 0;
}
.pool-scroll-page {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  scroll-margin-top: 12px;
}
.pool-scroll-page--blur .pool-scroll-img {
  filter: blur(14px);
}
.pool-scroll-page--gap {
  opacity: 0.7;
}
.pool-scroll-gap {
  width: 100%;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(var(--v-border-color), 0.12);
  border-radius: 8px;
  font-size: 0.85rem;
}
.pool-scroll-img-btn {
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: zoom-in;
  line-height: 0;
}
.pool-scroll-img {
  width: auto;
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
  border-radius: 4px;
  background: rgba(var(--v-border-color), 0.12);
}
.pool-scroll--full .pool-scroll-img {
  width: 100%;
  border-radius: 0;
}
.pool-scroll-caption {
  margin-top: 6px;
  font-size: 0.75rem;
  opacity: 0.55;
}
.pool-scroll-end {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 1rem 0 0.5rem;
}

.pool-chunk-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 1.25rem 0.75rem 2rem;
  max-width: 1400px;
  margin: 0 auto;
}
.pool-chunk-ellipsis {
  opacity: 0.45;
  padding: 0 2px;
  user-select: none;
}
.pool-chunk-range {
  margin-left: 8px;
  opacity: 0.6;
  white-space: nowrap;
}
</style>
