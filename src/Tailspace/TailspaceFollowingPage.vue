<template>
  <div class="ts-posts-page">
    <div class="ts-posts-header">
      <div class="ts-header-inner">
        <div class="ts-header-left">
          <span class="text-overline text-medium-emphasis">Tailspace</span>
          <h1 class="text-h6 font-weight-bold">Following</h1>
        </div>
        <div class="ts-header-right">
          <v-btn
            href="https://tailspace.com/browse-feed"
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

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <v-alert v-if="!loggedIn" type="info" class="ma-4" variant="tonal">
      Log in under Account settings to see posts from artists you follow.
    </v-alert>

    <div v-if="loading && posts.length === 0 && loggedIn" class="ts-grid">
      <v-skeleton-loader
        v-for="n in 24"
        :key="n"
        type="image"
        class="ts-card-skeleton"
      />
    </div>

    <div v-else-if="posts.length > 0" class="ts-grid">
      <div
        v-for="post in posts"
        :key="post.id"
        class="ts-card"
        @click="openPost(post)"
      >
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
          <div v-if="post.media.some((m) => m.mediaKind === 'video')" class="ts-video-badge">
            <v-icon size="14">mdi-play</v-icon>
          </div>
          <div v-else-if="post.media.length > 1" class="ts-multi-badge">
            <v-icon size="12">mdi-image-multiple</v-icon>
            {{ post.media.length }}
          </div>
        </div>
        <div class="ts-card-info">
          <div class="ts-card-title">{{ post.title || "Untitled" }}</div>
          <div class="ts-card-artist">{{ post.creator.displayName }}</div>
        </div>
      </div>
    </div>

    <div
      v-else-if="!loading && loggedIn && !error"
      class="text-center text-medium-emphasis pa-8"
    >
      No posts in your following feed yet.
    </div>

    <div v-if="loggedIn && (hasNextPage || page > 1)" class="ts-pagination">
      <v-btn
        :disabled="page <= 1 || loading"
        variant="outlined"
        prepend-icon="mdi-chevron-left"
        @click="changePage(page - 1)"
      >
        Prev
      </v-btn>
      <span class="ts-page-label">Page {{ page }}</span>
      <v-btn
        :disabled="!hasNextPage || loading"
        variant="outlined"
        append-icon="mdi-chevron-right"
        @click="changePage(page + 1)"
      >
        Next
      </v-btn>
    </div>

    <TailspacePostDialog
      v-if="selectedPost"
      :post="selectedPost"
      :all-posts="posts"
      @close="selectedPost = null"
      @navigate="openPost"
      @update:post="onPostPatch"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getFeed,
  postMediaThumb,
  TAILSPACE_CDN,
  type TailspacePost,
} from "@/worker/tailspace/api";
import TailspacePostDialog from "./TailspacePostDialog.vue";
import { useTailspaceSession } from "./useTailspaceSession";

const session = useTailspaceSession();
const loggedIn = computed(() => session.isLoggedIn());

const route = useRoute();
const router = useRouter();

const posts = ref<TailspacePost[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const hasNextPage = ref(false);
const selectedPost = ref<TailspacePost | null>(null);

const page = ref(Number(route.query.page) || 1);

async function loadPage(p: number) {
  if (!loggedIn.value) {
    posts.value = [];
    hasNextPage.value = false;
    loading.value = false;
    error.value = null;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const res = await getFeed(p);
    posts.value = res.posts;
    hasNextPage.value = res.hasNextPage;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load following feed.";
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

function onPostPatch(patch: Pick<TailspacePost, "yourLike" | "likeCount">) {
  if (!selectedPost.value) return;
  Object.assign(selectedPost.value, patch);
}

onMounted(() => loadPage(page.value));
watch(page, (p) => loadPage(p));
watch(loggedIn, () => loadPage(page.value));
watch(
  () => Number(route.query.page) || 1,
  (p) => {
    if (p !== page.value) page.value = p;
  },
);
</script>

<style scoped>
.ts-posts-page {
  min-height: 100%;
  padding-bottom: 2rem;
}
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
.ts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
  padding: 0 1rem;
  max-width: 1800px;
  margin: 0 auto;
}
.ts-card {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(var(--v-theme-surface-variant), 0.35);
}
.ts-card-thumb {
  position: relative;
  aspect-ratio: 1;
  background: #111;
}
.ts-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ts-thumb-grid {
  display: grid;
  width: 100%;
  height: 100%;
  gap: 2px;
}
.ts-thumb-grid--2 { grid-template-columns: 1fr 1fr; }
.ts-thumb-grid--3,
.ts-thumb-grid--4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.ts-thumb-cell { position: relative; overflow: hidden; }
.ts-thumb-more {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-weight: 700;
}
.ts-video-badge,
.ts-multi-badge {
  position: absolute;
  right: 6px;
  bottom: 6px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border-radius: 4px;
  padding: 2px 5px;
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.7rem;
}
.ts-card-info { padding: 6px 8px 8px; }
.ts-card-title {
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ts-card-artist {
  font-size: 0.72rem;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ts-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
}
.ts-page-label { font-size: 0.9rem; }
.ts-card-skeleton { border-radius: 8px; overflow: hidden; }
</style>
