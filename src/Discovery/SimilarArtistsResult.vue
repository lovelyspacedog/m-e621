<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex flex-wrap align-center ga-2 mb-4">
          <h1 class="text-h5 mb-0">Similar Artists</h1>
          <v-spacer />
          <v-btn
            variant="tonal"
            size="small"
            :to="suggesterLink"
            :disabled="!rows.length"
          >
            Open in Suggester
          </v-btn>
          <v-btn variant="tonal" size="small" :loading="loading" @click="run">
            Refresh
          </v-btn>
        </div>

        <p class="text-body-2 text-medium-emphasis mb-2">
          Seed: <strong>{{ seed }}</strong> · sample {{ sampleSize }}
        </p>

        <v-alert v-if="errorMessage" type="error" density="compact" class="mb-4">
          {{ errorMessage }}
        </v-alert>
        <v-progress-linear
          v-if="loading && progress"
          :model-value="(progress.progress || 0) * 100"
          class="mb-4"
        />

        <v-list v-if="rows.length" lines="two" border rounded>
          <v-list-item v-for="row in rows" :key="row.artist">
            <v-list-item-title>{{ row.artist }}</v-list-item-title>
            <v-list-item-subtitle>
              Co-occurs with seed on {{ row.withSeed }} posts ·
              {{ row.sampleCount }} in sample
            </v-list-item-subtitle>
            <template #append>
              <v-btn size="small" variant="text" @click="openArtist(row.artist)">
                Open
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
        <p v-else-if="!loading && !errorMessage" class="text-medium-emphasis">
          No co-occurring artists in this sample. Try a seed that appears in
          your favorites.
        </p>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import {
  useAccountStore,
  useMainStore,
  usePostsStore,
  useSiteModeStore,
  useSnackbarStore,
  useUrlStore,
} from "@/services";
import { rankSimilarArtists } from "@/misc/util/discoveryTools";
import { sampleFavoriteProfile } from "@/misc/util/discoveryFavoriteSample";
import { probeFaHostCookiesAvailable } from "@/misc/util/favoriteAuthGate";
import type { SimilarArtistRow } from "@/misc/util/discoveryTools";
import type { IProgressEvent } from "@/worker/AnalyzeService";
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref, toRaw, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

useHead({ title: "Similar Artists" });

const route = useRoute();
const router = useRouter();
const account = useAccountStore();
const siteMode = useSiteModeStore();
const urlStore = useUrlStore();
const postsStore = usePostsStore();
const snackbar = useSnackbarStore();
const main = useMainStore();

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const progress = ref<IProgressEvent | null>(null);
const rows = ref<SimilarArtistRow[]>([]);
const sampleSize = ref(0);
const hostFaCookiesAvailable = ref(false);
let generation = 0;

const seed = computed(() => route.query.seed?.toString() || "");
const username = computed(() => route.query.name?.toString() || "");

const suggesterLink = computed(() => ({
  name: "SuggesterResult" as const,
  query: {
    ...(username.value ? { name: username.value } : {}),
    // Bias artist weight; seed via opening Posts for now — Suggester uses fav profile.
  },
}));

const openArtist = (artist: string) => {
  router.push({ name: "Posts", query: { tags: artist } });
};

const run = async () => {
  const thisGen = ++generation;
  loading.value = true;
  errorMessage.value = null;
  rows.value = [];
  try {
    if (!seed.value.trim()) {
      errorMessage.value = "Missing seed artist.";
      return;
    }
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
    sampleSize.value = sample.posts?.length || sample.sampleSize;
    rows.value = rankSimilarArtists(
      sample.posts || [],
      seed.value,
      40,
    );
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
  () => [route.query.seed, route.query.name, siteMode.activeMode] as const,
  () => void run(),
);
</script>
