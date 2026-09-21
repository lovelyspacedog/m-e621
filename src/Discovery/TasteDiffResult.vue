<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex flex-wrap align-center ga-2 mb-4">
          <h1 class="text-h5 mb-0">Taste Diff</h1>
          <v-spacer />
          <v-btn variant="tonal" size="small" :loading="loading" @click="run">
            Refresh
          </v-btn>
        </div>

        <p class="text-body-2 text-medium-emphasis mb-2">
          {{ leftLabel }} vs {{ rightLabel }}
        </p>

        <v-alert v-if="errorMessage" type="error" class="mb-4" density="compact">
          {{ errorMessage }}
        </v-alert>
        <v-progress-linear
          v-if="loading && progress"
          :model-value="(progress.progress || 0) * 100"
          class="mb-4"
        />

        <template v-if="diff">
          <h2 class="text-subtitle-1 mt-4 mb-2">Shared</h2>
          <div class="d-flex flex-wrap ga-1 mb-4">
            <v-chip
              v-for="row in diff.shared.slice(0, 40)"
              :key="`s-${row.category}-${row.tag}`"
              size="small"
              @click="searchTag(row.tag)"
            >
              {{ row.tag }}
              <span class="text-medium-emphasis ml-1"
                >{{ row.left }}/{{ row.right }}</span
              >
            </v-chip>
            <span v-if="!diff.shared.length" class="text-medium-emphasis"
              >None</span
            >
          </div>

          <h2 class="text-subtitle-1 mb-2">Only left</h2>
          <div class="d-flex flex-wrap ga-1 mb-4">
            <v-chip
              v-for="row in diff.leftOnly.slice(0, 40)"
              :key="`l-${row.category}-${row.tag}`"
              size="small"
              variant="tonal"
              @click="searchTag(row.tag)"
            >
              {{ row.tag }} ({{ row.left }})
            </v-chip>
            <span v-if="!diff.leftOnly.length" class="text-medium-emphasis"
              >None</span
            >
          </div>

          <h2 class="text-subtitle-1 mb-2">Only right</h2>
          <div class="d-flex flex-wrap ga-1 mb-4">
            <v-chip
              v-for="row in diff.rightOnly.slice(0, 40)"
              :key="`r-${row.category}-${row.tag}`"
              size="small"
              variant="outlined"
              @click="searchTag(row.tag)"
            >
              {{ row.tag }} ({{ row.right }})
            </v-chip>
            <span v-if="!diff.rightOnly.length" class="text-medium-emphasis"
              >None</span
            >
          </div>
        </template>
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
import { diffFavoriteTagCounts } from "@/misc/util/discoveryTools";
import { sampleFavoriteProfile } from "@/misc/util/discoveryFavoriteSample";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";
import { probeFaHostCookiesAvailable } from "@/misc/util/favoriteAuthGate";
import type { TasteDiffResult } from "@/misc/util/discoveryTools";
import type { IProgressEvent } from "@/worker/AnalyzeService";
import type { SiteMode } from "@/services/types";
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref, toRaw, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

useHead({ title: "Taste Diff" });

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
const diff = ref<TasteDiffResult | null>(null);
const hostFaCookiesAvailable = ref(false);
let generation = 0;

const leftName = computed(() => route.query.left?.toString() || "");
const rightName = computed(() => route.query.right?.toString() || "");
const rightMode = computed(
  () => (route.query.rightMode?.toString() || "local") as "local" | "self",
);
const showUsername = computed(() =>
  modeSupportsOtherUserFavorites(siteMode.activeMode),
);

const leftLabel = computed(() => {
  if (showUsername.value && leftName.value) return leftName.value;
  if (siteMode.activeMode === "local") return "Local";
  if (siteMode.activeMode === "unified") return "Federated";
  return "You";
});

const rightLabel = computed(() => {
  if (showUsername.value && rightName.value) return rightName.value;
  if (rightMode.value === "self") return "You (larger sample)";
  return "Local library";
});

const searchTag = (tag: string) => {
  router.push({ name: "Posts", query: { tags: tag } });
};

const sampleOne = async (
  mode: SiteMode,
  username: string,
  limit: number,
  label: string,
) => {
  progress.value = { message: `sampling ${label}`, progress: 0.2 };
  return sampleFavoriteProfile({
    mode,
    username,
    auth:
      mode === siteMode.activeMode
        ? toRaw(account.auth)
        : mode === "local"
          ? undefined
          : toRaw(account.auth),
    apiKey: account.auth?.api_key,
    userId: account.userId,
    hostFaCookiesAvailable: hostFaCookiesAvailable.value,
    baseUrl: urlStore.e621Url,
    settings: toRaw(main.$state),
    postListFetchLimit: postsStore.postListFetchLimit || 30,
    sfwOnly: postsStore.sfwOnly,
    limit,
    onProgress: (e) => {
      progress.value = { ...e, message: `${label}: ${e.message}` };
    },
    onWarning: (msg) => snackbar.addMessage(msg),
  });
};

const run = async () => {
  const thisGen = ++generation;
  loading.value = true;
  errorMessage.value = null;
  diff.value = null;
  try {
    if (showUsername.value && !rightName.value.trim()) {
      errorMessage.value = "Right username is required.";
      return;
    }
    const left = await sampleOne(
      siteMode.activeMode,
      leftName.value,
      960,
      "left",
    );
    if (thisGen !== generation) return;

    let right;
    if (showUsername.value) {
      right = await sampleOne(
        siteMode.activeMode,
        rightName.value,
        960,
        "right",
      );
    } else if (rightMode.value === "local") {
      right = await sampleOne("local", "", 960, "local");
    } else {
      right = await sampleOne(
        siteMode.activeMode,
        leftName.value,
        1920,
        "right",
      );
    }
    if (thisGen !== generation) return;

    diff.value = diffFavoriteTagCounts(left.profile, right.profile);
    progress.value = { message: "done", progress: 1 };
  } catch (err: unknown) {
    if (thisGen !== generation) return;
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (thisGen === generation) loading.value = false;
  }
};

onMounted(() => {
  void probeFaHostCookiesAvailable().then((ok) => {
    hostFaCookiesAvailable.value = ok;
    return run();
  });
});

watch(
  () =>
    [
      route.query.left,
      route.query.right,
      route.query.rightMode,
      siteMode.activeMode,
    ] as const,
  () => {
    void run();
  },
);
</script>
