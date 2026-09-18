<template>
  <div class="ts-posts-page">
    <!-- Header -->
    <div class="ts-posts-header">
      <div class="ts-header-inner">
        <div class="ts-header-left">
          <span class="text-overline text-medium-emphasis">Tailspace</span>
          <h1 class="text-h6 font-weight-bold">Posts</h1>
        </div>
        <div class="ts-header-right">
          <v-text-field
            v-model="searchInput"
            label="Filter title, artist, tags"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            class="ts-search"
            @keydown.enter="applySearch"
            @click:clear="clearSearch"
          />
          <v-btn
            :href="`https://tailspace.com/browse-posts`"
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
      <div v-if="queryTerms.length" class="ts-search-hint text-caption text-medium-emphasis">
        Client-side filter (Tailspace posts API has no tag search) · scanned {{ scannedPages }} page{{ scannedPages === 1 ? "" : "s" }}
        <template v-if="hasNextPage"> · more available</template>
      </div>
    </div>

    <!-- Error -->
    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <!-- Loading skeleton -->
    <div v-if="loading && posts.length === 0" class="ts-grid">
      <v-skeleton-loader
        v-for="n in 24"
        :key="n"
        type="image"
        class="ts-card-skeleton"
      />
    </div>

    <!-- Post grid -->
    <div v-else-if="posts.length > 0" class="ts-grid">
      <div
        v-for="post in posts"
        :key="post.id"
        class="ts-card"
        @click="openPost(post)"
      >
        <!-- Thumbnail: show first media item or 2×2 grid for multi -->
        <div class="ts-card-thumb">
          <template v-if="post.media.length === 1">
            <video
              v-if="post.media[0].mediaKind === 'video'"
              class="ts-thumb-img"
              :src="`${TAILSPACE_CDN}/post-media/${post.media[0].token}.${post.media[0].fileType}#t=0.5`"
              preload="metadata"
              muted
            />
            <img
              v-else
              class="ts-thumb-img"
              :src="postMediaThumb(post.media[0].token)"
              loading="lazy"
              :alt="post.title"
            />
          </template>
          <template v-else-if="post.media.length > 1">
            <div class="ts-thumb-grid" :class="`ts-thumb-grid--${Math.min(post.media.length, 4)}`">
              <div
                v-for="(m, i) in post.media.slice(0, 4)"
                :key="m.id"
                class="ts-thumb-cell"
              >
                <video
                  v-if="m.mediaKind === 'video'"
                  class="ts-thumb-img"
                  :src="`${TAILSPACE_CDN}/post-media/${m.token}.${m.fileType}#t=0.5`"
                  preload="metadata"
                  muted
                />
                <img
                  v-else
                  class="ts-thumb-img"
                  :src="postMediaThumb(m.token)"
                  loading="lazy"
                  :alt="post.title"
                />
                <div v-if="i === 3 && post.media.length > 4" class="ts-thumb-more">
                  +{{ post.media.length - 4 }}
                </div>
              </div>
            </div>
          </template>
          <!-- Video indicator -->
          <div v-if="post.media.some(m => m.mediaKind === 'video')" class="ts-video-badge">
            <v-icon size="14">mdi-play</v-icon>
          </div>
          <!-- Multi-image indicator -->
          <div v-else-if="post.media.length > 1" class="ts-multi-badge">
            <v-icon size="12">mdi-image-multiple</v-icon>
            {{ post.media.length }}
          </div>
        </div>
        <div class="ts-card-info">
          <div class="ts-card-title">{{ post.title }}</div>
          <div class="ts-card-artist">{{ post.creator.displayName }}</div>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="!loading" class="ts-empty">
      <v-icon size="64" color="medium-emphasis">mdi-image-off-outline</v-icon>
      <p class="mt-3 text-medium-emphasis">No posts found.</p>
    </div>

    <!-- Pagination -->
    <div v-if="posts.length > 0 || page > 1 || queryTerms.length" class="ts-pagination">
      <template v-if="!queryTerms.length">
        <v-btn
          :disabled="page <= 1 || loading"
          variant="outlined"
          size="small"
          icon="mdi-chevron-left"
          @click="changePage(page - 1)"
        />
        <span class="ts-page-num">Page {{ page }}</span>
        <v-btn
          :disabled="!hasNextPage || loading"
          variant="outlined"
          size="small"
          icon="mdi-chevron-right"
          @click="changePage(page + 1)"
        />
      </template>
      <template v-else>
        <v-btn
          :disabled="!hasNextPage || loading"
          variant="outlined"
          size="small"
          :loading="loading"
          @click="loadMoreFiltered"
        >
          {{ hasNextPage ? "Scan more pages" : "No more pages" }}
        </v-btn>
      </template>
    </div>

    <!-- Post fullscreen dialog -->
    <tailspace-post-dialog
      v-if="selectedPost"
      :post="selectedPost"
      :all-posts="posts"
      @close="selectedPost = null"
      @navigate="openPost"
      @search-tag="onTagSearch"
      @update:post="onPostPatch"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getPosts,
  postMediaThumb,
  TAILSPACE_CDN,
  type TailspacePost,
} from "@/worker/tailspace/api";
import TailspacePostDialog from "./TailspacePostDialog.vue";
import { useTailspaceSession } from "./useTailspaceSession";
import {
  parseTailspaceQueryTerms,
  tailspacePostMatchesQuery,
} from "@/misc/util/tailspaceSearch";

