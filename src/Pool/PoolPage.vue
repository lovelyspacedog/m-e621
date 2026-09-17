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
        :focus-post-id="pendingScrollPostId"
        @open-post="onOpenPostFromReader"
        @change-chunk="setChunk"
        @view-mode-change="onViewModeChange"
        @focus-applied="onFocusApplied"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from "vue";
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
  chunkForIndex,
  GALLERY_CHUNK_SIZE,
  loadPoolResumePost,
  parsePositiveIntQuery,
  savePoolResumePost,
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
/** When true, chunk URL changed because the post list advanced — skip replace fetch. */
const syncingChunkFromList = ref(false);
/** Scroll mode: PoolReader scrolls this id into view once loaded. */
const pendingScrollPostId = ref(0);
/** Avoid re-applying the same deep-link focus after the user navigates away. */
const appliedFocusKey = ref("");

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

const queryPostId = computed(() => parsePositiveIntQuery(route.query.post));

const resumeOrigin = computed(() => String(siteMode.activeMode));

const rememberPost = (postId: number) => {
  if (!poolId.value || !postId) return;
  savePoolResumePost(resumeOrigin.value, poolId.value, postId);
};

const syncPostQuery = async (postId: number) => {
  if (!postId) {
    if (route.query.post != null) await removeRouterQuery(["post"]);
    return;
  }
  if (queryPostId.value === postId) return;
  await updateRouterQuery({ post: String(postId) });
};

const fetchChunkPosts = async (pageNumber: number): Promise<EnhancedPost[]> => {
  const ids = poolMeta.value?.post_ids || [];
  if (!ids.length) return [];
  const size = chunkSize.value;
  const start = (pageNumber - 1) * size;
  const slice = ids.slice(start, start + size);
  if (!slice.length) return [];

  if (
    pageNumber <= 1 &&
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
  return slice
    .map((id) => byId.get(id))
    .filter((post): post is EnhancedPost => !!post)
    .map((post) => ({
      ...post,
      __meta: {
        ...post.__meta,
        pageNumber,
      },
    }));
};

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
  savePageNumber(id) {
    // Keep ?chunk= in sync when fullscreen advance loads adjacent chunks.
    if (id == null || id === chunk.value) return;
    const clamped = Math.min(Math.max(1, id), chunkCount.value);
    syncingChunkFromList.value = true;
    void (async () => {
      try {
        if (clamped <= 1) await removeRouterQuery(["chunk"]);
        else await updateRouterQuery({ chunk: String(clamped) });
      } finally {
        await nextTick();
        syncingChunkFromList.value = false;
      }
    })();
  },
  async loadPosts(page) {
    try {
      chunkLoading.value = true;
      return await fetchChunkPosts(page);
    } catch (err: any) {
      snackbar.addMessage(err?.message || String(err));
      return [];
    } finally {
      chunkLoading.value = false;
    }
  },
});

const loading = computed(() => chunkLoading.value || managerLoading.value);

const onOpenDetails = (payload: any) => openPostDetails(payload);
const onOpenFullscreen = (payload: any) => openFullscreenPost(payload);
const onSetFavorite = (payload: any) => setPostFavorite(payload);
const onSetVote = (payload: any) => setPostVote(payload);

const onOpenPostFromReader = (postId: number) => {
  rememberPost(postId);
  void syncPostQuery(postId);
  openFullscreenPost(postId);
};

const onFocusApplied = () => {
  pendingScrollPostId.value = 0;
};

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
  chunkLoading.value = true;
  try {
    const ordered = await fetchChunkPosts(chunk.value);
    replacePosts(ordered);
  } catch (err: any) {
    snackbar.addMessage(err?.message || String(err));
    replacePosts([]);
  } finally {
    chunkLoading.value = false;
  }
};

const resolveFocusPostId = (ids: number[]): { postId: number; fromQuery: boolean } => {
  const fromQuery = queryPostId.value;
  if (fromQuery && ids.includes(fromQuery)) return { postId: fromQuery, fromQuery: true };
  // Resume only when the URL does not already pin a chunk or post.
  if (route.query.post != null || route.query.chunk != null) {
    return { postId: 0, fromQuery: false };
  }
  const resumed = loadPoolResumePost(resumeOrigin.value, poolId.value);
  if (resumed && ids.includes(resumed)) return { postId: resumed, fromQuery: false };
  return { postId: 0, fromQuery: false };
};

