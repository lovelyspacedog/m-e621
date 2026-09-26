<template>
  <div class="u18-thread-page">
    <div class="u18-thread-header">
      <v-btn
        variant="text"
        size="small"
        prepend-icon="mdi-arrow-left"
        @click="goBack"
      >
        Catalog
      </v-btn>
      <div class="u18-thread-title-block">
        <span class="text-overline text-medium-emphasis">u18chan /{{ liveBoard }}/</span>
        <h1 class="text-h6 font-weight-bold">{{ thread?.subject || `Thread ${topicId}` }}</h1>
        <div v-if="dumpPages.length" class="text-caption text-medium-emphasis">
          {{ dumpPages.length }} dump page{{ dumpPages.length === 1 ? "" : "s" }}
          <span v-if="dumpPages[0]">· {{ dumpPages[0].name }}</span>
        </div>
      </div>
      <div class="u18-thread-actions">
        <v-btn-toggle
          v-if="thread"
          v-model="viewMode"
          mandatory
          density="compact"
          variant="outlined"
          divided
          class="u18-view-toggle"
        >
          <v-btn value="thread" size="small" title="Thread">
            <v-icon size="18">mdi-forum-outline</v-icon>
            <span class="u18-view-label">Thread</span>
          </v-btn>
          <v-btn
            value="gallery"
            size="small"
            title="Gallery"
            :disabled="!dumpPages.length"
          >
            <v-icon size="18">mdi-view-grid</v-icon>
            <span class="u18-view-label">Gallery</span>
          </v-btn>
          <v-btn
            value="scroll"
            size="small"
            title="Scroll"
            :disabled="!dumpPages.length"
          >
            <v-icon size="18">mdi-view-agenda</v-icon>
            <span class="u18-view-label">Scroll</span>
          </v-btn>
        </v-btn-toggle>
        <v-btn
          v-if="viewMode === 'scroll' && dumpPages.length"
          size="small"
          variant="outlined"
          :color="fullWidthScroll ? 'primary' : undefined"
          :title="fullWidthScroll ? 'Exit full width' : 'Full width'"
          @click="fullWidthScroll = !fullWidthScroll"
        >
          <v-icon size="18">mdi-arrow-expand-horizontal</v-icon>
          <span class="u18-view-label">{{ fullWidthScroll ? "Fit" : "Full width" }}</span>
        </v-btn>
        <v-btn
          icon
          variant="text"
          :loading="loading"
          aria-label="Refresh"
          @click="load"
        >
          <v-icon>mdi-refresh</v-icon>
        </v-btn>
      </div>
    </div>

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <div v-if="loading && !thread" class="pa-4">
      <v-skeleton-loader type="article, image" />
    </div>

    <template v-else-if="thread">
      <!-- Gallery: leading dump thumbs -->
      <div v-if="viewMode === 'gallery'" class="u18-reader-grid">
        <button
          v-for="page in visiblePages"
          :key="page.key"
          type="button"
          class="u18-page-card"
          :title="`Page ${page.pageNumber}`"
          @click="openDumpPage(page.pageNumber)"
        >
          <div class="u18-page-thumb">
            <img
              class="u18-page-img"
              :src="media(page.image.thumbUrl || page.image.fullUrl)"
              loading="lazy"
              :alt="`Page ${page.pageNumber}`"
            />
            <div class="u18-page-num">{{ page.pageNumber }}</div>
          </div>
        </button>
      </div>

      <!-- Scroll: leading dump full pages -->
      <div
        v-else-if="viewMode === 'scroll'"
        class="u18-scroll"
        :class="{ 'u18-scroll--full': fullWidthScroll }"
      >
        <div
          v-for="page in visiblePages"
          :id="`u18-dump-page-${page.pageNumber}`"
          :key="page.key"
          class="u18-scroll-page"
        >
          <button
            type="button"
            class="u18-scroll-img-btn"
            :title="`Page ${page.pageNumber}`"
            @click="openDumpPage(page.pageNumber)"
          >
            <img
              class="u18-scroll-img"
              :src="media(page.image.fullUrl)"
              loading="lazy"
              decoding="async"
              :alt="`Page ${page.pageNumber}`"
            />
          </button>
          <div class="u18-scroll-caption">Page {{ page.pageNumber }}</div>
        </div>
        <div class="u18-scroll-end">
          <v-btn
            variant="outlined"
            size="small"
            prepend-icon="mdi-arrow-up"
            @click="scrollToTop"
          >
            To top
          </v-btn>
          <v-btn variant="text" size="small" @click="viewMode = 'thread'">
            Jump to thread
          </v-btn>
        </div>
      </div>

      <!-- Thread: OP + replies -->
      <div v-else class="u18-posts">
        <article
          v-for="post in thread.posts"
          :id="`p${post.id}`"
          :key="post.id"
          class="u18-post"
          :class="{ 'u18-post--op': post.isOp }"
        >
          <header class="u18-post-meta">
            <strong v-if="post.subject" class="u18-post-subject">{{ post.subject }}</strong>
            <span class="u18-post-name">{{ post.name }}</span>
            <span class="text-medium-emphasis">{{ post.timestamp }}</span>
            <span class="text-medium-emphasis">No.{{ post.id }}</span>
          </header>
          <div v-if="post.images.length" class="u18-post-images">
            <a
              v-for="(img, i) in post.images"
              :key="i"
              :href="media(img.fullUrl)"
              target="_blank"
              rel="noopener"
            >
              <img
                :src="media(img.thumbUrl || img.fullUrl)"
                :alt="`Post ${post.id}`"
                loading="lazy"
              />
            </a>
          </div>
          <div class="u18-post-body" v-text="post.comment" />
        </article>
      </div>

      <div
        v-if="
          dumpPages.length > chunkSize &&
          (viewMode === 'gallery' || viewMode === 'scroll')
        "
        class="u18-chunk-pagination"
      >
        <v-btn
          :disabled="chunkPage <= 1"
          variant="outlined"
          size="small"
          icon="mdi-chevron-left"
          @click="changeChunk(chunkPage - 1)"
        />
        <template v-for="(p, i) in chunkButtons" :key="`${p}-${i}`">
          <v-btn
            v-if="p !== '...'"
            :variant="p === chunkPage ? 'flat' : 'text'"
            :color="p === chunkPage ? 'primary' : undefined"
            size="small"
            min-width="36"
            @click="changeChunk(Number(p))"
          >
            {{ p }}
          </v-btn>
          <span v-else class="u18-chunk-ellipsis">…</span>
        </template>
        <v-btn
          :disabled="chunkPage >= chunkCount"
          variant="outlined"
          size="small"
          icon="mdi-chevron-right"
          @click="changeChunk(chunkPage + 1)"
        />
        <span class="u18-chunk-range">{{ chunkRangeLabel }}</span>
      </div>
    </template>

    <v-card v-if="thread && viewMode === 'thread'" class="u18-compose ma-4" variant="outlined">
      <v-card-title class="text-subtitle-1">Reply</v-card-title>
      <v-card-text>
        <u18chan-compose-form
          :live-board="liveBoard"
          :topic-id="topicId"
          :submitting="posting"
          @submit="onReply"
        />
      </v-card-text>
    </v-card>

    <v-dialog v-model="fullscreenOpen" fullscreen scrim="black" transition="fade-transition">
      <div v-if="fullscreenPage" class="u18-fs">
        <div class="u18-fs-bar">
          <span class="text-body-2">
            Page {{ fullscreenPage.pageNumber }} / {{ dumpPages.length }}
          </span>
          <v-spacer />
          <v-btn
            icon
            variant="text"
            :disabled="fullscreenPage.pageNumber <= 1"
            aria-label="Previous page"
            @click="openDumpPage(fullscreenPage.pageNumber - 1)"
          >
            <v-icon>mdi-chevron-left</v-icon>
          </v-btn>
          <v-btn
            icon
            variant="text"
            :disabled="fullscreenPage.pageNumber >= dumpPages.length"
            aria-label="Next page"
            @click="openDumpPage(fullscreenPage.pageNumber + 1)"
          >
            <v-icon>mdi-chevron-right</v-icon>
          </v-btn>
          <v-btn icon variant="text" aria-label="Close" @click="fullscreenOpen = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
        <div class="u18-fs-body" @click="fullscreenOpen = false">
          <img
            class="u18-fs-img"
            :src="media(fullscreenPage.image.fullUrl)"
            :alt="`Page ${fullscreenPage.pageNumber}`"
            @click.stop
          />
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { createPost, getThread, u18chanMediaUrl } from "@/worker/u18chan/api";
import type { U18chanPostPayload, U18chanThread } from "@/worker/u18chan/types";
import {
  DEFAULT_U18CHAN_INDEX,
  u18chanIndexBySlug,
} from "@/misc/util/u18chanBoards";
import {
  buildChunkButtons,
  chunkForIndex,
  comicChunkKeyDelta,
  GALLERY_CHUNK_SIZE,
  isComicTypingTarget,
  loadComicFullWidthScroll,
  saveComicFullWidthScroll,
  SCROLL_CHUNK_SIZE,
} from "@/misc/util/comicReader";
import {
  defaultU18chanThreadViewMode,
  extractU18chanImageDump,
  isU18chanThreadViewMode,
  type U18chanDumpPage,
  type U18chanThreadViewMode,
} from "@/misc/util/u18chanImageDump";
import U18chanComposeForm from "./U18chanComposeForm.vue";

