<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex flex-wrap align-center ga-2 mb-4">
          <h1 class="text-h5 mb-0">Artist Radar</h1>
          <v-spacer />
          <v-btn
            variant="tonal"
            size="small"
            :loading="loading"
            @click="run"
          >
            Refresh
          </v-btn>
        </div>

        <p class="text-body-2 text-medium-emphasis mb-2">{{ heading }}</p>

        <v-alert v-if="errorMessage" type="error" class="mb-4" density="compact">
          {{ errorMessage }}
        </v-alert>

        <v-progress-linear
          v-if="loading && progress"
          :model-value="(progress.progress || 0) * 100"
          :indeterminate="progress.indeterminate"
          class="mb-4"
        />
        <p
          v-if="loading && progress"
          class="text-caption text-medium-emphasis mb-4"
        >
          {{ progress.message }}
        </p>

        <v-list v-if="rows.length" lines="two" border rounded>
          <v-list-item v-for="row in rows" :key="row.cursorKey">
            <v-list-item-title>
              {{ row.artist }}
              <v-chip
                v-if="row.newer > 0"
                size="x-small"
                color="primary"
                class="ml-2"
              >
                +{{ row.newer }}
              </v-chip>
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ row.favCount }} in favorites sample
              <span v-if="row.checkedLabel"> · {{ row.checkedLabel }}</span>
              <span v-if="row.checkError" class="text-error">
                · {{ row.checkError }}</span
              >
            </v-list-item-subtitle>
            <template #append>
              <div class="d-flex ga-1">
                <v-btn size="small" variant="text" @click="openSearch(row.artist)">
                  Open
                </v-btn>
                <v-btn
                  size="small"
                  variant="tonal"
                  :disabled="!row.newestKey"
                  @click="markSeen(row)"
                >
                  Mark seen
                </v-btn>
              </div>
            </template>
          </v-list-item>
        </v-list>
        <p v-else-if="!loading && !errorMessage" class="text-medium-emphasis">
          No artist tags found in this favorites sample.
        </p>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import {
  useAccountStore,
  useDiscoveryStore,
  useMainStore,
  usePostsStore,
  useSiteModeStore,
  useSnackbarStore,
  useUrlStore,
} from "@/services";
import {
  artistRadarCursorKey,
  countNewerThanCursor,
  rankFavoriteArtists,
} from "@/misc/util/discoveryTools";
import { sampleFavoriteProfile } from "@/misc/util/discoveryFavoriteSample";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";
import {
  probeFaHostCookiesAvailable,
} from "@/misc/util/favoriteAuthGate";
import { getApiService } from "@/worker/services";
import { BlacklistMode } from "@/services/types";
import type { IProgressEvent } from "@/worker/AnalyzeService";
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref, toRaw, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

useHead({ title: "Artist Radar" });

type RadarRow = {
  artist: string;
  favCount: number;
  cursorKey: string;
  newer: number;
  newestKey: string | null;
  newestCreatedMs: number | null;
  checkedLabel: string;
  checkError: string | null;
};

const TOP_ARTISTS = 20;
const RECENT_LIMIT = 24;

const route = useRoute();
const router = useRouter();
const account = useAccountStore();
const siteMode = useSiteModeStore();
const urlStore = useUrlStore();
const postsStore = usePostsStore();
const snackbar = useSnackbarStore();
const main = useMainStore();
const discovery = useDiscoveryStore();

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const progress = ref<IProgressEvent | null>(null);
const rows = ref<RadarRow[]>([]);
const hostFaCookiesAvailable = ref(false);
let generation = 0;

const username = computed(() => route.query?.name?.toString() || "");
const needsUsername = computed(() =>
  modeSupportsOtherUserFavorites(siteMode.activeMode),
);

const heading = computed(() => {
  if (siteMode.activeMode === "local") return "Library favorites";
  if (siteMode.activeMode === "unified") return "Federated favorites";
  if (needsUsername.value && username.value) {
    return `Favorites for ${username.value}`;
  }
  return "Your favorites";
});

