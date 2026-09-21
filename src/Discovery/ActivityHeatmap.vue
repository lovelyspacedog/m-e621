<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex flex-wrap align-center ga-2 mb-4">
          <h1 class="text-h5 mb-0">Activity heatmap</h1>
          <v-spacer />
          <v-btn variant="tonal" size="small" :loading="loading" @click="run">
            Refresh
          </v-btn>
        </div>

        <p class="text-body-2 text-medium-emphasis mb-4">
          Calendar of posts in your favorites sample by their upload date (a
          proxy for what you save over time — not exact favorited-at timestamps).
          e621-family and Local work best.
        </p>

        <v-text-field
          v-if="showUsername"
          v-model="username"
          label="Username (optional if signed in)"
          class="mb-2"
          hide-details
          density="compact"
          style="max-width: 280px"
          @keyup.enter="run"
        />

        <v-alert v-if="errorMessage" type="error" density="compact" class="mb-4">
          {{ errorMessage }}
        </v-alert>
        <v-progress-linear
          v-if="loading"
          indeterminate
          class="mb-4"
        />

        <template v-if="heatmap.max > 0">
          <p class="text-caption text-medium-emphasis mb-2">
            Sample {{ sampleSize }} · peak {{ heatmap.max }}
            <span v-if="selectedDay"> · {{ selectedDay }}</span>
          </p>
          <UploadHeatmap
            :heatmap="heatmap.days"
            :max="heatmap.max"
            :selected-day="selectedDay"
            @select-day="onSelectDay"
          />
        </template>
        <p v-else-if="!loading && !errorMessage" class="text-medium-emphasis">
          No dated posts in this sample yet.
        </p>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.activityHeatmap"
      title="Activity heatmap"
      v-model="tipOpen"
    >
      <p class="mb-0">
        Shows when the posts you favorited were uploaded, using the same
        calendar chrome as Artist Dashboard. Browse history has no dates, so it
        is not plotted here.
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
  useSnackbarStore,
  useUrlStore,
} from "@/services";
import TipDialog from "@/misc/TipDialog.vue";
import UploadHeatmap from "@/ArtistDashboard/UploadHeatmap.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import {
  buildPostActivityHeatmap,
  type ActivityHeatmap,
} from "@/misc/util/discoveryTools";
import { sampleFavoriteProfile } from "@/misc/util/discoveryFavoriteSample";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";
import {
  favoriteToolSubmitGate,
  probeFaHostCookiesAvailable,
} from "@/misc/util/favoriteAuthGate";
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref, toRaw } from "vue";

useHead({ title: "Activity heatmap" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const urlStore = useUrlStore();
const postsStore = usePostsStore();
const snackbar = useSnackbarStore();
const main = useMainStore();
const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.activityHeatmap);

const username = ref(account.username || "");
const hostFaCookiesAvailable = ref(false);
const loading = ref(false);
const errorMessage = ref<string | null>(null);
const sampleSize = ref(0);
const selectedDay = ref<string | null>(null);
const heatmap = ref<ActivityHeatmap>({ days: {}, max: 0 });

const showUsername = computed(() =>
  modeSupportsOtherUserFavorites(siteMode.activeMode),
);

const onSelectDay = (day: string | null) => {
  selectedDay.value = day;
};

const run = async () => {
  loading.value = true;
  errorMessage.value = null;
  heatmap.value = { days: {}, max: 0 };
  try {
    const gate = favoriteToolSubmitGate({
      mode: siteMode.activeMode,
      username: username.value,
      apiKey: account.auth?.api_key,
      hostFaCookiesAvailable: hostFaCookiesAvailable.value,
    });
    if (!gate.ok) {
      errorMessage.value = gate.message || "Cannot load favorites.";
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
      onWarning: (msg) => snackbar.addMessage(msg),
    });
    sampleSize.value = sample.posts?.length || sample.sampleSize;
    heatmap.value = buildPostActivityHeatmap(sample.posts || []);
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  tryOpen();
  void (async () => {
    if (siteMode.activeMode === "furaffinity") {
      hostFaCookiesAvailable.value = await probeFaHostCookiesAvailable();
    }
    await run();
  })();
});
</script>