useTailspaceSession();

const route = useRoute();
const router = useRouter();

const TARGET_MATCHES = 24;
const MAX_SCAN_PAGES = 20;

const posts = ref<TailspacePost[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const hasNextPage = ref(false);
const selectedPost = ref<TailspacePost | null>(null);
const scannedPages = ref(0);
const nextScanPage = ref(1);

const page = ref(Number(route.query.page) || 1);
const tagsQuery = computed(() => {
  const raw = route.query.tags;
  return typeof raw === "string" ? raw : "";
});
const queryTerms = computed(() => parseTailspaceQueryTerms(tagsQuery.value));
const searchInput = ref(tagsQuery.value);

watch(tagsQuery, (v) => {
  if (searchInput.value !== v) searchInput.value = v;
});

function syncRoute(next: { page?: number; tags?: string }) {
  const query: Record<string, string> = {};
  const p = next.page ?? page.value;
  const tags = next.tags !== undefined ? next.tags : tagsQuery.value;
  if (p > 1 && !tags.trim()) query.page = String(p);
  if (tags.trim()) query.tags = tags.trim();
  router.replace({ query });
}

async function loadBrowsePage(p: number) {
  loading.value = true;
  error.value = null;
  try {
    const res = await getPosts(p);
    posts.value = res.posts;
    hasNextPage.value = res.hasNextPage;
    scannedPages.value = 1;
    nextScanPage.value = p + 1;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load posts.";
  } finally {
    loading.value = false;
  }
}

async function loadFiltered(reset: boolean) {
  loading.value = true;
  error.value = null;
  try {
    if (reset) {
      posts.value = [];
      nextScanPage.value = 1;
      scannedPages.value = 0;
      hasNextPage.value = true;
    }
    const seen = new Set(posts.value.map((p) => p.id));
    let guard = 0;
    while (
      posts.value.length < TARGET_MATCHES &&
      hasNextPage.value &&
      scannedPages.value < MAX_SCAN_PAGES &&
      guard < MAX_SCAN_PAGES
    ) {
      guard += 1;
      const res = await getPosts(nextScanPage.value);
      scannedPages.value += 1;
      nextScanPage.value += 1;
      hasNextPage.value = res.hasNextPage;
      for (const post of res.posts) {
        if (seen.has(post.id)) continue;
        if (!tailspacePostMatchesQuery(post, queryTerms.value)) continue;
        seen.add(post.id);
        posts.value.push(post);
      }
      if (!res.posts.length) {
        hasNextPage.value = false;
        break;
      }
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load posts.";
  } finally {
    loading.value = false;
  }
}

async function reload() {
  if (queryTerms.value.length) {
    await loadFiltered(true);
  } else {
    await loadBrowsePage(page.value);
  }
}

function changePage(p: number) {
  page.value = p;
  syncRoute({ page: p, tags: "" });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function applySearch() {
  page.value = 1;
  syncRoute({ page: 1, tags: searchInput.value.trim() });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearSearch() {
  searchInput.value = "";
  applySearch();
}

function loadMoreFiltered() {
  if (!queryTerms.value.length || loading.value || !hasNextPage.value) return;
  void loadFiltered(false);
}

function openPost(post: TailspacePost) {
  selectedPost.value = post;
}

function onPostPatch(patch: Pick<TailspacePost, "yourLike" | "likeCount">) {
  if (!selectedPost.value) return;
  Object.assign(selectedPost.value, patch);
}

function onTagSearch(tagName: string) {
  searchInput.value = tagName;
  applySearch();
  selectedPost.value = null;
}

watch(
  () => [tagsQuery.value, Number(route.query.page) || 1] as const,
  ([tags, p]) => {
    if (!tags && p !== page.value) page.value = p;
    void reload();
  },
  { immediate: true },
);
</script>

<style scoped>
.ts-posts-page {
  min-height: 100%;
  padding-bottom: 2rem;
}

/* ── Header ── */
.ts-posts-header {
  padding: 1rem 1.25rem 0.5rem;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  margin-bottom: 0.75rem;
}
.ts-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1800px;
  margin: 0 auto;
  gap: 12px;
  flex-wrap: wrap;
}
.ts-header-left {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.ts-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.ts-search {
  min-width: 200px;
  max-width: 320px;
  flex: 1 1 220px;
}
.ts-search-hint {
  max-width: 1800px;
  margin: 0.5rem auto 0;
  padding: 0 0.25rem;
}


/* ── Grid ── */
.ts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  padding: 0 0.75rem;
  max-width: 1800px;
  margin: 0 auto;
}

@media (min-width: 600px) {
  .ts-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
}
@media (min-width: 960px) {
  .ts-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
    padding: 0 1.25rem;
  }
}

/* ── Card ── */
.ts-card {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(var(--v-theme-surface-variant), 0.4);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.ts-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}

.ts-card-thumb {
  position: relative;
  aspect-ratio: 1;
  background: rgba(var(--v-border-color), 0.15);
  overflow: hidden;
}

.ts-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Multi-image grid layouts */
.ts-thumb-grid {
  display: grid;
  width: 100%;
  height: 100%;
  gap: 2px;
}
.ts-thumb-grid--2 {
  grid-template-columns: 1fr 1fr;
}
.ts-thumb-grid--3 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}
.ts-thumb-grid--3 .ts-thumb-cell:first-child {
  grid-row: span 2;
}
.ts-thumb-grid--4 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}
.ts-thumb-cell {
  position: relative;
  overflow: hidden;
}
.ts-thumb-more {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}

/* Badges */
.ts-video-badge,
.ts-multi-badge {
  position: absolute;
  bottom: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 3px;
  line-height: 1;
  backdrop-filter: blur(4px);
}

.ts-card-info {
  padding: 6px 8px 8px;
}
.ts-card-title {
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.ts-card-artist {
  font-size: 0.72rem;
  opacity: 0.65;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Skeleton ── */
.ts-card-skeleton {
  border-radius: 8px;
  aspect-ratio: 1;
}

/* ── Empty ── */
.ts-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5rem 2rem;
}

/* ── Pagination ── */
.ts-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1.5rem 1rem;
}
.ts-page-num {
  font-size: 0.9rem;
  min-width: 70px;
  text-align: center;
}
</style>