const VIEW_MODE_KEY = "u18chan-thread-view-mode";
const FULL_WIDTH_KEY = "u18chan-scroll-full-width";

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const posting = ref(false);
const error = ref<string | null>(null);
const thread = ref<U18chanThread | null>(null);
const viewMode = ref<U18chanThreadViewMode>("thread");
const fullWidthScroll = ref(loadComicFullWidthScroll(FULL_WIDTH_KEY));
const chunkPage = ref(1);
const fullscreenOpen = ref(false);
const fullscreenPage = ref<U18chanDumpPage | null>(null);
const viewModeReady = ref(false);

const indexBoard = computed(() =>
  String(route.params.board || DEFAULT_U18CHAN_INDEX).toLowerCase(),
);
const topicId = computed(() => Number(route.params.id || 0));
const liveBoard = computed(() => {
  const q = String(route.query.live || "").toLowerCase();
  if (q) return q;
  return u18chanIndexBySlug(indexBoard.value)?.live || "fur";
});

const dumpPages = computed(() => extractU18chanImageDump(thread.value?.posts));

const chunkSize = computed(() =>
  viewMode.value === "scroll" ? SCROLL_CHUNK_SIZE : GALLERY_CHUNK_SIZE,
);
const chunkCount = computed(() =>
  Math.max(1, Math.ceil(dumpPages.value.length / chunkSize.value)),
);
const visiblePages = computed(() => {
  const start = (chunkPage.value - 1) * chunkSize.value;
  return dumpPages.value.slice(start, start + chunkSize.value);
});
const chunkButtons = computed(() =>
  buildChunkButtons(chunkCount.value, chunkPage.value),
);
const chunkRangeLabel = computed(() => {
  const total = dumpPages.value.length;
  if (!total) return "";
  const start = (chunkPage.value - 1) * chunkSize.value + 1;
  const end = Math.min(total, chunkPage.value * chunkSize.value);
  return `${start}–${end} / ${total}`;
});