const refreshFaHostCookies = async () => {
  if (siteMode.activeMode !== "furaffinity") {
    hostFaCookiesAvailable.value = false;
    return;
  }
  hostFaCookiesAvailable.value = await probeFaHostCookiesAvailable();
};

const formatChecked = (ms?: number) => {
  if (!ms) return "never checked";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "checked just now";
  if (mins < 60) return `checked ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `checked ${hours}h ago`;
  return `checked ${Math.round(hours / 24)}d ago`;
};

const openSearch = (artist: string) => {
  router.push({ name: "Posts", query: { tags: artist } });
};

const markSeen = (row: RadarRow) => {
  if (!row.newestKey) return;
  discovery.setArtistCursor(row.cursorKey, {
    newestKey: row.newestKey,
    createdMs: row.newestCreatedMs ?? undefined,
    checkedAt: Date.now(),
  });
  row.newer = 0;
  row.checkedLabel = formatChecked(Date.now());
};

const run = async () => {
  const thisGen = ++generation;
  loading.value = true;
  errorMessage.value = null;
  rows.value = [];
  progress.value = { message: "starting", progress: 0 };

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
      onProgress: (e) => {
        progress.value = e;
      },
      onWarning: (msg) => snackbar.addMessage(msg),
    });
    if (thisGen !== generation) return;

    const artists = rankFavoriteArtists(sample.profile.counts, TOP_ARTISTS);
    const api = await getApiService();
    const out: RadarRow[] = [];

    for (let i = 0; i < artists.length; i++) {
      if (thisGen !== generation) return;
      const artist = artists[i]!;
      progress.value = {
        message: `checking ${artist.name} (${i + 1}/${artists.length})`,
        progress: (i + 1) / artists.length,
      };
      const cursorKey = artistRadarCursorKey(
        siteMode.activeMode,
        artist.name,
      );
      const cursor = discovery.getArtistCursor(cursorKey);
      const row: RadarRow = {
        artist: artist.name,
        favCount: artist.count,
        cursorKey,
        newer: 0,
        newestKey: null,
        newestCreatedMs: null,
        checkedLabel: formatChecked(cursor?.checkedAt),
        checkError: null,
      };
      try {
        if (siteMode.activeMode === "local") {
          const { getLocalPostsPage } = await import("@/misc/util/localMedia");
          const { posts } = await getLocalPostsPage(1, RECENT_LIMIT, [
            artist.name,
          ]);
          const counted = countNewerThanCursor(posts, cursor);
          row.newer = counted.newer;
          row.newestKey = counted.newestKey;
          row.newestCreatedMs = counted.newestCreatedMs;
        } else {
          const { posts } = await api.getPosts({
            blacklistMode: BlacklistMode.blur,
            blacklist: [],
            limit: RECENT_LIMIT,
            tags: [artist.name],
            baseUrl: urlStore.e621Url,
            mode: siteMode.activeMode,
            page: 1,
            auth: toRaw(account.auth),
            userId: account.userId,
            sfwOnly: postsStore.sfwOnly,
            ...(siteMode.activeMode === "unified"
              ? {
                  unified: toRaw(
                    (
                      await import("@/misc/util/postOrigin")
                    ).buildUnifiedFetchArgs(main.$state, {
                      forceAllEnabledChildren: true,
                    }),
                  ),
                }
              : {}),
          });
          const counted = countNewerThanCursor(posts, cursor);
          row.newer = counted.newer;
          row.newestKey = counted.newestKey;
          row.newestCreatedMs = counted.newestCreatedMs;
        }
      } catch (err: unknown) {
        row.checkError =
          err instanceof Error ? err.message : String(err);
      }
      out.push(row);
    }

    out.sort((a, b) => b.newer - a.newer || b.favCount - a.favCount);
    rows.value = out;
    progress.value = { message: "done", progress: 1 };
  } catch (err: unknown) {
    if (thisGen !== generation) return;
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (thisGen === generation) loading.value = false;
  }
};

onMounted(() => {
  void refreshFaHostCookies().then(() => run());
});

watch(
  () => [route.query.name, siteMode.activeMode] as const,
  () => {
    void refreshFaHostCookies().then(() => run());
  },
);
</script>
