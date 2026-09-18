<template>
  <div>
    <div class="pa-4">
      <PoolInfo
        :pool-id="poolId"
        :origin-mode="poolOrigin"
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
        :chunk-ids="chunkIds"
        :focus-post-id="pendingScrollPostId"
        :saving-chunk="savingChunk"
        :saving-all="savingAll"
        @open-post="onOpenPostFromReader"
        @change-chunk="setChunk"
        @view-mode-change="onViewModeChange"
        @focus-applied="onFocusApplied"
        @save-chunk="saveChunkLocally"
        @save-all="saveAllLocally"
      />
      <fullscreen-dialog
        :has-previous-fullscreen-post="hasPreviousFullscreenPost"
        :has-next-fullscreen-post="hasNextFullscreenPost"
        :current="fullscreenPost || null"
        @close="
          () => {
            console.warn('[pf-fs] PoolPage @close', new Error().stack);
            fullscreenPost = null;
          }
        "
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
  useBlacklistStore,
  useSiteModeStore,
  useSnackbarStore,
} from "@/services";
import { useMainStore } from "@/services/state";
import { getApiService } from "@/worker/services";
import {
  buildTagQuery,
  tagQueryTruncationMessage,
} from "@/misc/util/createTagQuery";
import type { Pool } from "@/worker/api";
import type { EnhancedPost } from "@/worker/ApiService";
import {
  chunkForIndex,
  comicChunkKeyDelta,
  GALLERY_CHUNK_SIZE,
  isComicTypingTarget,
  loadPoolResumePost,
  parsePositiveIntQuery,
  savePoolResumePost,
  SCROLL_CHUNK_SIZE,
} from "@/misc/util/comicReader";
import {
  poolChildForOrigin,
  resolvePoolOrigin,
} from "@/misc/util/poolOrigin";
import type { PoolOriginMode } from "@/services/types";
import { savePostsLocally } from "@/misc/util/saveLocal";

const route = useRoute();
const main = useMainStore();
const blacklist = useBlacklistStore();
const siteMode = useSiteModeStore();
const snackbar = useSnackbarStore();
const { removeRouterQuery, updateRouterQuery } = useRouterQueryHelpers();

const poolId = computed(() => Number(route.params.id) || 0);
const poolOrigin = computed((): PoolOriginMode | null =>
  resolvePoolOrigin(route.query.origin, siteMode.activeMode),
);
const poolChild = computed(() =>
  poolOrigin.value ? poolChildForOrigin(main.$state, poolOrigin.value) : null,
);
const poolMeta = ref<Pool | null>(null);
const poolError = ref<string | null>(null);
const viewMode = ref<PoolViewMode>("gallery");
const chunkLoading = ref(false);
const flufflePost = ref<EnhancedPost | null>(null);
const savingChunk = ref(false);
const savingAll = ref(false);
/** When true, chunk URL changed because the post list advanced — skip replace fetch. */
const syncingChunkFromList = ref(false);
/** When true, ?post= changed from fullscreen nav — skip applyFocus echo. */
const syncingPostFromFullscreen = ref(false);
/** Dedupe pool id:tag truncation snackbar once per pool. */
const lastPoolTruncationKey = ref("");
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

const chunkIds = computed(() => {
  const ids = poolMeta.value?.post_ids || [];
  if (!ids.length) return [] as number[];
  const size = chunkSize.value;
  const start = (chunk.value - 1) * size;
  return ids.slice(start, start + size);
});

const queryPostId = computed(() => parsePositiveIntQuery(route.query.post));

const resumeOrigin = computed(() => poolOrigin.value || String(siteMode.activeMode));

const rememberPost = (postId: number) => {
  if (!poolId.value || !postId || !poolOrigin.value) return;
  savePoolResumePost(resumeOrigin.value, poolId.value, postId);
};

const syncPostQuery = async (postId: number) => {
  if (!postId) {
    if (route.query.post != null) await removeRouterQuery(["post"]);
    return;
  }
  if (queryPostId.value === postId) return;
  // Mark before await so queryPostId watch sees the flag when the route settles.
  syncingPostFromFullscreen.value = true;
  try {
    await updateRouterQuery({ post: String(postId) });
  } finally {
    await nextTick();
    syncingPostFromFullscreen.value = false;
  }
};

