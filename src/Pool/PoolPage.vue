<template>
  <div>
    <div class="pa-4">
      <PoolInfo :pool-id="poolId" :show-browse="false" />
    </div>
    <posts
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, toRaw, watch } from "vue";
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

const route = useRoute();
const account = useAccountStore();
const blacklist = useBlacklistStore();
const postsStore = usePostsStore();
const urlStore = useUrlStore();
const siteMode = useSiteModeStore();
const snackbar = useSnackbarStore();
const { removeRouterQuery, updateRouterQuery } = useRouterQueryHelpers();

const poolId = computed(() => Number(route.params.id) || 0);

useHead({
  title: computed(() => (poolId.value ? `Pool ${poolId.value}` : "Pool")),
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
        [`pool:${poolId.value}`],
      );
      if (built.truncated) {
        snackbar.addMessage(tagQueryTruncationMessage(built.total, built.limit));
      }
    }
    const service = await getApiService();
    const { posts } = await service.getPosts(
      toRaw({
        limit: toRaw(postsStore.postListFetchLimit),
        page,
        tags: [`pool:${poolId.value}`],
        blacklist: toRaw(blacklist.tags),
        blacklistMode: toRaw(blacklist.mode),
        auth: toRaw(account.auth),
        baseUrl: toRaw(urlStore.e621Url),
        mode: toRaw(siteMode.activeMode),
      }),
    );
    return posts;
  },
});

const reload = () => {
  clearPosts();
  void loadNextPage();
};

onMounted(reload);
watch(poolId, reload);
</script>
