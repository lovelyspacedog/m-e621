<template>
  <v-container class="fill-height" v-if="!result">
    <v-row align="center" justify="center">
      <progress-message :value="progress" />
    </v-row>
  </v-container>
  <v-container fluid v-else>
    <v-alert
      v-if="result.truncated"
      type="info"
      variant="tonal"
      class="mb-4"
      density="comfortable"
    >
      Stats based on the latest {{ result.sampledPostCount }} posts (fetch cap).
    </v-alert>

    <div class="d-flex flex-wrap align-center justify-center ga-4 mb-4">
      <img
        v-if="headerPreview"
        class="header-preview"
        :src="headerPreview"
        :alt="artist"
      />
      <div class="text-center">
        <h1 class="text-h2">{{ artist }}</h1>
        <div class="d-flex flex-wrap justify-center ga-2 mt-2">
          <v-btn :href="artistUrl" target="_blank" color="primary" size="small">
            View Profile
            <v-icon end>mdi-open-in-new</v-icon>
          </v-btn>
          <v-btn :to="postsSearchRoute" size="small" variant="tonal">
            Search in Posts
          </v-btn>
          <v-btn size="small" variant="tonal" @click="copyArtistTag">
            Copy tag
          </v-btn>
          <v-btn size="small" variant="tonal" @click="addSavedSearch">
            Add as saved search
          </v-btn>
        </div>
      </div>
    </div>

    <v-row>
      <v-col cols="12">
        <v-card color="transparent" flat>
          <v-card-title>Top posts</v-card-title>
          <v-card-text>
            <TopPostsStrip :posts="topPosts" @select="previewPost = $event" />
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12">
        <v-card color="transparent" flat>
          <v-card-title class="d-flex align-center">
            Uploads During the Past Year
            <v-spacer />
            <v-chip
              v-if="selectedDay"
              size="small"
              closable
              @click:close="selectedDay = null"
            >
              {{ selectedDay }}
            </v-chip>
          </v-card-title>
          <v-card-text>
            <UploadHeatmap
              :heatmap="result.heatmap.days"
              :max="result.heatmap.max"
              :selected-day="selectedDay"
              @select-day="selectedDay = $event"
            />
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12">
        <v-card color="transparent" flat>
          <v-card-title>Uploads</v-card-title>
          <v-card-text>
            <ArtistMetrics :metrics="result.uploadMetrics" />
            <div class="mt-4">
              <div class="text-subtitle-2 mb-2">Rating mix</div>
              <RatingBreakdownBar :breakdown="result.ratingBreakdown" />
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12">
        <v-card color="transparent" flat>
          <v-card-title class="d-flex align-center">
            Community
            <v-spacer />
            <v-btn-toggle
              v-model="communityMode"
              mandatory
              density="compact"
              color="primary"
            >
              <v-btn value="totals" size="small">Totals</v-btn>
              <v-btn value="perPost" size="small">Per post</v-btn>
            </v-btn-toggle>
          </v-card-title>
          <v-card-text>
            <ArtistMetrics
              :metrics="
                communityMode === 'perPost'
                  ? result.communityPerPostMetrics
                  : result.communityMetrics
              "
            />
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12">
        <v-card color="transparent" flat>
          <v-card-title>Tag filters</v-card-title>
          <v-card-text>
            <div class="d-flex align-center ga-4" style="max-width: 420px">
              <v-slider
                v-model="outlierPercent"
                :min="0"
                :max="10"
                :step="0.5"
                label="Min post share for rate ranks"
                thumb-label
                hide-details
              />
              <span class="text-caption text-no-wrap">{{ outlierPercent }}%</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card color="transparent" flat>
          <v-card-title>Top Tags (Posts)</v-card-title>
          <v-card-text>
            <ArtistTags :tags="visibleTags.count" />
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card color="transparent" flat>
          <v-card-title>Top Tags (Favorites per Post)</v-card-title>
          <v-card-text>
            <ArtistTags :tags="visibleTags.fav" />
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card color="transparent" flat>
          <v-card-title>Top Tags (Upvote Rate)</v-card-title>
          <v-card-text>
            <ArtistTags :tags="visibleTags.up" />
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card color="transparent" flat>
          <v-card-title>Top Tags (Downvote Rate)</v-card-title>
          <v-card-text>
            <ArtistTags :tags="visibleTags.down" />
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12">
        <v-card color="transparent" flat>
          <v-card-title>Posts</v-card-title>
          <v-card-text>
            <PostsDataTable
              :posts="result.posts"
              :day-filter="selectedDay"
              @select="previewPost = $event"
              @clear-day="selectedDay = null"
            />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <DashboardPostPreview :post="previewPost" @close="previewPost = null" />
  </v-container>
</template>