const applyFocus = async (
  postId: number,
  opts: { openFullscreen?: boolean; writeQuery?: boolean; scroll?: boolean },
) => {
  if (!postId || !poolMeta.value?.post_ids?.length) return;
  const ids = poolMeta.value.post_ids;
  const index = ids.indexOf(postId);
  if (index < 0) return;

  const key = `${poolId.value}:${postId}:${viewMode.value}:${opts.openFullscreen ? 1 : 0}`;
  if (appliedFocusKey.value === key) return;

  const targetChunk = chunkForIndex(index, chunkSize.value);
  if (targetChunk !== chunk.value) {
    syncingChunkFromList.value = true;
    try {
      if (targetChunk <= 1) await removeRouterQuery(["chunk"]);
      else await updateRouterQuery({ chunk: String(targetChunk) });
      await fetchChunk();
    } finally {
      await nextTick();
      syncingChunkFromList.value = false;
    }
  } else if (!posts.value.some((p) => p.id === postId)) {
    await fetchChunk();
  }

  rememberPost(postId);
  if (opts.writeQuery) await syncPostQuery(postId);
  appliedFocusKey.value = key;

  if (opts.scroll || viewMode.value === "scroll") {
    pendingScrollPostId.value = postId;
  }
  if (opts.openFullscreen) {
    openFullscreenPost(postId);
  }
};

const bootstrapPool = async (pool: Pool) => {
  clearPosts();
  if (!pool.post_ids?.length) return;

  const { postId: focusId, fromQuery } = resolveFocusPostId(pool.post_ids);
  if (focusId) {
    const index = pool.post_ids.indexOf(focusId);
    const targetChunk = chunkForIndex(index, chunkSize.value);
    if (targetChunk !== chunk.value) {
      syncingChunkFromList.value = true;
      try {
        if (targetChunk <= 1) await removeRouterQuery(["chunk"]);
        else await updateRouterQuery({ chunk: String(targetChunk) });
      } finally {
        await nextTick();
        syncingChunkFromList.value = false;
      }
    }
    await fetchChunk();
    await applyFocus(focusId, {
      openFullscreen: fromQuery && viewMode.value === "gallery",
      writeQuery: fromQuery,
      scroll: viewMode.value === "scroll",
    });
    return;
  }

  await fetchChunk();
};

const onViewModeChange = async (mode: PoolViewMode) => {
  if (viewMode.value === mode) return;
  viewMode.value = mode;
  const anchorId =
    fullscreenPost.value?.id ||
    queryPostId.value ||
    posts.value[0]?.id ||
    0;
  if (anchorId && poolMeta.value?.post_ids) {
    const index = poolMeta.value.post_ids.indexOf(anchorId);
    if (index >= 0) {
      const nextChunk = chunkForIndex(index, chunkSize.value);
      if (nextChunk !== chunk.value) {
        setChunk(nextChunk);
        await nextTick();
        await fetchChunk();
        if (mode === "scroll") pendingScrollPostId.value = anchorId;
        return;
      }
    }
  }
  await fetchChunk();
  if (mode === "scroll" && anchorId) pendingScrollPostId.value = anchorId;
};

const onPoolLoaded = (pool: Pool) => {
  poolError.value = null;
  poolMeta.value = pool;
  appliedFocusKey.value = "";
  void bootstrapPool(pool);
};

const onPoolError = (message: string) => {
  poolError.value = message;
  poolMeta.value = null;
  clearPosts();
};

const onWindowKey = (e: KeyboardEvent) => {
  if (fullscreenPost.value || detailsPost.value || flufflePost.value) return;
  if (!poolMeta.value?.post_ids?.length) return;
  const target = e.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  ) {
    return;
  }
  if (e.key === "ArrowLeft" || e.key === "[") {
    if (chunk.value <= 1) return;
    e.preventDefault();
    setChunk(chunk.value - 1);
  } else if (e.key === "ArrowRight" || e.key === "]") {
    if (chunk.value >= chunkCount.value) return;
    e.preventDefault();
    setChunk(chunk.value + 1);
  }
};

onMounted(() => window.addEventListener("keydown", onWindowKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onWindowKey));

watch(poolId, () => {
  poolMeta.value = null;
  poolError.value = null;
  pendingScrollPostId.value = 0;
  appliedFocusKey.value = "";
  clearPosts();
});

watch(chunk, (next, prev) => {
  if (!poolMeta.value?.post_ids?.length) return;
  if (next === prev) return;
  if (syncingChunkFromList.value) {
    // List already holds the adjacent chunk from loadPosts; do not replacePosts.
    syncingChunkFromList.value = false;
    return;
  }
  void fetchChunk();
});

watch(fullscreenPost, (post) => {
  if (!post) return;
  rememberPost(post.id);
  void syncPostQuery(post.id);
});

watch(queryPostId, (postId, prev) => {
  if (!poolMeta.value?.post_ids?.length) return;
  if (!postId || postId === prev) return;
  if (fullscreenPost.value?.id === postId) return;
  void applyFocus(postId, {
    openFullscreen: viewMode.value === "gallery",
    writeQuery: true,
    scroll: viewMode.value === "scroll",
  });
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