const media = (url: string) => u18chanMediaUrl(url);

const loadPersistedOrDefaultView = () => {
  let persisted: U18chanThreadViewMode | null = null;
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    if (isU18chanThreadViewMode(raw)) persisted = raw;
  } catch {
    /* ignore */
  }
  const dumpCount = dumpPages.value.length;
  if (persisted === "gallery" || persisted === "scroll") {
    viewMode.value = dumpCount ? persisted : "thread";
  } else if (persisted === "thread") {
    viewMode.value = "thread";
  } else {
    viewMode.value = defaultU18chanThreadViewMode(liveBoard.value, dumpCount);
  }
  viewModeReady.value = true;
};

const load = async () => {
  if (!topicId.value) {
    error.value = "Missing thread id";
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    thread.value = await getThread(liveBoard.value, topicId.value, indexBoard.value);
    loadPersistedOrDefaultView();
    chunkPage.value = 1;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load thread";
    thread.value = null;
  } finally {
    loading.value = false;
  }
};

const goBack = () => {
  void router.push({
    name: "U18chanCatalog",
    params: { board: indexBoard.value },
  });
};

const onReply = async (payload: Omit<U18chanPostPayload, "liveBoard" | "topicId">) => {
  posting.value = true;
  error.value = null;
  try {
    await createPost({
      ...payload,
      liveBoard: liveBoard.value,
      topicId: topicId.value,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to reply";
  } finally {
    posting.value = false;
  }
};

const changeChunk = (p: number) => {
  if (p < 1 || p > chunkCount.value || p === chunkPage.value) return;
  chunkPage.value = p;
  if (viewMode.value === "scroll") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const openDumpPage = (pageNumber: number) => {
  const page = dumpPages.value.find((p) => p.pageNumber === pageNumber);
  if (!page) return;
  const needed = chunkForIndex(pageNumber - 1, chunkSize.value);
  if (needed !== chunkPage.value) chunkPage.value = needed;
  fullscreenPage.value = page;
  fullscreenOpen.value = true;
};

watch(viewMode, (mode, prev) => {
  if (!viewModeReady.value) return;
  if (!dumpPages.value.length && (mode === "gallery" || mode === "scroll")) {
    viewMode.value = "thread";
    return;
  }
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
  if (prev === "gallery" || prev === "scroll") {
    const startIdx = (chunkPage.value - 1) * (
      prev === "scroll" ? SCROLL_CHUNK_SIZE : GALLERY_CHUNK_SIZE
    );
    chunkPage.value = chunkForIndex(startIdx, chunkSize.value);
  }
  if (chunkPage.value > chunkCount.value) {
    chunkPage.value = Math.max(1, chunkCount.value);
  }
});

watch(fullWidthScroll, (on) => {
  saveComicFullWidthScroll(FULL_WIDTH_KEY, on);
});

watch(chunkCount, (n) => {
  if (chunkPage.value > n) chunkPage.value = Math.max(1, n);
});

const onKeydown = (e: KeyboardEvent) => {
  if (isComicTypingTarget(e.target)) return;
  if (fullscreenOpen.value && fullscreenPage.value) {
    if (e.key === "ArrowLeft" || e.key === "[") {
      e.preventDefault();
      openDumpPage(fullscreenPage.value.pageNumber - 1);
      return;
    }
    if (e.key === "ArrowRight" || e.key === "]") {
      e.preventDefault();
      openDumpPage(fullscreenPage.value.pageNumber + 1);
      return;
    }
    if (e.key === "Escape") {
      fullscreenOpen.value = false;
      return;
    }
  }
  if (viewMode.value !== "gallery" && viewMode.value !== "scroll") return;
  const delta = comicChunkKeyDelta(e.key);
  if (!delta) return;
  e.preventDefault();
  changeChunk(chunkPage.value + delta);
};

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
});

watch(
  () => [liveBoard.value, topicId.value] as const,
  () => {
    viewModeReady.value = false;
    void load();
  },
  { immediate: true },
);
</script>

<style scoped>
.u18-thread-page {
  max-width: 1100px;
  margin: 0 auto;
  padding-bottom: 48px;
}
.u18-thread-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  flex-wrap: wrap;
}
.u18-thread-title-block {
  flex: 1;
  min-width: 0;
}
.u18-thread-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.u18-view-label {
  margin-left: 4px;
}
@media (max-width: 600px) {
  .u18-view-label {
    display: none;
  }
}
.u18-posts {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 16px;
  max-width: 900px;
  margin: 0 auto;
}
.u18-post {
  padding: 12px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.08);
}
.u18-post--op {
  background: rgba(128, 128, 128, 0.14);
}
.u18-post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.85rem;
  margin-bottom: 8px;
}
.u18-post-subject {
  color: rgb(var(--v-theme-primary));
}
.u18-post-name {
  font-weight: 600;
}
.u18-post-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.u18-post-images img {
  max-width: 240px;
  max-height: 240px;
  border-radius: 4px;
  object-fit: contain;
}
.u18-post-body {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.95rem;
  line-height: 1.4;
}
.u18-reader-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  padding: 0 16px;
}
.u18-page-card {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.u18-page-thumb {
  position: relative;
  aspect-ratio: 3 / 4;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(128, 128, 128, 0.12);
}
.u18-page-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.u18-page-num {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
}
.u18-scroll {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 16px;
  max-width: 900px;
  margin: 0 auto;
}
.u18-scroll--full {
  max-width: none;
}
.u18-scroll-page {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.u18-scroll-img-btn {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  cursor: zoom-in;
}
.u18-scroll-img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 4px;
}
.u18-scroll-caption {
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.u18-scroll-end {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  padding: 16px 0 8px;
}
.u18-chunk-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 16px;
}
.u18-chunk-ellipsis {
  padding: 0 4px;
  opacity: 0.6;
}
.u18-chunk-range {
  margin-left: 8px;
  font-size: 0.85rem;
  opacity: 0.7;
}
.u18-fs {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #000;
  color: #fff;
}
.u18-fs-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
}
.u18-fs-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 8px;
}
.u18-fs-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