<script setup lang="ts">
import ProgressMessage from "@/Suggester/ProgressMessage.vue";
import {
  applyOutlierFilter,
  DASHBOARD_DEFAULT_OUTLIER_RATIO,
  pickTopPostsByFavorites,
  sortDashboardTags,
} from "@/misc/util/dashboardMetrics";
import { useSiteLabels } from "@/misc/util/siteLabels";
import {
  useArtistDashboardStore,
  useSavedSearchStore,
  useSiteModeStore,
  useSnackbarStore,
  useUrlStore,
} from "@/services";
import type { IProgressEvent } from "@/worker/AnalyzeService";
import type { EnhancedPost } from "@/worker/ApiService";
import type {
  IDashboardArgs,
  IDashboardResult,
} from "@/worker/DashboardService";
import { getDashboardService } from "@/worker/services";
import { useHead } from "@unhead/vue";
import * as Comlink from "comlink";
import { debounce } from "lodash";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import ArtistMetrics from "./ArtistMetrics.vue";
import ArtistTags from "./ArtistTags.vue";
import DashboardPostPreview from "./DashboardPostPreview.vue";
import PostsDataTable from "./PostsDataTable.vue";
import RatingBreakdownBar from "./RatingBreakdownBar.vue";
import TopPostsStrip from "./TopPostsStrip.vue";
import UploadHeatmap from "./UploadHeatmap.vue";

useHead({ title: "Dashboard" });

const urlStore = useUrlStore();
const siteMode = useSiteModeStore();
const dashboardStore = useArtistDashboardStore();
const savedSearches = useSavedSearchStore();
const snackbar = useSnackbarStore();
const progress = ref<IProgressEvent>();
const route = useRoute();
const selectedDay = ref<string | null>(null);
const previewPost = ref<EnhancedPost | null>(null);
const communityMode = ref<"totals" | "perPost">("totals");
const outlierPercent = ref(DASHBOARD_DEFAULT_OUTLIER_RATIO * 100);

const artist = computed<string>(() => {
  let name = "";
  if (route.params.name) {
    name =
      typeof route.params.name === "string"
        ? route.params.name
        : route.params.name[0];
  }
  return name;
});

const args = computed<IDashboardArgs>(() => ({
  artist: artist.value,
  baseUrl: urlStore.e621Url,
  mode: siteMode.activeMode,
}));

const result = ref<IDashboardResult>();

const getResult = debounce(async () => {
  result.value = undefined;
  selectedDay.value = null;
  previewPost.value = null;
  const service = await getDashboardService();
  result.value = await service.getDashboardResult(
    args.value,
    Comlink.proxy((progressEvent) => {
      progress.value = progressEvent;
    }),
  );
  if (artist.value && result.value?.posts.length) {
    dashboardStore.recordVisit(artist.value);
  }
}, 500);

watch(
  args,
  () => {
    getResult();
  },
  { immediate: true },
);

const { creatorPath } = useSiteLabels();
const artistUrl = computed(
  () =>
    `${urlStore.e621Url}${creatorPath.value}/${encodeURIComponent(artist.value)}`,
);

const postsSearchRoute = computed(() => ({
  name: "Posts" as const,
  query: { tags: artist.value },
}));

const topPosts = computed(() =>
  result.value ? pickTopPostsByFavorites(result.value.posts, 12) : [],
);

const headerPreview = computed(
  () => topPosts.value[0]?.preview.url || topPosts.value[0]?.sample.url || "",
);

const outlierRatio = computed(() => outlierPercent.value / 100);

const visibleTags = computed(() => {
  const empty = { count: [], fav: [], up: [], down: [] };
  if (!result.value) return empty;
  const postCount = result.value.sampledPostCount;
  const ratio = outlierRatio.value;
  const take = (kind: "count" | "fav" | "up" | "down") =>
    applyOutlierFilter(
      sortDashboardTags(result.value!.topTags[kind], kind),
      kind,
      postCount,
      ratio,
    ).slice(0, 10);

  return {
    count: take("count"),
    fav: take("fav"),
    up: take("up"),
    down: take("down"),
  };
});

const copyArtistTag = async () => {
  try {
    await navigator.clipboard.writeText(artist.value);
    snackbar.addMessage("Copied artist tag");
  } catch {
    snackbar.addMessage("Could not copy tag");
  }
};

const addSavedSearch = () => {
  const exists = savedSearches.entries.some(
    (e) => e.tags.length === 1 && e.tags[0] === artist.value,
  );
  if (exists) {
    snackbar.addMessage("Saved search already exists for this artist");
    return;
  }
  savedSearches.addEntry([artist.value], artist.value);
  snackbar.addMessage("Added saved search");
};
</script>

<style scoped>
.header-preview {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
</style>
