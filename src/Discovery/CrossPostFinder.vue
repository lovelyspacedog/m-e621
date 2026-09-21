<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <h1 class="text-h5 mb-2">Cross-post Finder</h1>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Load a still post by id, search Fluffle for copies on other platforms,
          and get artist/character search seeds for manual checks. Stills only;
          oversize fails closed.
        </p>

        <v-form class="d-flex flex-wrap ga-2 align-center mb-4" @submit.prevent="load">
          <v-text-field
            v-model="postId"
            label="Post id"
            type="number"
            density="compact"
            hide-details
            style="max-width: 160px"
          />
          <v-btn color="primary" :loading="loading" :disabled="!canLoad" @click="load">
            Find copies
          </v-btn>
        </v-form>

        <v-alert v-if="errorMessage" type="error" density="compact" class="mb-4">
          {{ errorMessage }}
        </v-alert>

        <template v-if="post">
          <p class="text-body-2 mb-2">
            Post #{{ post.id }}
            <span v-if="post.tags?.artist?.length">
              · {{ post.tags.artist.slice(0, 3).join(", ") }}
            </span>
            <v-chip
              v-if="!fluffleOk"
              size="x-small"
              class="ml-2"
              color="warning"
            >
              Fluffle unavailable
            </v-chip>
          </p>

          <h2 class="text-subtitle-1 mt-4 mb-2">Fluffle matches</h2>
          <v-progress-linear v-if="fluffleLoading" indeterminate class="mb-2" />
          <v-alert
            v-else-if="fluffleError"
            type="warning"
            density="compact"
            class="mb-2"
          >
            {{ fluffleError }}
          </v-alert>
          <v-list v-else-if="fluffleHits.length" lines="two" border rounded class="mb-4">
            <v-list-item
              v-for="hit in fluffleHits"
              :key="hit.id"
              :href="hit.url"
              target="_blank"
              rel="noopener"
            >
              <v-list-item-title>
                {{ hit.platform }} · {{ hit.match }}
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ hit.authors?.map((a) => a.name).join(", ") || hit.url }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
          <p v-else class="text-medium-emphasis mb-4">No Fluffle hits.</p>

          <h2 class="text-subtitle-1 mb-2">Heuristic searches</h2>
          <div class="d-flex flex-wrap ga-1 mb-4">
            <v-chip
              v-for="tag in heuristicTags"
              :key="tag"
              size="small"
              @click="searchTag(tag)"
            >
              {{ tag }}
            </v-chip>
            <span v-if="!heuristicTags.length" class="text-medium-emphasis"
              >No artist/character tags</span
            >
          </div>
        </template>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.crossPostFinder"
      title="Cross-post Finder"
      v-model="tipOpen"
    >
      <p class="mb-3">
        Uses Fluffle exact reverse-image search on stills (≤4&nbsp;MiB). Video,
        SWF, and oversize files are skipped. Results open on their source site.
      </p>
      <p class="mb-0">
        Heuristic chips search this mode by artist/character when you want a
        quick same-tag check without Fluffle.
      </p>
    </TipDialog>
  </v-container>
</template>

<script setup lang="ts">
import {
  useAccountStore,
  useMainStore,
  usePostsStore,
  useSiteModeStore,
  useUrlStore,
} from "@/services";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import { crossPostHeuristicTags } from "@/misc/util/discoveryTools";
import {
  postSupportsFluffle,
  searchFluffle,
  type FluffleResult,
} from "@/misc/util/fluffleSearch";
import { BlacklistMode } from "@/services/types";
import type { EnhancedPost } from "@/worker/ApiService";
import { getApiService } from "@/worker/services";
import { getLocalPostsPage } from "@/misc/util/localMedia";
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref, toRaw } from "vue";
import { useRoute, useRouter } from "vue-router";

useHead({ title: "Cross-post Finder" });

const route = useRoute();
const router = useRouter();
const account = useAccountStore();
const siteMode = useSiteModeStore();
const urlStore = useUrlStore();
const postsStore = usePostsStore();
const main = useMainStore();
const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.crossPostFinder);

const postId = ref(route.query.id?.toString() || "");
const loading = ref(false);
const fluffleLoading = ref(false);
const errorMessage = ref<string | null>(null);
const fluffleError = ref<string | null>(null);
const post = ref<EnhancedPost | null>(null);
const fluffleHits = ref<FluffleResult[]>([]);

const canLoad = computed(() => !!Number(postId.value));
const fluffleOk = computed(() => postSupportsFluffle(post.value));
const heuristicTags = computed(() =>
  post.value ? crossPostHeuristicTags(post.value) : [],
);

const searchTag = (tag: string) => {
  router.push({ name: "Posts", query: { tags: tag } });
};

const load = async () => {
  const id = Number(postId.value);
  if (!Number.isFinite(id) || id <= 0) {
    errorMessage.value = "Enter a valid post id.";
    return;
  }
  loading.value = true;
  errorMessage.value = null;
  fluffleError.value = null;
  fluffleHits.value = [];
  post.value = null;
  try {
    let found: EnhancedPost | null = null;
    if (siteMode.activeMode === "local") {
      const { posts } = await getLocalPostsPage(1, 50, [`id:${id}`]);
      found = posts.find((p) => p.id === id) || posts[0] || null;
    } else {
      const api = await getApiService();
      const { posts } = await api.getPosts({
        blacklistMode: BlacklistMode.blur,
        blacklist: [],
        limit: 1,
        tags: [`id:${id}`],
        baseUrl: urlStore.e621Url,
        mode: siteMode.activeMode,
        page: 1,
        auth: toRaw(account.auth),
        userId: account.userId,
        sfwOnly: postsStore.sfwOnly,
        ...(siteMode.activeMode === "unified"
          ? {
              unified: toRaw(
                (await import("@/misc/util/postOrigin")).buildUnifiedFetchArgs(
                  main.$state,
                ),
              ),
            }
          : {}),
      });
      found = posts[0] || null;
    }
    if (!found) {
      errorMessage.value = "Post not found in this mode.";
      return;
    }
    post.value = found;
    router.replace({ query: { ...route.query, id: String(id) } });

    if (!postSupportsFluffle(found)) {
      fluffleError.value =
        "Not a Fluffle-eligible still (wrong type, missing URL, or over 4 MiB).";
      return;
    }
    fluffleLoading.value = true;
    try {
      fluffleHits.value = await searchFluffle(found, 12);
    } catch (err: unknown) {
      fluffleError.value =
        err instanceof Error ? err.message : String(err);
    } finally {
      fluffleLoading.value = false;
    }
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  tryOpen();
  if (canLoad.value) void load();
});
</script>
