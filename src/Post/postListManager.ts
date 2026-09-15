import type { EnhancedPost } from "@/worker/ApiService";
import { getApiService } from "@/worker/services";
import { isPostBlacklisted } from "@/worker/blacklist";
import { computed, ref, toRaw, watch } from "vue";
import { useSnackbarStore, useUrlStore, useBlacklistStore, usePostsStore, useSiteModeStore, useUiStore, useMainStore } from "@/services";
import { BlacklistMode } from "@/services/types";
import { useRouter } from "vue-router";
import { setLocalFavorite } from "@/misc/util/localMedia";
import {
  findPostIndex,
  originAuthForPost,
  postFeedKey,
  unifiedChildLabel,
} from "@/misc/util/postOrigin";
import { isDocumentPost } from "@/misc/util/documentPost";
import { faUnavailableMeta, isFaNotFoundError } from "@/worker/furaffinity/api";

type PostPointer = number | { postId: number; originMode?: string };
type FullscreenAdvanceOpts = { skipDocuments?: boolean };

const pointerOf = (target: PostPointer): { postId: number; originMode?: string } =>
  typeof target === "number" ? { postId: target } : target;

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
  /** When next/prev is requested during an in-flight page load, retry once (M23). */
  let pendingFullscreenAdvance: -1 | 1 | null = null;
  let pendingFullscreenAdvanceOpts: FullscreenAdvanceOpts | null = null;
  let flushPendingFullscreenAdvance = () => {
    /* assigned after _openFullscreenPost exists */
  };
  const urlStore = useUrlStore();
  const blacklistStore = useBlacklistStore();
  const postsStore = usePostsStore();
  const siteMode = useSiteModeStore();
  const main = useMainStore();
  const router = useRouter()

  const handleError = (error: any) => {
    const errorMessage = error?.message || String(error);
    snackbar.addMessage(errorMessage);
    console.log(error);
  };

  const indexOfPost = (target: PostPointer) =>
    findPostIndex(posts.value, pointerOf(target));

  const enrichRemote = async (post: EnhancedPost) => {
    const originInkbunny =
      post.__meta.originMode === "inkbunny" || siteMode.isInkbunny;
    const originFa =
      post.__meta.originMode === "furaffinity" || siteMode.isFurAffinity;
    if (originInkbunny) {
      if (post.__meta.inkbunny?.detailsLoaded) return post;
    } else if (originFa) {
      if (post.__meta.furaffinity?.detailsLoaded) return post;
    } else {
      return post;
    }
    try {
      const origin = originAuthForPost(post, main.$state, siteMode.activeMode);
      const service = await getApiService();
      const updated = originInkbunny
        ? await service.enrichInkbunnyPost(toRaw(post), {
            sid: origin.auth?.api_key ?? null,
            blacklist: toRaw(origin.blacklist),
          })
        : await service.enrichFurAffinityPost(toRaw(post), {
            cookies: origin.auth?.api_key ?? null,
            blacklist: toRaw(origin.blacklist),
          });
      const idx = posts.value.findIndex((p) => postFeedKey(p) === postFeedKey(updated));
      if (idx >= 0) posts.value[idx] = updated;
      if (detailsPost.value && postFeedKey(detailsPost.value) === postFeedKey(updated)) {
        detailsPost.value = updated;
      }
      if (fullscreenPost.value && postFeedKey(fullscreenPost.value) === postFeedKey(updated)) {
        fullscreenPost.value = updated;
      }
      return updated;
    } catch (error) {
      if (originFa && isFaNotFoundError(error)) {
        const updated = {
          ...post,
          file: { ...post.file, url: null },
          preview: { ...post.preview, url: "" },
          sample: { ...post.sample, has: false, url: "" },
          __meta: {
            ...post.__meta,
            furaffinity: faUnavailableMeta(post.__meta.furaffinity),
          },
        } satisfies EnhancedPost;
        const idx = posts.value.findIndex((p) => postFeedKey(p) === postFeedKey(updated));
        if (idx >= 0) posts.value[idx] = updated;
        if (detailsPost.value && postFeedKey(detailsPost.value) === postFeedKey(updated)) {
          detailsPost.value = updated;
        }
        if (fullscreenPost.value && postFeedKey(fullscreenPost.value) === postFeedKey(updated)) {
          fullscreenPost.value = updated;
        }
        return updated;
      }
      handleError(error);
      return post;
    }
  };

  const setPostFavorite = async (args: {
    postId: number;
    favorited: boolean;
    originMode?: string;
  }) => {
    const idx = indexOfPost({ postId: args.postId, originMode: args.originMode });
    const post = idx >= 0 ? posts.value[idx] : undefined;
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

    const origin = originAuthForPost(post, main.$state, siteMode.activeMode);
    if (!origin.auth) {
      snackbar.addMessage(`Not logged in to ${unifiedChildLabel(origin.mode)}`);
      router.push({ name: "AccountSettings" });
      return;
    }
    const service = await getApiService();
    const serviceArgs = {
      postId: post.id,
      auth: origin.auth,
      proxyUrl: urlStore.proxyUrl,
      baseUrl: origin.baseUrl,
      mode: origin.mode,
    };
    try {
      post.__meta.isFavoriteLoading = true;
      if (args.favorited) {
        await service.favoritePost(serviceArgs);
      } else {
        await service.unfavoritePost(serviceArgs);
      }
      post.is_favorited = args.favorited;
      post.fav_count = Math.max(0, (post.fav_count || 0) + (args.favorited ? 1 : -1));
    } catch (error: any) {
      handleError(error);
    } finally {
      post.__meta.isFavoriteLoading = false;
    }
  };

  const setPostVote = async (args: {
    postId: number;
    score: 1 | -1 | 0;
    originMode?: string;
  }) => {
    if (siteMode.isLocal) return;
    const idx = indexOfPost({ postId: args.postId, originMode: args.originMode });
    const post = idx >= 0 ? posts.value[idx] : undefined;
    if (!post) return;
    const origin = originAuthForPost(post, main.$state, siteMode.activeMode);
    if (!origin.auth) {
      snackbar.addMessage(`Not logged in to ${unifiedChildLabel(origin.mode)}`);
      router.push({ name: "AccountSettings" });
      return;
    }
    const service = await getApiService();
    try {
      post.__meta.isVoteLoading = true;
      const result = await service.votePost({
        postId: post.id,
        score: args.score,
        auth: origin.auth,
        proxyUrl: urlStore.proxyUrl,
        baseUrl: origin.baseUrl,
        mode: origin.mode,
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
    if (firstPageNumber.value <= 1) {
      return;
    }
    const thisGen = generation.value;
    try {
      loading.value = true;
      const newPosts = await loadPosts(firstPageNumber.value - 1, "previous");
      if (thisGen !== generation.value) return;
      // newly uploaded posts cause old posts to shift pages, and duplicates are bad
      const newPostsFiltered = newPosts.filter(
        (newP) =>
          !posts.value.find(
            (existing) => postFeedKey(existing) === postFeedKey(newP),
          ),
      );
      if (!newPostsFiltered.length) return;
      const postCountToRemove = getPostCountToRemove();
      posts.value.unshift(...newPostsFiltered);
      posts.value.splice(
        posts.value.length - postCountToRemove,
        postCountToRemove,
      );
    } catch (error) {
      if (thisGen === generation.value) handleError(error);
    } finally {
      if (thisGen === generation.value) loading.value = false;
      if (thisGen === generation.value) flushPendingFullscreenAdvance();
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
      if (thisGen === generation.value) flushPendingFullscreenAdvance();
    }
  };

  watch(
    posts,
    () => {
      savePageNumber(posts.value[0]?.__meta.pageNumber || null);
    },
    { deep: true },
  );

  // Recompute blacklist flags when the user edits the blacklist (M18).
  watch(
    () => JSON.stringify(blacklistStore.tags),
    () => {
      for (const post of posts.value) {
        if (siteMode.isUnified) {
          const origin = originAuthForPost(post, main.$state, siteMode.activeMode);
          post.__meta.isBlacklisted = isPostBlacklisted(post, origin.blacklist);
        } else {
          post.__meta.isBlacklisted = isPostBlacklisted(
            post,
            toRaw(blacklistStore.tags),
          );
        }
      }
    },
  );

  const openPostDetails = async (target: PostPointer) => {
    const idx = indexOfPost(target);
    const found = idx >= 0 ? posts.value[idx] : null;
    detailsPost.value = found ? await enrichRemote(found) : null;
  };
  const isValidNextPost = (
    post: EnhancedPost,
    opts?: FullscreenAdvanceOpts,
  ) => {
    if (!post.file.url || post.__meta.isBlacklisted) return false;
    if (opts?.skipDocuments && isDocumentPost(post)) return false;
    return true;
  };
  const _openFullscreenPost =
    (offset: number, opts?: FullscreenAdvanceOpts) =>
      async (target: PostPointer, depth: number): Promise<boolean> => {
        // returns whether post has been opened successfully
        const idx = indexOfPost(target);
        let nextPostIdx = idx;
        do {
          nextPostIdx += offset;
        } while (
          posts.value[nextPostIdx] &&
          !isValidNextPost(posts.value[nextPostIdx], opts) &&
          offset
        );
        const nextPost = posts.value[nextPostIdx];
        if (nextPost) {
          fullscreenPost.value = await enrichRemote(nextPost);
          return true;
        } else {
          if (loading.value) {
            // Queue one pending advance for when the in-flight page load finishes (M23).
            if (offset) pendingFullscreenAdvance = offset > 0 ? 1 : -1;
            pendingFullscreenAdvanceOpts = opts ?? null;
            return false;
          }
          if (offset > 0) {
            await loadNextPage();
          } else if (offset < 0) {
            await loadPreviousPage();
          }
          if (depth <= 0) {
            const success = await _openFullscreenPost(offset, opts)(target, depth + 1);
            // Keep current fullscreen post on failed advance (end of results) (H5).
            return success;
          } else {
            return false;
          }
        }
      };

  const openFullscreenPost = (target: PostPointer) =>
    _openFullscreenPost(0)(target, 0);
  const fullscreenPointer = (): PostPointer | null =>
    fullscreenPost.value
      ? {
          postId: fullscreenPost.value.id,
          originMode: fullscreenPost.value.__meta.originMode,
        }
      : null;
  const openNextFullscreenPost = async (opts?: FullscreenAdvanceOpts) => {
    const pointer = fullscreenPointer();
    if (!pointer) return false;
    return _openFullscreenPost(1, opts)(pointer, 0);
  };
  const openPreviousFullscreenPost = () => {
    const pointer = fullscreenPointer();
    if (pointer) void _openFullscreenPost(-1)(pointer, 0);
  };

  flushPendingFullscreenAdvance = () => {
    if (!pendingFullscreenAdvance) return;
    const dir = pendingFullscreenAdvance;
    const opts = pendingFullscreenAdvanceOpts ?? undefined;
    pendingFullscreenAdvance = null;
    pendingFullscreenAdvanceOpts = null;
    const pointer = fullscreenPointer();
    if (pointer) void _openFullscreenPost(dir, opts)(pointer, 0);
  };

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
    pendingFullscreenAdvance = null;
    pendingFullscreenAdvanceOpts = null;
    // Search/mode/pool reloads must not leave overlays on stale posts (H3).
    fullscreenPost.value = null;
    detailsPost.value = null;
    useUiStore().fullscreenOpen = false;
  };

  /** Replace the in-memory list without page-window trimming (Saved posts). */
  const replacePosts = (next: EnhancedPost[]) => {
    generation.value += 1;
    posts.value = next;
    reachedEnd.value = true;
    loading.value = false;
    pendingFullscreenAdvance = null;
    pendingFullscreenAdvanceOpts = null;
    fullscreenPost.value = null;
    detailsPost.value = null;
    useUiStore().fullscreenOpen = false;
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
    const idx = posts.value.findIndex((p) => postFeedKey(p) === postFeedKey(current));
    if (idx < 0) return false;
    return hasValidPostBefore(idx) || hasPrevious.value;
  });

  const hasNextFullscreenPost = computed(() => {
    const current = fullscreenPost.value;
    if (!current) return false;
    const idx = posts.value.findIndex((p) => postFeedKey(p) === postFeedKey(current));
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
    replacePosts,
    hasPrevious,
    hasPreviousFullscreenPost,
    hasNextFullscreenPost,
  };
};
