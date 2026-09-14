<template>
  <div class="ts-reader">
    <!-- Header -->
    <div class="ts-reader-header">
      <div class="ts-reader-header-inner">
        <div class="ts-reader-nav">
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-arrow-left"
            :to="{ name: 'TailspaceComics' }"
          >
            Comics
          </v-btn>
        </div>
        <div v-if="comic" class="ts-reader-title-block">
          <h1 class="text-h6 font-weight-bold">{{ comic.name }}</h1>
          <div class="ts-reader-meta">
            <span v-if="comic.artistDisplayName">{{ comic.artistDisplayName }}</span>
            <span>{{ comic.numberOfPages }} pages</span>
            <span v-if="comic.avgStars != null">
              <v-icon size="12">mdi-star</v-icon>
              {{ Number(comic.avgStars).toFixed(1) }}
            </span>
          </div>
        </div>
        <div class="ts-reader-actions">
          <v-btn-toggle
            v-if="comic"
            v-model="viewMode"
            mandatory
            density="compact"
            variant="outlined"
            divided
            class="ts-view-toggle"
          >
            <v-btn value="gallery" size="small" :title="'Gallery'">
              <v-icon size="18">mdi-view-grid</v-icon>
              <span class="ts-view-label">Gallery</span>
            </v-btn>
            <v-btn value="scroll" size="small" :title="'Scroll'">
              <v-icon size="18">mdi-view-agenda</v-icon>
              <span class="ts-view-label">Scroll</span>
            </v-btn>
          </v-btn-toggle>
          <v-btn
            v-if="comic"
            :href="comicUrl(comic.name)"
            target="_blank"
            rel="noopener"
            variant="text"
            size="small"
            append-icon="mdi-open-in-new"
          >
            Open on Tailspace
          </v-btn>
        </div>
      </div>

      <!-- Neighbor comics -->
      <div v-if="comic && (comic.previousComic || comic.nextComic)" class="ts-reader-neighbors">
        <v-btn
          v-if="comic.previousComic"
          variant="outlined"
          size="small"
          prepend-icon="mdi-chevron-left"
          :to="readerRoute(comic.previousComic.name)"
        >
          {{ comic.previousComic.name }}
        </v-btn>
        <span v-else />
        <v-btn
          v-if="comic.nextComic"
          variant="outlined"
          size="small"
          append-icon="mdi-chevron-right"
          :to="readerRoute(comic.nextComic.name)"
        >
          {{ comic.nextComic.name }}
        </v-btn>
      </div>
    </div>

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <!-- Loading -->
    <div v-if="loading && !comic" class="ts-reader-grid">
      <v-skeleton-loader v-for="n in 12" :key="n" type="image" class="ts-page-skeleton" />
    </div>

    <!-- Gallery grid (pool-like) -->
    <div v-else-if="comic && viewMode === 'gallery'" class="ts-reader-grid">
      <button
        v-for="page in comic.pages"
        :key="page.token"
        type="button"
        class="ts-page-card"
        :title="`Page ${page.pageNumber}`"
        @click="openPage(page.pageNumber)"
      >
        <div class="ts-page-thumb">
          <img
            class="ts-page-img"
            :src="comicPageThumb(comic.id, page.token)"
            loading="lazy"
            :alt="`Page ${page.pageNumber}`"
          />
          <div class="ts-page-num">{{ page.pageNumber }}</div>
          <div v-if="page.isAnimated" class="ts-page-gif">GIF</div>
        </div>
      </button>
    </div>

    <!-- Scroll mode: full pages stacked -->
    <div v-else-if="comic && viewMode === 'scroll'" class="ts-scroll">
      <div
        v-for="page in comic.pages"
        :key="page.token"
        :id="`comic-page-${page.pageNumber}`"
        class="ts-scroll-page"
      >
        <button
          type="button"
          class="ts-scroll-img-btn"
          :title="`Page ${page.pageNumber}`"
          @click="openPage(page.pageNumber)"
        >
          <img
            class="ts-scroll-img"
            :src="comicPageFull(comic.id, page.token, page.fileType)"
            loading="lazy"
            decoding="async"
            :alt="`Page ${page.pageNumber}`"
            :width="page.widthPx || undefined"
            :height="page.heightPx || undefined"
          />
        </button>
        <div class="ts-scroll-caption">Page {{ page.pageNumber }}</div>
        <p v-if="page.description" class="ts-scroll-desc">{{ page.description }}</p>
      </div>

      <div class="ts-scroll-end">
        <v-btn
          variant="outlined"
          size="small"
          prepend-icon="mdi-arrow-up"
          @click="scrollToTop"
        >
          To top
        </v-btn>
        <div v-if="comic.previousComic || comic.nextComic" class="ts-scroll-neighbors">
          <v-btn
            v-if="comic.previousComic"
            variant="text"
            size="small"
            prepend-icon="mdi-chevron-left"
            :to="readerRoute(comic.previousComic.name)"
          >
            {{ comic.previousComic.name }}
          </v-btn>
          <v-btn
            v-if="comic.nextComic"
            variant="text"
            size="small"
            append-icon="mdi-chevron-right"
            :to="readerRoute(comic.nextComic.name)"
          >
            {{ comic.nextComic.name }}
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Fullscreen page viewer -->
    <v-dialog
      v-model="viewerOpen"
      fullscreen
      :scrim="false"
      transition="dialog-bottom-transition"
      @keydown.esc="closeViewer"
    >
      <div
        v-if="comic && currentPage"
        class="ts-viewer"
        tabindex="0"
        ref="viewerEl"
        @keydown="onViewerKey"
        @click.self="closeViewer"
      >
        <v-btn
          class="ts-viewer-close"
          icon="mdi-close"
          variant="text"
          color="white"
          size="small"
          @click="closeViewer"
        />

        <v-btn
          v-if="pageIndex > 0"
          class="ts-viewer-nav ts-viewer-nav--prev"
          icon="mdi-chevron-left"
          variant="tonal"
          color="white"
          @click.stop="goPage(pageIndex - 1)"
        />
        <v-btn
          v-if="pageIndex < comic.pages.length - 1"
          class="ts-viewer-nav ts-viewer-nav--next"
          icon="mdi-chevron-right"
          variant="tonal"
          color="white"
          @click.stop="goPage(pageIndex + 1)"
        />

        <div class="ts-viewer-main" @click.self="closeViewer">
          <img
            class="ts-viewer-img"
            :src="comicPageFull(comic.id, currentPage.token, currentPage.fileType)"
            :alt="`Page ${currentPage.pageNumber}`"
            :key="currentPage.token"
          />
        </div>

        <div class="ts-viewer-footer">
          <span>{{ comic.name }}</span>
          <span>Page {{ currentPage.pageNumber }} / {{ comic.pages.length }}</span>
        </div>

        <!-- Page strip -->
        <div class="ts-viewer-strip">
          <button
            v-for="(page, i) in comic.pages"
            :key="page.token"
            type="button"
            class="ts-viewer-strip-thumb"
            :class="{ 'ts-viewer-strip-thumb--active': i === pageIndex }"
            @click.stop="goPage(i)"
          >
            <img
              :src="comicPageThumb(comic.id, page.token)"
              loading="lazy"
              :alt="`Page ${page.pageNumber}`"
            />
          </button>
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getComic,
  comicUrl,
  comicPageFull,
  comicPageThumb,
  type TailspaceComicDetail,
} from "@/worker/tailspace/api";

