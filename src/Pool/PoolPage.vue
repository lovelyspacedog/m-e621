<template>
  <div>
    <div class="pa-4">
      <PoolInfo
        :pool-id="poolId"
        :show-browse="false"
        @loaded="onPoolLoaded"
        @error="onPoolError"
      />
    </div>
    <div v-if="poolError" class="px-4 text-medium-emphasis">
      {{ poolError }}
    </div>
    <div
      v-else-if="poolMeta && !poolMeta.post_ids?.length"
      class="px-4 text-medium-emphasis"
    >
      This pool has no posts.
    </div>
    <template v-else-if="poolMeta">
      <PoolReader
        :posts="posts"
        :loading="loading"
        :chunk="chunk"
        :chunk-count="chunkCount"
        :total-count="poolMeta.post_count || poolMeta.post_ids.length"
        :post-ids="poolMeta.post_ids"
        @open-post="openFullscreenPost"
        @change-chunk="setChunk"
        @view-mode-change="onViewModeChange"
      />
      <fullscreen-dialog
        :has-previous-fullscreen-post="hasPreviousFullscreenPost"
        :has-next-fullscreen-post="hasNextFullscreenPost"
        :current="fullscreenPost || null"
        @close="fullscreenPost = null"
        @next-post="openNextFullscreenPost()"
        @previous-post="openPreviousFullscreenPost()"
        @open-post-details="onOpenDetails"
        @set-post-favorite="onSetFavorite"
        @set-post-vote="onSetVote"
        @open-fluffle-search="flufflePost = $event"
      />
      <details-dialog
        :current="detailsPost || undefined"
        @close="detailsPost = null"
        @open-post-fullscreen="onOpenFullscreen"
        @set-post-favorite="onSetFavorite"
        @set-post-vote="onSetVote"
        @open-fluffle-search="flufflePost = $event"
      />
      <fluffle-search-dialog :post="flufflePost" @close="flufflePost = null" />
    </template>
    <div v-if="sequenceLabel" class="pool-sequence-caption text-caption">
      {{ sequenceLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRaw, watch } from "vue";
import { useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import PoolInfo from "@/Pool/PoolInfo.vue";
import PoolReader, { type PoolViewMode } from "@/Pool/PoolReader.vue";
import FullscreenDialog from "@/Post/FullscreenDialog.vue";
import DetailsDialog from "@/Post/DetailsDialog.vue";
import FluffleSearchDialog from "@/Post/FluffleSearchDialog.vue";
import { usePostListManager } from "@/Post/postListManager";
import { useRouterQueryHelpers } from "@/misc/util/utilities";
import {
  useAccountStore,
  useBlacklistStore,
  useSiteModeStore,
  useSnackbarStore,
  useUrlStore,
} from "@/services";
import { getApiService } from "@/worker/services";
import {
  buildTagQuery,
  tagQueryTruncationMessage,
} from "@/misc/util/createTagQuery";
import type { Pool } from "@/worker/api";
import type { EnhancedPost } from "@/worker/ApiService";
import {
  GALLERY_CHUNK_SIZE,
  SCROLL_CHUNK_SIZE,
} from "@/misc/util/comicReader";

const route = useRoute();
const account = useAccountStore();
const blacklist = useBlacklistStore();
const urlStore = useUrlStore();
const siteMode = useSiteModeStore();
const snackbar = useSnackbarStore();
const { removeRouterQuery, updateRouterQuery } = useRouterQueryHelpers();

const poolId = computed(() => Number(route.params.id) || 0);
const poolMeta = ref<Pool | null>(null);
const poolError = ref<string | null>(null);
const viewMode = ref<PoolViewMode>("gallery");
const chunkLoading = ref(false);
const flufflePost = ref<EnhancedPost | null>(null);

const displayPoolName = computed(() =>
  (poolMeta.value?.name || "").replace(/_/g, " "),
);

useHead({
  title: computed(() => {
    if (displayPoolName.value) return displayPoolName.value;
    return poolId.value ? `Pool ${poolId.value}` : "Pool";
  }),
});

const chunkSize = computed(() =>
  viewMode.value === "scroll" ? SCROLL_CHUNK_SIZE : GALLERY_CHUNK_SIZE,
);

const chunkCount = computed(() => {
  const total = poolMeta.value?.post_ids?.length || 0;
  if (!total) return 1;
  return Math.max(1, Math.ceil(total / chunkSize.value));
});

const chunk = computed(() => {
  const raw = Number(route.query.chunk) || 1;
  return Math.min(Math.max(1, raw), chunkCount.value);
});

const {
  visiblePosts: posts,
  clearPosts,
  replacePosts,
  fullscreenPost,
  detailsPost,
  loading: managerLoading,
  openPostDetails,
  openFullscreenPost,
  openNextFullscreenPost,
  openPreviousFullscreenPost,
  setPostFavorite,
  setPostVote,
  hasPreviousFullscreenPost,
  hasNextFullscreenPost,
} = usePostListManager({
  getSavedPageNumber() {
    return chunk.value;
  },
  savePageNumber() {
    // Chunk is owned by ?chunk=; do not write ?page=.
  },
  async loadPosts() {
    return [];
  },
});

const loading = computed(() => chunkLoading.value || managerLoading.value);

const onOpenDetails = (payload: any) => openPostDetails(payload);
const onOpenFullscreen = (payload: any) => openFullscreenPost(payload);
const onSetFavorite = (payload: any) => setPostFavorite(payload);
const onSetVote = (payload: any) => setPostVote(payload);

const sequenceLabel = computed(() => {
  const post = fullscreenPost.value;
  const meta = poolMeta.value;
  if (!post || !meta?.post_ids?.length) return null;
  const index = meta.post_ids.indexOf(post.id);
  if (index < 0) return null;
  const total = meta.post_count || meta.post_ids.length;
  return `${index + 1} / ${total}`;
});

const setChunk = (next: number) => {
  const clamped = Math.min(Math.max(1, next), chunkCount.value);
  if (clamped <= 1) {
    void removeRouterQuery(["chunk"]);
  } else {
    void updateRouterQuery({ chunk: String(clamped) });
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const fetchChunk = async () => {
  const ids = poolMeta.value?.post_ids || [];
  if (!ids.length) {
    replacePosts([]);
    return;
  }
  const size = chunkSize.value;
  const start = (chunk.value - 1) * size;
  const slice = ids.slice(start, start + size);
  if (!slice.length) {
    replacePosts([]);
    return;
  }

  chunkLoading.value = true;
  try {
    if (
      chunk.value <= 1 &&
      !siteMode.isFurbooru &&
      !siteMode.isInkbunny &&
      !siteMode.isFurAffinity &&
      !siteMode.isTailspace
    ) {
      const built = buildTagQuery(
        toRaw(blacklist.mode),
        toRaw(blacklist.tags),
        [`id:${slice.join(",")}`],
      );
      if (built.truncated) {
        snackbar.addMessage(tagQueryTruncationMessage(built.total, built.limit));
      }
    }

    const service = await getApiService();
    const { posts: fetched } = await service.getPosts(
      toRaw({
        limit: slice.length,
        page: 1,
        tags: [`id:${slice.join(",")}`],
        blacklist: toRaw(blacklist.tags),
        blacklistMode: toRaw(blacklist.mode),
        auth: toRaw(account.auth),
        baseUrl: toRaw(urlStore.e621Url),
        mode: toRaw(siteMode.activeMode),
      }),
    );
    const byId = new Map<number, EnhancedPost>(
      fetched.map((post) => [post.id, post]),
    );
    const ordered = slice
      .map((id) => byId.get(id))
      .filter((post): post is EnhancedPost => !!post)
      .map((post) => ({
        ...post,
        __meta: {
          ...post.__meta,
          pageNumber: chunk.value,
        },
      }));
    replacePosts(ordered);
  } catch (err: any) {
    snackbar.addMessage(err?.message || String(err));
    replacePosts([]);
  } finally {
    chunkLoading.value = false;
  }
};

const onViewModeChange = (mode: PoolViewMode) => {
  if (viewMode.value === mode) return;
  viewMode.value = mode;
  // Keep absolute position roughly stable when chunk size changes.
  const firstId = posts.value[0]?.id;
  if (firstId && poolMeta.value?.post_ids) {
    const index = poolMeta.value.post_ids.indexOf(firstId);
    if (index >= 0) {
      const nextChunk = Math.floor(index / chunkSize.value) + 1;
      if (nextChunk !== chunk.value) {
        setChunk(nextChunk);
        return;
      }
    }
  }
  void fetchChunk();
};

const onPoolLoaded = (pool: Pool) => {
  poolError.value = null;
  poolMeta.value = pool;
  clearPosts();
  if (pool.post_ids?.length) {
    void fetchChunk();
  }
};

const onPoolError = (message: string) => {
  poolError.value = message;
  poolMeta.value = null;
  clearPosts();
};

watch(poolId, () => {
  poolMeta.value = null;
  poolError.value = null;
  clearPosts();
});

watch(chunk, (next, prev) => {
  if (!poolMeta.value?.post_ids?.length) return;
  if (next === prev) return;
  void fetchChunk();
});
</script>

<style scoped>
.pool-sequence-caption {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2400;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  pointer-events: none;
}
</style>
