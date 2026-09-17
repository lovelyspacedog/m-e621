<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col ref="container">
        <div v-if="errorMessage" class="text-center text-error pa-4">
          {{ errorMessage }}
        </div>
        <div v-else-if="result">
          <posts :posts="posts" :loading="loading" :has-previous="hasPrevious" @load-previous="loadPreviousPage()"
            @load-next="loadNextPage()" @open-post="openFullscreenPost" :fullscreen-post="fullscreenPost || undefined"
            @exit-fullscreen="fullscreenPost = null" @next-fullscreen-post="openNextFullscreenPost()"
            @previous-fullscreen-post="openPreviousFullscreenPost()"
            :has-previous-fullscreen-post="hasPreviousFullscreenPost"
            :has-next-fullscreen-post="hasNextFullscreenPost"
            :details-post="detailsPost || undefined"
            @open-post-details="openPostDetails" @close-details="detailsPost = null"
            @set-post-favorite="setPostFavorite($event)"
            @set-post-vote="setPostVote($event)" />
          <portal to="sidebar-suggestions">
            <div class="text-overline" v-if="hiddenPostCount > 0">Blacklisted posts hidden: {{ hiddenPostCount }}</div>
            <progress-message v-if="listProgress" :value="listProgress" />
            <base-tags :counts="result.counts" />
          </portal>
        </div>
        <div v-else class="text-center">
          <progress-message :value="progress" />
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, toRaw } from "vue";
import type { FavoriteTagsResult, IProgressEvent } from "@/worker/AnalyzeService";
import { getAnalyzeService } from "@/worker/services";
import * as Comlink from "comlink";
import BaseTags from "./BaseTags.vue";
import { usePostListManager } from "@/Post/postListManager";
import { useRouterQueryHelpers } from "@/misc/util/utilities";
import Posts from "@/Post/Posts.vue";
import ProgressMessage from "./ProgressMessage.vue";
import {
  useAccountStore,
  useBlacklistStore,
  usePostsStore,
  useSiteModeStore,
  useUrlStore,
} from "@/services";
import { useMainStore } from "@/services/state";
import { useHead } from "@unhead/vue";
import { useRoute } from "vue-router";
import {
  ALL_SUGGESTER_WEIGHT_CATEGORIES,
  defaultSuggesterWeights,
  pickSeedTags,
  type SuggesterWeights,
} from "@/misc/util/favoriteQuery";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";
import { buildUnifiedFetchArgs } from "@/misc/util/postOrigin";
import { getLocalPostsPage } from "@/misc/util/localMedia";
import {
  buildFavoriteTagsResult,
  rankSuggestionPool,
  sliceScoredPool,
  type ScoredPost,
} from "@/misc/util/suggestionScoring";
import type { EnhancedPost } from "@/worker/ApiService";

useHead({ title: "Suggestions" });

const blacklist = useBlacklistStore();
const { removeRouterQuery, updateRouterQuery } = useRouterQueryHelpers();
const postsStore = usePostsStore();
const siteMode = useSiteModeStore();
const account = useAccountStore();
const main = useMainStore();
const route = useRoute();
const urlStore = useUrlStore();

const progress = ref<IProgressEvent>();
const listProgress = ref<IProgressEvent | null>(null);
const errorMessage = ref<string | null>(null);
const result = ref<FavoriteTagsResult | null>(null);
const localScoredPool = ref<ScoredPost[] | null>(null);

const username = computed(() => route.query?.name?.toString() || "");

const needsUsername = computed(() =>
  modeSupportsOtherUserFavorites(siteMode.activeMode),
);

const weights = computed<SuggesterWeights>(() => {
  const defaults = defaultSuggesterWeights(siteMode.activeMode);
  const fromQuery = { ...defaults };
  for (const key of ALL_SUGGESTER_WEIGHT_CATEGORIES) {
    const raw = route.query[key];
    if (raw != null) {
      fromQuery[key] = Number(raw) || 0;
    }
  }
  return fromQuery;
});

let analyzeGeneration = 0;

