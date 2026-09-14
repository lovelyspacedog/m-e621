import type { EnhancedPost } from "@/worker/ApiService";
import { getApiService } from "@/worker/services";
import { computed, ref, watch } from "vue";
import { useAccountStore, useSnackbarStore, useUrlStore, useBlacklistStore, usePostsStore, useSiteModeStore } from "@/services";
import { BlacklistMode } from "@/services/types";
import { useRouter } from "vue-router";
import { setLocalFavorite } from "@/misc/util/localMedia";

interface IUsePostListManagerArgs {
  loadPosts(page: number, direction: "next" | "previous"): Promise<EnhancedPost[]>;

  getSavedPageNumber(): number;
  savePageNumber(id: number | null): void;
}

export const usePostListManager = ({
  loadPosts,
  getSavedPageNumber,
  savePageNumber,
}: IUsePostListManagerArgs) => {
  const snackbar = useSnackbarStore();
  const posts = ref<EnhancedPost[]>([]);
  const fullscreenPost = ref<EnhancedPost | null>(null);
  const detailsPost = ref<EnhancedPost | null>(null);
  const loading = ref(false);
  const reachedEnd = ref(false);
  // Bumped by clearPosts() so in-flight page fetches are discarded after a
  // search/pool change, instead of being applied to the new query.
  const generation = ref(0);
  const urlStore = useUrlStore();
  const blacklistStore = useBlacklistStore();
  const postsStore = usePostsStore();
  const siteMode = useSiteModeStore();
  const router = useRouter()

  const handleError = (error: any) => {
    const errorMessage = error?.message || String(error);
    snackbar.addMessage(errorMessage);
    console.log(error);
  };

  const enrichInkbunny = async (post: EnhancedPost) => {
    if (!siteMode.isInkbunny) return post;
    if (post.__meta.inkbunny?.detailsLoaded) return post;
    try {
      const account = useAccountStore();
      const service = await getApiService();
      const updated = await service.enrichInkbunnyPost(post, {
        sid: account.apiKey,
      });
      const idx = posts.value.findIndex((p) => p.id === post.id);
      if (idx >= 0) posts.value[idx] = updated;
      if (detailsPost.value?.id === updated.id) detailsPost.value = updated;
      if (fullscreenPost.value?.id === updated.id) fullscreenPost.value = updated;
      return updated;
    } catch (error) {
      handleError(error);
      return post;
    }
  };

  const setPostFavorite = async (args: {
    postId: number;
    favorited: boolean;
  }) => {
    const account = useAccountStore();
    const post = posts.value.find((p) => p.id === args.postId);
    if (!post) {
      return;
    }

    if (siteMode.isLocal) {
      const localPath = post.__meta?.localPath;
      if (!localPath) return;
      try {
        post.__meta.isFavoriteLoading = true;
        await setLocalFavorite(localPath, args.favorited);
        post.is_favorited = args.favorited;
        post.fav_count = args.favorited ? 1 : 0;
        const meta = post.tags.meta || [];
        if (args.favorited) {
          if (!meta.includes("type:favorited")) {
            post.tags.meta = [...meta, "type:favorited"];
          }
        } else {
          post.tags.meta = meta.filter((tag) => tag !== "type:favorited");
        }
      } catch (error: any) {
        handleError(error);
      } finally {
        post.__meta.isFavoriteLoading = false;
      }
      return;
    }

    if (!account.auth) {
      snackbar.addMessage("Not logged in");
      router.push({ name: "AccountSettings" });
      return;
    }
    const service = await getApiService();
    const serviceArgs = {
      postId: post.id,
      auth: account.auth,
      proxyUrl: urlStore.proxyUrl,
      baseUrl: urlStore.e621Url,
    };
    try {
      post.__meta.isFavoriteLoading = true;
      if (args.favorited) {
        await service.favoritePost(serviceArgs);
      } else {
        await service.unfavoritePost(serviceArgs);
      }
      post.is_favorited = args.favorited;
    } catch (error: any) {
      handleError(error);
    } finally {
      post.__meta.isFavoriteLoading = false;
    }
  };

  const setPostVote = async (args: {
    postId: number;
    score: 1 | -1 | 0;
  }) => {
    if (siteMode.isLocal) return;
    const account = useAccountStore();
    const post = posts.value.find((p) => p.id === args.postId);
    if (!post) return;
    if (!account.auth) {
      snackbar.addMessage("Not logged in");
      router.push({ name: "AccountSettings" });
      return;
    }
    const service = await getApiService();
    try {
      post.__meta.isVoteLoading = true;
      const result = await service.votePost({
        postId: post.id,
        score: args.score,
        auth: account.auth,
        proxyUrl: urlStore.proxyUrl,
        baseUrl: urlStore.e621Url,
      });
      if (result && typeof result.score === "number") {
        post.score.total = result.score;
        if (typeof result.up === "number") post.score.up = result.up;
        if (typeof result.down === "number") post.score.down = Math.abs(result.down);
      }
    } catch (error: any) {
      handleError(error);
    } finally {
      post.__meta.isVoteLoading = false;
    }
  };

  const getPostCountToRemove = () => posts.value.length - postsStore.postListFetchLimit;

  const firstPageNumber = computed(() =>
    posts.value.length ? posts.value[0].__meta.pageNumber : getSavedPageNumber(),
  );

  const lastPageNumber = computed(() =>
    posts.value.length
      ? posts.value[posts.value.length - 1].__meta.pageNumber
      : getSavedPageNumber(),
  );

  const loadPreviousPage = async () => {
    if (loading.value) {
      return console.log("loadPreviousPage called, but already loading");
    }
    const thisGen = generation.value;
    try {
      loading.value = true;
      const newPosts = await loadPosts(firstPageNumber.value - 1, "previous");
      if (thisGen !== generation.value) return;
      const postCountToRemove = getPostCountToRemove();
      // newly uploaded posts cause old posts to shift pages, and duplicates are bad
      const newPostsFiltered = newPosts.filter(newP => !posts.value.find(existing => existing.id === newP.id))
      posts.value.unshift(...newPostsFiltered);
      posts.value.splice(
        posts.value.length - postCountToRemove,
        postCountToRemove,
      );
    } catch (error) {
      if (thisGen === generation.value) handleError(error);
    } finally {
      if (thisGen === generation.value) loading.value = false;
    }
  };
  const loadNextPage = async () => {
    if (loading.value) {
      return console.log("loadNextPage called, but already loading");
    }
    const thisGen = generation.value;
    try {
      loading.value = true;
      // When the list is empty, load the saved page directly (not saved+1).
      // e.g. refresh on ?page=2 should reload page 2, not page 3.
      const page = posts.value.length
        ? lastPageNumber.value + 1
        : Math.max(1, getSavedPageNumber());
      const newPosts = await loadPosts(page, "next");
      if (thisGen !== generation.value) return;
      if (!newPosts.length) {
        reachedEnd.value = true;
      } else {
        reachedEnd.value = false;
        const postCountToRemove = getPostCountToRemove();
        posts.value.push(...newPosts);
        posts.value.splice(0, postCountToRemove);
      }
    } catch (error) {
      if (thisGen === generation.value) handleError(error);
    } finally {
      if (thisGen === generation.value) loading.value = false;
    }
  };

  watch(
    posts,
    () => {
      savePageNumber(posts.value[0]?.__meta.pageNumber || null);
    },
    { deep: true },
  );

  const openPostDetails = async (postId: number) => {
    const found = posts.value.find((p) => p.id === postId) || null;
    detailsPost.value = found ? await enrichInkbunny(found) : null;
  };
  const isValidNextPost = (post: EnhancedPost) => {
    return !!post.file.url && !post.__meta.isBlacklisted;
  };
  const _openFullscreenPost =
    (offset: number) =>
      async (postId: number, depth: number): Promise<boolean> => {
        // returns whether post has been opened successfully
        const idx = posts.value.findIndex((p) => p.id === postId);
        let nextPostIdx = idx;
        do {
          nextPostIdx += offset;
        } while (
          posts.value[nextPostIdx] &&
          !isValidNextPost(posts.value[nextPostIdx]) &&
          offset
        );
        const nextPost = posts.value[nextPostIdx];
        if (nextPost) {
          fullscreenPost.value = await enrichInkbunny(nextPost);
          return true;
        } else {
          if (offset > 0) {
            await loadNextPage();
          } else if (offset < 0) {
            await loadPreviousPage();
          }
          if (depth <= 0) {
            const success = await _openFullscreenPost(offset)(postId, depth + 1);
            if (!success) {
              fullscreenPost.value = null; // no further posts
            }
            return success;
          } else {
            return false;
          }
        }
      };

  const openFullscreenPost = _openFullscreenPost(0);
  const openNextFullscreenPost = () =>
    fullscreenPost.value?.id &&
    _openFullscreenPost(1)(fullscreenPost.value.id, 0);
  const openPreviousFullscreenPost = () =>
    fullscreenPost.value?.id &&
    _openFullscreenPost(-1)(fullscreenPost.value.id, 0);

  const visiblePosts = computed(() => {
    const visibleAfterApplyingBlacklist = blacklistStore.mode === BlacklistMode.hide ? posts.value.filter(p => !p.__meta.isBlacklisted) : [...posts.value];
    const visibleAfterApplyingServerSideBlacklistSetting = blacklistStore.hideServerSideBlacklisted ? visibleAfterApplyingBlacklist.filter(p => !!p.file.url) : [...visibleAfterApplyingBlacklist];
    return visibleAfterApplyingServerSideBlacklistSetting;
  });
  const hiddenPostCount = computed(() => posts.value.length - visiblePosts.value.length);
  const clearPosts = () => {
    generation.value += 1;
    posts.value = [];
    reachedEnd.value = false;
    loading.value = false;
  };
  const hasPrevious = computed(() => posts.value.length !== 0 && posts.value[0].__meta.pageNumber > 1);

  const hasValidPostBefore = (index: number) => {
    for (let i = index - 1; i >= 0; i--) {
      if (isValidNextPost(posts.value[i])) return true;
    }
    return false;
  };

  const hasValidPostAfter = (index: number) => {
    for (let i = index + 1; i < posts.value.length; i++) {
      if (isValidNextPost(posts.value[i])) return true;
    }
    return false;
  };

  const hasPreviousFullscreenPost = computed(() => {
    const current = fullscreenPost.value;
    if (!current) return false;
    const idx = posts.value.findIndex((p) => p.id === current.id);
    if (idx < 0) return false;
    return hasValidPostBefore(idx) || hasPrevious.value;
  });

  const hasNextFullscreenPost = computed(() => {
    const current = fullscreenPost.value;
    if (!current) return false;
    const idx = posts.value.findIndex((p) => p.id === current.id);
    if (idx < 0) return false;
    if (hasValidPostAfter(idx)) return true;
    return !reachedEnd.value;
  });

  return {
    loadPreviousPage,
    loadNextPage,
    visiblePosts,
    hiddenPostCount,
    fullscreenPost,
    detailsPost,
    loading,
    openPostDetails,
    openFullscreenPost,
    openNextFullscreenPost,
    openPreviousFullscreenPost,
    setPostFavorite,
    setPostVote,
    clearPosts,
    hasPrevious,
    hasPreviousFullscreenPost,
    hasNextFullscreenPost,
  };
};
