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
    <posts
      v-else-if="poolMeta"
      :posts="posts"
      :loading="loading"
      :has-previous="hasPrevious"
      @load-previous="loadPreviousPage()"
      @load-next="loadNextPage()"
      @open-post="openFullscreenPost"
      :fullscreen-post="fullscreenPost || undefined"
      @exit-fullscreen="fullscreenPost = null"
      @next-fullscreen-post="openNextFullscreenPost()"
      @previous-fullscreen-post="openPreviousFullscreenPost()"
      :has-previous-fullscreen-post="hasPreviousFullscreenPost"
      :has-next-fullscreen-post="hasNextFullscreenPost"
      :details-post="detailsPost || undefined"
      @open-post-details="openPostDetails"
      @close-details="detailsPost = null"
      @set-post-favorite="setPostFavorite($event)"
      @set-post-vote="setPostVote($event)"
    />
    <div
      v-if="sequenceLabel"
      class="pool-sequence-caption text-caption"
    >
      {{ sequenceLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRaw, watch } from "vue";
import { useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import PoolInfo from "@/Pool/PoolInfo.vue";
import Posts from "@/Post/Posts.vue";
import { usePostListManager } from "@/Post/postListManager";
import { useRouterQueryHelpers } from "@/misc/util/utilities";
import {
  useAccountStore,
  useBlacklistStore,
  usePostsStore,
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

const route = useRoute();
const account = useAccountStore();
const blacklist = useBlacklistStore();
const postsStore = usePostsStore();
const urlStore = useUrlStore();
const siteMode = useSiteModeStore();
const snackbar = useSnackbarStore();
const { removeRouterQuery, updateRouterQuery } = useRouterQueryHelpers();

const poolId = computed(() => Number(route.params.id) || 0);
const poolMeta = ref<Pool | null>(null);
const poolError = ref<string | null>(null);

const displayPoolName = computed(() =>
  (poolMeta.value?.name || "").replace(/_/g, " "),
);

useHead({
  title: computed(() => {
    if (displayPoolName.value) return displayPoolName.value;
    return poolId.value ? `Pool ${poolId.value}` : "Pool";
  }),
});

const {
  loadPreviousPage,
  loadNextPage,
  visiblePosts: posts,
  clearPosts,
  fullscreenPost,
  detailsPost,
  loading,
  openPostDetails,
  openFullscreenPost,
  openNextFullscreenPost,
  openPreviousFullscreenPost,
  setPostFavorite,
  setPostVote,
  hasPrevious,
  hasPreviousFullscreenPost,
  hasNextFullscreenPost,
} = usePostListManager({
  getSavedPageNumber() {
    return Number(route.query.page) || 0;
  },
  savePageNumber(page) {
    if (page === 1 || !page) {
      removeRouterQuery(["page"]);
    } else {
      updateRouterQuery({
        page: String(page),
      });
    }
  },
  async loadPosts(page) {
    const ids = poolMeta.value?.post_ids || [];
    const limit = toRaw(postsStore.postListFetchLimit) || 40;
    const start = (page - 1) * limit;
    const slice = ids.slice(start, start + limit);
    if (!slice.length) return [];

    if (
      page <= 1 &&
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
    // API page is always 1 for id: batches; stamp the pool page onto __meta
    // so postListManager pagination (lastPageNumber + 1) keeps working.
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
          pageNumber: page,
        },
      }));
  },
});

const sequenceLabel = computed(() => {
  const post = fullscreenPost.value;
  const meta = poolMeta.value;
  if (!post || !meta?.post_ids?.length) return null;
  const index = meta.post_ids.indexOf(post.id);
  if (index < 0) return null;
  const total = meta.post_count || meta.post_ids.length;
  return `${index + 1} / ${total}`;
});

const onPoolLoaded = (pool: Pool) => {
  poolError.value = null;
  poolMeta.value = pool;
  clearPosts();
  if (pool.post_ids?.length) {
    void loadNextPage();
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
