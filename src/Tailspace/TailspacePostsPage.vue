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
    <div v-if="posts.length > 0 || page > 1" class="ts-pagination">
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
    </div>

    <!-- Post fullscreen dialog -->
    <tailspace-post-dialog
      v-if="selectedPost"
      :post="selectedPost"
      :all-posts="posts"
      @close="selectedPost = null"
      @navigate="openPost"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getPosts,
  postMediaThumb,
  TAILSPACE_CDN,
  type TailspacePost,
} from "@/worker/tailspace/api";
import TailspacePostDialog from "./TailspacePostDialog.vue";

const route = useRoute();
const router = useRouter();

const posts = ref<TailspacePost[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const hasNextPage = ref(false);
const selectedPost = ref<TailspacePost | null>(null);

const page = ref(Number(route.query.page) || 1);

async function loadPage(p: number) {
  loading.value = true;
  error.value = null;
  try {
    const res = await getPosts(p);
    posts.value = res.posts;
    hasNextPage.value = res.hasNextPage;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load posts.";
  } finally {
    loading.value = false;
  }
}

function changePage(p: number) {
  page.value = p;
  router.replace({ query: { page: p > 1 ? String(p) : undefined } });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openPost(post: TailspacePost) {
  selectedPost.value = post;
}

onMounted(() => loadPage(page.value));
watch(page, (p) => loadPage(p));
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
}
.ts-header-left {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
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
