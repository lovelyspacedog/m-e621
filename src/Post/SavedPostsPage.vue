<template>
  <div>
    <portal to="toolbar">
      <div class="saved-toolbar">
        <div class="text-subtitle-1 font-weight-medium">Saved posts</div>
        <v-spacer />
        <v-btn
          size="small"
          variant="text"
          :loading="loading"
          :disabled="loading"
          title="Refresh"
          @click="reload"
        >
          <v-icon start>mdi-refresh</v-icon>
          Refresh
        </v-btn>
      </div>
    </portal>

    <portal to="sidebar-suggestions">
      <feed-layout-menu />
    </portal>

    <v-container v-if="!loading && !posts.length" class="text-center py-12">
      <v-icon size="64" class="mb-4" color="medium-emphasis">mdi-bookmark-outline</v-icon>
      <div class="text-h6 mb-2">No saved posts</div>
      <div class="text-body-2 text-medium-emphasis mb-4">
        Bookmark posts from any supported site to see them here.
      </div>
      <v-btn color="accent" variant="tonal" :to="{ name: 'Posts' }">Go to Posts</v-btn>
    </v-container>

    <posts
      v-else
      :posts="posts"
      :loading="loading"
      :fullscreen-post="fullscreenPost || undefined"
      :details-post="detailsPost || undefined"
      :has-previous="false"
      :has-previous-fullscreen-post="hasPreviousFullscreenPost"
      :has-next-fullscreen-post="hasNextFullscreenPost"
      :show-pagination="false"
      page-title="Saved posts"
      @load-next="noop"
      @load-previous="noop"
      @open-post="openFullscreenPost"
      @open-post-details="openPostDetails"
      @exit-fullscreen="exitFullscreen"
      @close-details="closeDetails"
      @next-fullscreen-post="openNextFullscreenPost"
      @previous-fullscreen-post="openPreviousFullscreenPost"
      @set-post-favorite="setPostFavorite"
      @set-post-vote="setPostVote"
    />

    <TipDialog
      :tip-id="TIP_IDS.savedPosts"
      title="Saved posts"
      v-model="savedPostsTipOpen"
    >
      <p class="mb-0">
        Saved posts are bookmarks kept across site modes — separate from each
        site’s own favorites. Bookmark from any federated child; this list uses
        the same Layout controls as Posts.
      </p>
    </TipDialog>
  </div>
</template>

<script setup lang="ts">
import FeedLayoutMenu from "@/Post/FeedLayoutMenu.vue";
import Posts from "@/Post/Posts.vue";
import { usePostListManager } from "@/Post/postListManager";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import {
  buildUnifiedFetchArgs,
  modeSupportsSavedPosts,
} from "@/misc/util/postOrigin";
import {
  useMainStore,
  useSavedPostsStore,
  useSiteModeStore,
  useSnackbarStore,
} from "@/services";
import { getApiService } from "@/worker/services";
import { onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useHead } from "@unhead/vue";

useHead({ title: "Saved posts" });

const router = useRouter();
const siteMode = useSiteModeStore();
const savedPosts = useSavedPostsStore();
const snackbar = useSnackbarStore();
const main = useMainStore();
const { open: savedPostsTipOpen, tryOpen: trySavedPostsTip } = useTipOpen(
  TIP_IDS.savedPosts,
);
onMounted(() => trySavedPostsTip());

const noop = () => {
  /* Saved list is not paginated */
};

const {
  visiblePosts: posts,
  clearPosts,
  replacePosts,
  fullscreenPost,
  detailsPost,
  loading,
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
    return 0;
  },
  savePageNumber() {
    /* no page query for saved */
  },
  async loadPosts() {
    return [];
  },
});

const exitFullscreen = () => {
  fullscreenPost.value = null;
};
const closeDetails = () => {
  detailsPost.value = null;
};

const reload = async () => {
  if (!siteMode.supportsSavedPosts) return;
  clearPosts();
  loading.value = true;
  try {
    // Plain clones only — Pinia Proxies in entries break Comlink postMessage.
    const entries = savedPosts.entries.map((e) => ({
      originMode: e.originMode,
      id: e.id,
      savedAt: e.savedAt,
    }));
    if (!entries.length) {
      replacePosts([]);
      return;
    }
    const service = await getApiService();
    const unified = buildUnifiedFetchArgs(main.$state, { includeDisabled: true });
    const result = await service.getPostsByIds({
      entries,
      children: unified.children,
      sharedBlacklist: unified.sharedBlacklist,
    });
    for (const warning of result.warnings || []) {
      snackbar.addMessage(warning);
    }
    replacePosts(result.posts);
  } catch (error: any) {
    snackbar.addMessage(error?.message || String(error));
    replacePosts([]);
  } finally {
    loading.value = false;
  }
};

const ensureSavedPostsMode = () => {
  if (!modeSupportsSavedPosts(siteMode.activeMode)) {
    router.replace({ name: "Posts" });
    return false;
  }
  return true;
};

onMounted(() => {
  if (!ensureSavedPostsMode()) return;
  reload();
});

watch(
  () => siteMode.activeMode,
  () => {
    if (!ensureSavedPostsMode()) return;
  },
);

watch(
  () => savedPosts.count,
  () => {
    if (!siteMode.supportsSavedPosts) return;
    void reload();
  },
);
</script>

<style scoped>
.saved-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
</style>