const fetchLocalPages = async (
  tags: string[],
  postLimit: number,
  onProgress?: (got: number) => void,
) => {
  const posts: EnhancedPost[] = [];
  let page = 1;
  const pageLimit = postsStore.postListFetchLimit || 30;
  while (posts.length < postLimit) {
    const { posts: batch, status } = await getLocalPostsPage(
      page,
      pageLimit,
      tags,
    );
    if (status !== "ok" && status !== "empty") break;
    posts.push(...batch);
    onProgress?.(posts.length);
    page += 1;
    if (batch.length < pageLimit) break;
  }
  return posts.slice(0, postLimit);
};

const analyze = async () => {
  const thisGen = ++analyzeGeneration;
  errorMessage.value = null;
  result.value = null;
  localScoredPool.value = null;

  try {
    if (needsUsername.value && !username.value.trim()) {
      errorMessage.value = "Enter a username to load favorites.";
      return;
    }
    if (
      !needsUsername.value &&
      siteMode.activeMode !== "local" &&
      siteMode.activeMode !== "furaffinity" &&
      !account.auth?.api_key
    ) {
      errorMessage.value = "Sign in for this site to run Post Suggester.";
      return;
    }

    const service = await getAnalyzeService();

    if (siteMode.isLocal) {
      progress.value = { message: "loading local favorites", progress: 0 };
      const favPosts = await fetchLocalPages(["type:favorited"], 320 * 6, (n) => {
        progress.value = {
          message: `local favorites ${n}`,
          progress: Math.min(1, n / (320 * 6)),
        };
      });
      if (thisGen !== analyzeGeneration) return;
      const profile = buildFavoriteTagsResult(favPosts);
      result.value = profile;

      progress.value = {
        message: "building local suggestion pool",
        progress: 0.5,
        indeterminate: true,
      };
      const seeds = pickSeedTags(profile.counts, weights.value, 15);
      const candidates: EnhancedPost[] = [];
      candidates.push(...(await fetchLocalPages([], 320 * 4)));
      for (const seed of seeds) {
        candidates.push(
          ...(await fetchLocalPages([seed.tag], postsStore.postListFetchLimit || 30)),
        );
      }
      if (thisGen !== analyzeGeneration) return;
      localScoredPool.value = rankSuggestionPool({
        tags: profile,
        weights: weights.value,
        candidates,
      });
    } else {
      const unified =
        siteMode.activeMode === "unified"
          ? buildUnifiedFetchArgs(main.$state)
          : undefined;
      const r = await service.getFavoriteTags(
        username.value,
        urlStore.e621Url,
        Comlink.proxy((progressEvent) => {
          progress.value = progressEvent;
        }),
        siteMode.activeMode,
        toRaw(account.auth),
        toRaw(account.userId),
        unified ? toRaw(unified) : undefined,
      );
      if (thisGen !== analyzeGeneration) return;
      result.value = r;
    }

    await nextTick();
    await loadNextPage();
  } catch (err: any) {
    if (thisGen !== analyzeGeneration) return;
    errorMessage.value = err?.message || String(err);
  }
};

const {
  loadPreviousPage,
  loadNextPage,
  visiblePosts: posts,
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
  async loadPosts(page, direction) {
    if (!result.value) {
      throw new Error("no tags available");
    }
    try {
      if (siteMode.isLocal && localScoredPool.value) {
        return sliceScoredPool(
          localScoredPool.value,
          page,
          postsStore.postListFetchLimit,
        );
      }
      const service = await getAnalyzeService();
      const unified =
        siteMode.activeMode === "unified"
          ? buildUnifiedFetchArgs(main.$state)
          : undefined;
      const posts = await service.suggestPosts(
        toRaw(result.value),
        toRaw(weights.value),
        toRaw(postsStore.postListFetchLimit),
        { page: toRaw(page), direction: toRaw(direction) },
        toRaw(account.auth),
        toRaw(urlStore.e621Url),
        Comlink.proxy((progressEvent) => {
          listProgress.value = progressEvent;
        }),
        toRaw(blacklist.tags),
        toRaw(blacklist.mode),
        toRaw(siteMode.activeMode),
        toRaw(account.userId),
        unified ? toRaw(unified) : undefined,
      );
      return posts;
    } finally {
      listProgress.value = null;
    }
  },
});

watch(
  [username, () => siteMode.activeMode],
  () => {
    analyze();
  },
  { immediate: true },
);
</script>
