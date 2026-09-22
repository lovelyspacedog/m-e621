<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex flex-wrap align-center ga-2 mb-4">
          <h1 class="text-h5 mb-0">Pool / Series Suggester</h1>
          <v-spacer />
          <v-btn variant="tonal" size="small" :loading="loading" @click="run">
            Refresh
          </v-btn>
        </div>

        <p class="text-body-2 text-medium-emphasis mb-2">
          Seeds:
          <span v-for="(s, i) in seeds" :key="s.name">
            {{ s.name }}<span v-if="i < seeds.length - 1">, </span>
          </span>
          <span v-if="!seeds.length">none</span>
        </p>

        <v-alert v-if="errorMessage" type="error" density="compact" class="mb-4">
          {{ errorMessage }}
        </v-alert>
        <v-progress-linear
          v-if="loading"
          indeterminate
          class="mb-4"
        />

        <v-list v-if="rows.length" lines="two" border rounded>
          <v-list-item v-for="row in rows" :key="row.key">
            <v-list-item-title>
              {{ row.name }}
              <v-chip
                v-if="row.watched"
                size="x-small"
                class="ml-2"
                color="primary"
              >
                watched
              </v-chip>
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ row.origin }} · seed {{ row.seed }} ·
              {{ row.postCount ?? "?" }} posts
            </v-list-item-subtitle>
            <template #append>
              <v-btn size="small" variant="tonal" @click="openPool(row)">
                Open
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
        <p v-else-if="!loading && !errorMessage" class="text-medium-emphasis">
          No pools found for these seeds.
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
  useWatchedPoolsStore,
} from "@/services";
import { poolSearchSeeds, type RankedTag } from "@/misc/util/discoveryTools";
import { sampleFavoriteProfile } from "@/misc/util/discoveryFavoriteSample";
import { probeFaHostCookiesAvailable } from "@/misc/util/favoriteAuthGate";
import { authFromAccount } from "@/misc/util/postOrigin";
import {
  isE621FamilyMode,
  modeSupportsPools,
} from "@/misc/util/siteCapabilities";
import { createEmptySiteProfile } from "@/services/siteProfiles";
import { SITE_MODE_URLS, type PoolOriginMode } from "@/services/types";
import { getApiService } from "@/worker/services";
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref, toRaw, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

useHead({ title: "Pool / Series Suggester" });

type PoolRow = {
  key: string;
  id: number;
  name: string;
  origin: PoolOriginMode;
  seed: string;
  postCount?: number;
  watched: boolean;
};

const route = useRoute();
const router = useRouter();
const account = useAccountStore();
const siteMode = useSiteModeStore();
const urlStore = useUrlStore();
const postsStore = usePostsStore();
const snackbar = useSnackbarStore();
const main = useMainStore();
const watched = useWatchedPoolsStore();

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const seeds = ref<RankedTag[]>([]);
const rows = ref<PoolRow[]>([]);
const hostFaCookiesAvailable = ref(false);
let generation = 0;

const username = computed(() => route.query.name?.toString() || "");

const openPool = (row: PoolRow) => {
  router.push({
    name: "Pool",
    params: { id: String(row.id) },
    query: { origin: row.origin },
  });
};

const watchedKey = (origin: string, id: number) => `${origin}:${id}`;

const run = async () => {
  const thisGen = ++generation;
  loading.value = true;
  errorMessage.value = null;
  rows.value = [];
  seeds.value = [];
  try {
    if (!modeSupportsPools(siteMode.activeMode)) {
      errorMessage.value = "Pools are not available in this mode.";
      return;
    }
    if (siteMode.activeMode === "inkbunny") {
      errorMessage.value =
        "Inkbunny has no pools list API — open pools from a submission or by id.";
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
      onProgress: () => undefined,
      onWarning: (msg) => snackbar.addMessage(msg),
    });
    if (thisGen !== generation) return;
    seeds.value = poolSearchSeeds(sample.profile.counts, 6);
    if (!seeds.value.length) {
      errorMessage.value = "No artist/character seeds in this favorites sample.";
      return;
    }

    const api = await getApiService();
    const seen = new Set<string>();
    const out: PoolRow[] = [];
    const watchedIds = new Set(
      watched.entries.map((e) => watchedKey(e.originMode, e.id)),
    );

    const origins: PoolOriginMode[] =
      siteMode.activeMode === "unified"
        ? ["e621", "e6ai", "furbooru"]
        : siteMode.activeMode === "furbooru"
          ? ["furbooru"]
          : isE621FamilyMode(siteMode.activeMode)
            ? [siteMode.activeMode as PoolOriginMode]
            : [];

    for (const seed of seeds.value) {
      for (const origin of origins) {
        if (thisGen !== generation) return;
        try {
          const profile =
            main.$state.profiles[origin] || createEmptySiteProfile(origin);
          const pools = await api.getPools({
            baseUrl: profile.baseUrl || SITE_MODE_URLS[origin],
            mode: origin,
            limit: 8,
            page: 1,
            order: "post_count",
            postTagsMatch: seed.name,
            query: origin === "furbooru" ? seed.name : undefined,
            auth: authFromAccount(origin, toRaw(profile.account)),
          });
          for (const pool of pools) {
            const key = watchedKey(origin, pool.id);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
              key,
              id: pool.id,
              name: pool.name || `Pool ${pool.id}`,
              origin,
              seed: seed.name,
              postCount: pool.post_count,
              watched: watchedIds.has(key),
            });
          }
        } catch (err: unknown) {
          snackbar.addMessage(
            `${origin}/${seed.name}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    out.sort(
      (a, b) =>
        Number(a.watched) - Number(b.watched) ||
        (b.postCount || 0) - (a.postCount || 0),
    );
    rows.value = out.slice(0, 40);
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
  () => void run(),
);
</script>
