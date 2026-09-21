<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex flex-wrap align-center ga-2 mb-4">
          <h1 class="text-h5 mb-0">Blacklist Coach</h1>
          <v-spacer />
          <v-btn variant="tonal" size="small" :loading="loading" @click="run">
            Refresh
          </v-btn>
        </div>

        <p class="text-body-2 text-medium-emphasis mb-2">
          Sample {{ sampleSize }} posts ·
          {{ blacklistedCount }} already match blacklist ·
          {{ blacklist.tags.length }} rule lines
        </p>

        <v-alert v-if="errorMessage" type="error" class="mb-4" density="compact">
          {{ errorMessage }}
        </v-alert>
        <v-progress-linear
          v-if="loading && progress"
          :model-value="(progress.progress || 0) * 100"
          class="mb-4"
        />

        <v-alert
          v-if="!loading && !errorMessage && !suggestions.length"
          type="info"
          density="compact"
          class="mb-4"
        >
          No suggestions — either nothing in the sample is blacklisted, or
          single-tag rules already cover the common tags.
        </v-alert>

        <v-list v-if="suggestions.length" lines="two" border rounded>
          <v-list-item v-for="s in suggestions" :key="s.tag">
            <v-list-item-title>{{ s.tag }}</v-list-item-title>
            <v-list-item-subtitle>
              On {{ s.onBlacklisted }} blacklisted
              ({{ Math.round(s.coverage * 100) }}%) · collateral
              {{ s.collateral }}
              <span v-if="preview[s.tag]">
                · with tag:
                {{ preview[s.tag]!.hits }}/{{ preview[s.tag]!.total }} hit
              </span>
            </v-list-item-subtitle>
            <template #append>
              <v-btn
                size="small"
                color="primary"
                variant="tonal"
                :disabled="alreadyHas(s.tag)"
                @click="applyTag(s.tag)"
              >
                {{ alreadyHas(s.tag) ? "Added" : "Add to blacklist" }}
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import {
  useAccountStore,
  useBlacklistStore,
  useMainStore,
  usePostsStore,
  useSiteModeStore,
  useSnackbarStore,
  useUrlStore,
} from "@/services";
import {
  previewBlacklistHitCount,
  suggestBlacklistTags,
  type BlacklistSuggestion,
} from "@/misc/util/discoveryTools";
import { sampleFavoriteProfile } from "@/misc/util/discoveryFavoriteSample";
import { probeFaHostCookiesAvailable } from "@/misc/util/favoriteAuthGate";
import { isPostBlacklisted } from "@/worker/blacklist";
import type { EnhancedPost } from "@/worker/ApiService";
import type { IProgressEvent } from "@/worker/AnalyzeService";
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref, toRaw, watch } from "vue";
import { useRoute } from "vue-router";

useHead({ title: "Blacklist Coach" });

const route = useRoute();
const account = useAccountStore();
const siteMode = useSiteModeStore();
const urlStore = useUrlStore();
const postsStore = usePostsStore();
const snackbar = useSnackbarStore();
const main = useMainStore();
const blacklist = useBlacklistStore();

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const progress = ref<IProgressEvent | null>(null);
const suggestions = ref<BlacklistSuggestion[]>([]);
const samplePosts = ref<EnhancedPost[]>([]);
const sampleSize = ref(0);
const preview = ref<Record<string, { hits: number; total: number }>>({});
const hostFaCookiesAvailable = ref(false);
const added = ref<Set<string>>(new Set());
let generation = 0;

const username = computed(() => route.query?.name?.toString() || "");

const blacklistedCount = computed(
  () =>
    samplePosts.value.filter((p) =>
      isPostBlacklisted(p, toRaw(blacklist.tags)),
    ).length,
);

const alreadyHas = (tag: string) => {
  if (added.value.has(tag.toLowerCase())) return true;
  return blacklist.tags.some(
    (line) =>
      line.length === 1 && line[0]?.toLowerCase() === tag.toLowerCase(),
  );
};

const applyTag = (tag: string) => {
  const next = [...toRaw(blacklist.tags), [tag]];
  main.blacklist.tags = next;
  added.value = new Set([...added.value, tag.toLowerCase()]);
  snackbar.addMessage(`Added “${tag}” to blacklist`);
};

const run = async () => {
  const thisGen = ++generation;
  loading.value = true;
  errorMessage.value = null;
  suggestions.value = [];
  samplePosts.value = [];
  preview.value = {};
  try {
    const sample = await sampleFavoriteProfile({
      mode: siteMode.activeMode,
      username: username.value,
      auth: toRaw(account.auth),
      apiKey: account.auth?.api_key,
      userId: account.userId,
      hostFaCookiesAvailable: hostFaCookiesAvailable.value,
      baseUrl: urlStore.e621Url,
      settings: toRaw(main.$state),
      postListFetchLimit: postsStore.postListFetchLimit || 30,
      sfwOnly: postsStore.sfwOnly,
      limit: 960,
      includePosts: true,
      onProgress: (e) => {
        progress.value = e;
      },
      onWarning: (msg) => snackbar.addMessage(msg),
    });
    if (thisGen !== generation) return;
    const posts = sample.posts || [];
    samplePosts.value = posts;
    sampleSize.value = posts.length;
    const bl = toRaw(blacklist.tags);
    const list = suggestBlacklistTags(posts, bl, 30);
    suggestions.value = list;
    const prev: Record<string, { hits: number; total: number }> = {};
    for (const s of list.slice(0, 15)) {
      prev[s.tag] = previewBlacklistHitCount(posts, bl, [s.tag]);
    }
    preview.value = prev;
    progress.value = { message: "done", progress: 1 };
  } catch (err: unknown) {
    if (thisGen !== generation) return;
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (thisGen === generation) loading.value = false;
  }
};

onMounted(() => {
  void (async () => {
    if (siteMode.activeMode === "furaffinity") {
      hostFaCookiesAvailable.value = await probeFaHostCookiesAvailable();
    }
    await run();
  })();
});

watch(
  () => [route.query.name, siteMode.activeMode] as const,
  () => {
    void run();
  },
);
</script>
