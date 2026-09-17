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
      <button
        v-for="(post, index) in posts"
        :key="post.id"
        type="button"
        class="pool-page-card"
        :title="`Post ${sequenceNumber(post, index)}`"
        @click="emit('open-post', post.id)"
      >
        <div class="pool-page-thumb">
          <img
            v-if="thumbUrl(post)"
            class="pool-page-img"
            :src="thumbUrl(post)!"
            loading="lazy"
            :alt="`Post ${post.id}`"
          />
          <div v-else class="pool-page-placeholder">
            <v-icon size="28">mdi-image-off-outline</v-icon>
          </div>
          <div class="pool-page-num">{{ sequenceNumber(post, index) }}</div>
        </div>
      </button>
    </div>

    <div
      v-else
      class="pool-scroll"
      :class="{ 'pool-scroll--full': fullWidthScroll }"
    >
      <div
        v-for="(post, index) in posts"
        :id="`pool-post-${post.id}`"
        :key="post.id"
        class="pool-scroll-page"
      >
        <button
          type="button"
          class="pool-scroll-img-btn"
          :title="`Post ${sequenceNumber(post, index)}`"
          @click="emit('open-post', post.id)"
        >
          <img
            v-if="scrollUrl(post)"
            class="pool-scroll-img"
            :src="scrollUrl(post)!"
            loading="lazy"
            decoding="async"
            :alt="`Post ${post.id}`"
          />
        </button>
        <div class="pool-scroll-caption">
          {{ sequenceNumber(post, index) }}
          <template v-if="totalCount"> / {{ totalCount }}</template>
        </div>
      </div>
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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { EnhancedPost } from "@/worker/ApiService";
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

const VIEW_MODE_KEY = "pools-view-mode";
const FULL_WIDTH_KEY = "pools-scroll-full-width";

const props = defineProps<{
  posts: EnhancedPost[];
  loading: boolean;
  chunk: number;
  chunkCount: number;
  totalCount: number;
  postIds: number[];
  /** When set, scroll mode scrolls this post into view once it is present. */
  focusPostId?: number;
}>();

const emit = defineEmits<{
  (e: "open-post", postId: number): void;
  (e: "change-chunk", chunk: number): void;
  (e: "view-mode-change", mode: PoolViewMode): void;
  (e: "focus-applied"): void;
}>();

const viewMode = ref<PoolViewMode>(loadComicViewMode(VIEW_MODE_KEY));
const fullWidthScroll = ref(loadComicFullWidthScroll(FULL_WIDTH_KEY));

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

const sequenceNumber = (post: EnhancedPost, index: number) => {
  const idx = props.postIds.indexOf(post.id);
  if (idx >= 0) return idx + 1;
  return index + 1;
};

const chunkRangeLabel = computed(() => {
  const total = props.totalCount || props.postIds.length;
  if (!total) return "";
  if (!props.posts.length) return `— / ${total}`;
  const first = sequenceNumber(props.posts[0]!, 0);
  const last = sequenceNumber(props.posts[props.posts.length - 1]!, props.posts.length - 1);
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
  () => [props.focusPostId, props.posts, viewMode.value] as const,
  async ([focusId]) => {
    if (!focusId || viewMode.value !== "scroll") return;
    if (!props.posts.some((p) => p.id === focusId)) return;
    await nextTick();
    const el = document.getElementById(`pool-post-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
.pool-page-thumb {
  position: relative;
  aspect-ratio: 1;
  background: rgba(var(--v-border-color), 0.15);
  overflow: hidden;
  border-radius: 6px;
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