const fetchChunkPosts = async (pageNumber: number): Promise<EnhancedPost[]> => {
  const ids = poolMeta.value?.post_ids || [];
  if (!ids.length) return [];
  const child = poolChild.value;
  const origin = poolOrigin.value;
  if (!child || !origin) {
    throw new Error(
      siteMode.isUnified
        ? "Pool origin required — open from Federated Pools browse"
        : "Pools are not available in this site mode",
    );
  }
  const size = chunkSize.value;
  const start = (pageNumber - 1) * size;
  const slice = ids.slice(start, start + size);
  if (!slice.length) return [];

  const built = buildTagQuery(
    toRaw(blacklist.mode),
    toRaw(blacklist.tags),
    [`id:${slice.join(",")}`],
  );
  if (built.truncated) {
    const key = `${origin}:${poolId.value}:${built.total}`;
    if (key !== lastPoolTruncationKey.value) {
      lastPoolTruncationKey.value = key;
      snackbar.addMessage(tagQueryTruncationMessage(built.total, built.limit));
    }
  }

  const service = await getApiService();
  const { posts: fetched } = await service.getPosts(
    toRaw({
      limit: slice.length,
      page: 1,
      tags: [`id:${slice.join(",")}`],
      blacklist: child.blacklist,
      blacklistMode: toRaw(blacklist.mode),
      auth: child.auth,
      baseUrl: child.baseUrl,
      mode: origin,
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
        originMode: origin,
        originBaseUrl: child.baseUrl,
      },
    }));
};

const {
  posts,
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
  allowBlacklistedFullscreen: true,
  getSavedPageNumber() {
    return chunk.value;
  },
  savePageNumber(id) {
    // Prefer the fullscreen post's chunk — posts[0] stays on the first loaded
    // chunk after loadNextPage appends, which left ?chunk= stale on advance.
    let chunkId = id;
    const anchorId = fullscreenPost.value?.id;
    if (anchorId && poolMeta.value?.post_ids?.length) {
      const index = poolMeta.value.post_ids.indexOf(anchorId);
      if (index >= 0) {
        chunkId = chunkForIndex(index, chunkSize.value);
      }
    }
    if (chunkId == null || chunkId === chunk.value) return;
    const clamped = Math.min(Math.max(1, chunkId), chunkCount.value);
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
    } catch (err: unknown) {
      snackbar.addMessage(err instanceof Error ? err.message : String(err));
      return [];
    } finally {
      chunkLoading.value = false;
    }
  },
});

const loading = computed(() => chunkLoading.value || managerLoading.value);

const onOpenDetails = (payload: unknown) =>
  openPostDetails(payload as number | { postId: number; originMode?: string });
const onOpenFullscreen = (payload: unknown) =>
  openFullscreenPost(payload as number | { postId: number; originMode?: string });
const onSetFavorite = (payload: unknown) =>
  setPostFavorite(
    payload as { postId: number; favorited: boolean; originMode?: string },
  );
const onSetVote = (payload: unknown) =>
  setPostVote(
    payload as { postId: number; score: 0 | 1 | -1; originMode?: string },
  );

const onOpenPostFromReader = (postId: number) => {
  rememberPost(postId);
  void syncPostQuery(postId);
  openFullscreenPost(postId);
};

const onFocusApplied = () => {
  pendingScrollPostId.value = 0;
};

const saveChunkLocally = async () => {
  if (savingChunk.value || savingAll.value) return;
  const eligible = posts.value.filter(
    (post) =>
      chunkIds.value.includes(post.id) &&
      !!post.file?.url &&
      !post.__meta?.isBlacklisted,
  );
  savingChunk.value = true;
  try {
    await savePostsLocally(eligible, { concurrency: 2 });
  } finally {
    savingChunk.value = false;
  }
};