type ViewMode = "gallery" | "scroll";
const VIEW_MODE_KEY = "tailspace-comic-view-mode";

function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === "scroll" || v === "gallery") return v;
  } catch { /* ignore */ }
  return "gallery";
}

const route = useRoute();
const router = useRouter();

const comic = ref<TailspaceComicDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const viewerOpen = ref(false);
const pageIndex = ref(0);
const viewerEl = ref<HTMLElement | null>(null);
const viewMode = ref<ViewMode>(loadViewMode());

watch(viewMode, (mode) => {
  try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* ignore */ }
});

const comicName = computed(() => {
  const raw = route.params.name;
  const name = Array.isArray(raw) ? raw.join("/") : String(raw || "");
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
});

const currentPage = computed(() => comic.value?.pages[pageIndex.value] ?? null);

function readerRoute(name: string) {
  return { name: "TailspaceComic", params: { name } };
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollToPage(pageNumber: number) {
  nextTick(() => {
    document.getElementById(`comic-page-${pageNumber}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

async function loadComic(name: string) {
  if (!name) return;
  loading.value = true;
  error.value = null;
  comic.value = null;
  viewerOpen.value = false;
  try {
    comic.value = await getComic(name);
    const qPage = Number(route.query.page);
    if (qPage > 0) {
      const idx = comic.value.pages.findIndex((p) => p.pageNumber === qPage);
      if (idx >= 0) {
        if (viewMode.value === "scroll") {
          scrollToPage(qPage);
        } else {
          openPage(qPage);
        }
      }
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load comic.";
  } finally {
    loading.value = false;
  }
}

function openPage(pageNumber: number) {
  if (!comic.value) return;
  const idx = comic.value.pages.findIndex((p) => p.pageNumber === pageNumber);
  if (idx < 0) return;
  pageIndex.value = idx;
  viewerOpen.value = true;
  router.replace({
    query: { ...route.query, page: String(pageNumber) },
  });
  nextTick(() => viewerEl.value?.focus());
}

function goPage(idx: number) {
  if (!comic.value) return;
  if (idx < 0 || idx >= comic.value.pages.length) return;
  pageIndex.value = idx;
  const pageNumber = comic.value.pages[idx].pageNumber;
  router.replace({
    query: { ...route.query, page: String(pageNumber) },
  });
}

function closeViewer() {
  viewerOpen.value = false;
  const q = { ...route.query };
  delete q.page;
  router.replace({ query: q });
}

function onViewerKey(e: KeyboardEvent) {
  if (e.key === "ArrowLeft" || e.key === "a") {
    e.preventDefault();
    goPage(pageIndex.value - 1);
  } else if (e.key === "ArrowRight" || e.key === "d" || e.key === " ") {
    e.preventDefault();
    goPage(pageIndex.value + 1);
  } else if (e.key === "Escape") {
    closeViewer();
  }
}

function onWindowKey(e: KeyboardEvent) {
  if (!viewerOpen.value) return;
  onViewerKey(e);
}

onMounted(() => window.addEventListener("keydown", onWindowKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onWindowKey));

watch(comicName, (name) => loadComic(name), { immediate: true });
watch(viewerOpen, (open) => {
  if (!open) return;
  nextTick(() => viewerEl.value?.focus());
});
watch(viewMode, (mode) => {
  if (mode !== "scroll") return;
  const qPage = Number(route.query.page);
  if (qPage > 0) scrollToPage(qPage);
});
</script>

<style scoped>
.ts-reader {
  min-height: 100%;
  padding-bottom: 2rem;
}

.ts-reader-header {
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  margin-bottom: 0.75rem;
}
.ts-reader-header-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  max-width: 1400px;
  margin: 0 auto;
}
.ts-reader-title-block {
  flex: 1;
  min-width: 180px;
  text-align: center;
}
.ts-reader-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  font-size: 0.78rem;
  opacity: 0.65;
  margin-top: 2px;
}
.ts-reader-meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.ts-reader-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}
.ts-view-toggle {
  flex-shrink: 0;
}
.ts-view-label {
  margin-left: 4px;
}
@media (max-width: 599px) {
  .ts-view-label {
    display: none;
  }
}

.ts-reader-neighbors {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  max-width: 1400px;
  margin: 0.75rem auto 0;
}

.ts-reader-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  padding: 0 0.75rem;
  max-width: 1400px;
  margin: 0 auto;
}
@media (min-width: 600px) {
  .ts-reader-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
    padding: 0 1.25rem;
  }
}
@media (min-width: 960px) {
  .ts-reader-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}

/* ── Scroll mode ── */
.ts-scroll {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  padding: 0.5rem 0.75rem 2rem;
  max-width: 1100px;
  margin: 0 auto;
}
.ts-scroll-page {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  scroll-margin-top: 12px;
}
.ts-scroll-img-btn {
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: zoom-in;
  line-height: 0;
}
.ts-scroll-img {
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: none;
  display: block;
  margin: 0 auto;
  border-radius: 4px;
  background: rgba(var(--v-border-color), 0.12);
}
.ts-scroll-caption {
  margin-top: 6px;
  font-size: 0.75rem;
  opacity: 0.55;
}
.ts-scroll-desc {
  margin: 6px 0 0;
  max-width: 720px;
  font-size: 0.85rem;
  opacity: 0.8;
  white-space: pre-wrap;
  text-align: left;
  align-self: stretch;
}
.ts-scroll-end {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 1rem 0 0.5rem;
}
.ts-scroll-neighbors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.ts-page-card {
  border: 0;
  padding: 0;
  background: rgba(var(--v-theme-surface-variant), 0.4);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.ts-page-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.ts-page-thumb {
  position: relative;
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-border-color), 0.15);
}
.ts-page-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ts-page-num {
  position: absolute;
  bottom: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
}
.ts-page-gif {
  position: absolute;
  top: 5px;
  left: 5px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 700;
}
.ts-page-skeleton {
  aspect-ratio: 2 / 3;
  border-radius: 8px;
}

/* ── Fullscreen viewer ── */
.ts-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.94);
  display: flex;
  flex-direction: column;
  outline: none;
}
.ts-viewer-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
}
.ts-viewer-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
}
.ts-viewer-nav--prev { left: 8px; }
.ts-viewer-nav--next { right: 8px; }
.ts-viewer-main {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 56px 8px;
}
.ts-viewer-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 2px;
}
.ts-viewer-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 14px;
  color: rgba(255,255,255,0.75);
  font-size: 0.8rem;
  flex-shrink: 0;
}
.ts-viewer-strip {
  display: flex;
  gap: 4px;
  padding: 6px 8px 10px;
  overflow-x: auto;
  background: rgba(0, 0, 0, 0.45);
  flex-shrink: 0;
}
.ts-viewer-strip-thumb {
  width: 48px;
  height: 72px;
  flex-shrink: 0;
  border: 2px solid transparent;
  border-radius: 4px;
  overflow: hidden;
  padding: 0;
  cursor: pointer;
  opacity: 0.55;
  background: transparent;
}
.ts-viewer-strip-thumb--active {
  opacity: 1;
  border-color: rgba(var(--v-theme-primary), 1);
}
.ts-viewer-strip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