const saveAllLocally = async () => {
  if (savingChunk.value || savingAll.value) return;
  const ids = poolMeta.value?.post_ids || [];
  if (!ids.length) {
    snackbar.addMessage("Nothing to save");
    return;
  }
  const totalChunks = Math.max(1, Math.ceil(ids.length / chunkSize.value));
  if (
    totalChunks > 3 &&
    !window.confirm(
      `Save all ${ids.length} pages from this pool locally? This may take a while.`,
    )
  ) {
    return;
  }
  savingAll.value = true;
  let saved = 0;
  let failed = 0;
  let skipped = 0;
  let unavailable = 0;
  try {
    for (let pageNumber = 1; pageNumber <= totalChunks; pageNumber++) {
      const size = chunkSize.value;
      const start = (pageNumber - 1) * size;
      const sliceLen = ids.slice(start, start + size).length;
      const batch = await fetchChunkPosts(pageNumber);
      unavailable += Math.max(0, sliceLen - batch.length);
      const result = await savePostsLocally(batch, {
        concurrency: 2,
        quietFinal: true,
      });
      saved += result.saved;
      failed += result.failed;
      skipped += result.skipped;
      snackbar.addMessage(
        `Saving pool ${pageNumber}/${totalChunks}… (${saved} saved)`,
      );
    }
    const extras: string[] = [];
    if (failed) extras.push(`${failed} failed`);
    if (skipped) extras.push(`${skipped} skipped`);
    if (unavailable) extras.push(`${unavailable} unavailable`);
    const summary = extras.length
      ? `Saved ${saved} pages locally (${extras.join(", ")})`
      : `Saved ${saved} pages locally`;
    snackbar.addMessage(summary);
  } catch (err: unknown) {
    snackbar.addMessage(err instanceof Error ? err.message : String(err));
  } finally {
    savingAll.value = false;
  }
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
  // Chunk buttons leave a stale ?post= that no longer matches the visible slice.
  void removeRouterQuery(["post"]);
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
  } catch (err: unknown) {
    snackbar.addMessage(err instanceof Error ? err.message : String(err));
    replacePosts([]);
  } finally {
    chunkLoading.value = false;
  }
};

const resolveFocusPostId = (ids: number[]): { postId: number; fromQuery: boolean } => {
  const fromQuery = queryPostId.value;
  if (fromQuery && ids.includes(fromQuery)) return { postId: fromQuery, fromQuery: true };
  // Resume when the URL does not pin a post (?chunk= alone should not block resume).
  if (route.query.post != null) {
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
  if (isComicTypingTarget(e.target)) return;
  const delta = comicChunkKeyDelta(e.key);
  if (!delta) return;
  const next = chunk.value + delta;
  if (next < 1 || next > chunkCount.value) return;
  e.preventDefault();
  setChunk(next);
};

onMounted(() => window.addEventListener("keydown", onWindowKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onWindowKey));

watch(poolId, () => {
  poolMeta.value = null;
  poolError.value = null;
  pendingScrollPostId.value = 0;
  appliedFocusKey.value = "";
  lastPoolTruncationKey.value = "";
  clearPosts();
});

watch(poolOrigin, (next, prev) => {
  if (next === prev) return;
  poolMeta.value = null;
  poolError.value = null;
  pendingScrollPostId.value = 0;
  appliedFocusKey.value = "";
  lastPoolTruncationKey.value = "";
  clearPosts();
});

watch(chunk, (next, prev) => {
  if (!poolMeta.value?.post_ids?.length) return;
  if (next === prev) return;
  if (syncingChunkFromList.value) {
    // List already holds / is loading the adjacent chunk — do not replacePosts.
    // Leave the flag for the owner to clear after URL settle (clearing here
    // raced with backward loadPreviousPage and could drop a second sync).
    return;
  }
  void fetchChunk();
});

watch(fullscreenPost, (post) => {
  if (!post) return;
  rememberPost(post.id);
  void syncPostQuery(post.id);
  // Keep ?chunk= aligned with the fullscreen post across chunk boundaries.
  if (!poolMeta.value?.post_ids?.length) return;
  const index = poolMeta.value.post_ids.indexOf(post.id);
  if (index < 0) return;
  const nextChunk = chunkForIndex(index, chunkSize.value);
  if (nextChunk === chunk.value) return;
  syncingChunkFromList.value = true;
  void (async () => {
    try {
      if (nextChunk <= 1) await removeRouterQuery(["chunk"]);
      else await updateRouterQuery({ chunk: String(nextChunk) });
    } finally {
      await nextTick();
      syncingChunkFromList.value = false;
    }
  })();
});

watch(queryPostId, (postId, prev) => {
  if (!poolMeta.value?.post_ids?.length) return;
  if (!postId || postId === prev) return;
  // Fullscreen next/prev already moved the post; URL sync must not re-run
  // applyFocus → fetchChunk → replacePosts (dialog close + gallery reload).
  if (syncingPostFromFullscreen.value) return;
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
