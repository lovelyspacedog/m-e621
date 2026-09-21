<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <h1 class="text-h5 mb-2">Taste Pack</h1>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Export a portable JSON of your favorite-tag profile (and optional
          Suggester weights). Import to star top tags and open Post Suggester
          with those weights.
        </p>

        <v-tabs v-model="tab" class="mb-4">
          <v-tab value="export">Export</v-tab>
          <v-tab value="import">Import</v-tab>
        </v-tabs>

        <v-window v-model="tab">
          <v-window-item value="export">
            <v-text-field
              v-if="showUsername"
              v-model="username"
              label="Username (optional if signed in)"
              class="mb-2"
            />
            <v-btn
              color="primary"
              class="mb-2"
              :loading="exporting"
              :disabled="!submitGate.ok"
              @click="doExport"
            >
              Export Taste Pack
            </v-btn>
            <p v-if="!submitGate.ok" class="text-error text-body-2">
              {{ submitGate.message }}
            </p>
            <v-alert v-if="exportError" type="error" density="compact" class="mt-2">
              {{ exportError }}
            </v-alert>
            <v-alert
              v-if="exportOk"
              type="success"
              density="compact"
              class="mt-2"
            >
              Downloaded Taste Pack JSON.
            </v-alert>
          </v-window-item>

          <v-window-item value="import">
            <v-file-input
              v-model="file"
              accept="application/json,.json"
              label="Taste Pack JSON"
              prepend-icon="mdi-upload"
              class="mb-2"
              @update:model-value="onFile"
            />
            <v-textarea
              v-model="paste"
              label="Or paste JSON"
              rows="6"
              class="mb-2"
            />
            <div class="d-flex flex-wrap ga-2">
              <v-btn
                color="primary"
                :disabled="!importReady"
                @click="applyStars"
              >
                Star top tags
              </v-btn>
              <v-btn
                variant="tonal"
                :disabled="!importReady"
                @click="openSuggester"
              >
                Open in Suggester
              </v-btn>
            </div>
            <v-alert v-if="importError" type="error" density="compact" class="mt-2">
              {{ importError }}
            </v-alert>
            <v-alert
              v-if="importSummary"
              type="info"
              density="compact"
              class="mt-2"
            >
              {{ importSummary }}
            </v-alert>
          </v-window-item>
        </v-window>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.tastePack"
      title="Taste Pack"
      v-model="tipOpen"
    >
      <p class="mb-0">
        Version-1 JSON carries tag counts, optional Suggester weights, and a
        flattened top-tag list. Analyzer-style exports with a counts object can
        be wrapped or re-exported from here.
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
import { useFavoritesStore } from "@/services/FavoriteStore";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import {
  buildTastePack,
  parseTastePack,
  type TastePackV1,
} from "@/misc/util/discoveryTools";
import { sampleFavoriteProfile } from "@/misc/util/discoveryFavoriteSample";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";
import {
  favoriteToolSubmitGate,
  probeFaHostCookiesAvailable,
} from "@/misc/util/favoriteAuthGate";
import { defaultSuggesterWeights } from "@/misc/util/favoriteQuery";
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref, toRaw, watch } from "vue";
import { useRouter } from "vue-router";

useHead({ title: "Taste Pack" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const urlStore = useUrlStore();
const postsStore = usePostsStore();
const snackbar = useSnackbarStore();
const main = useMainStore();
const favorites = useFavoritesStore();
const router = useRouter();
const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.tastePack);

const tab = ref("export");
const username = ref(account.username || "");
const hostFaCookiesAvailable = ref(false);
const exporting = ref(false);
const exportError = ref<string | null>(null);
const exportOk = ref(false);
const file = ref<File[] | File | null>(null);
const paste = ref("");
const pack = ref<TastePackV1 | null>(null);
const importError = ref<string | null>(null);
const importSummary = ref<string | null>(null);

const showUsername = computed(() =>
  modeSupportsOtherUserFavorites(siteMode.activeMode),
);
const submitGate = computed(() =>
  favoriteToolSubmitGate({
    mode: siteMode.activeMode,
    username: username.value,
    apiKey: account.auth?.api_key,
    hostFaCookiesAvailable: hostFaCookiesAvailable.value,
  }),
);
const importReady = computed(() => !!pack.value);

onMounted(() => {
  tryOpen();
  void refreshFa();
});
watch(
  () => siteMode.activeMode,
  () => void refreshFa(),
);

const refreshFa = async () => {
  if (siteMode.activeMode !== "furaffinity") {
    hostFaCookiesAvailable.value = false;
    return;
  }
  hostFaCookiesAvailable.value = await probeFaHostCookiesAvailable();
};

const doExport = async () => {
  exporting.value = true;
  exportError.value = null;
  exportOk.value = false;
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
      onWarning: (msg) => snackbar.addMessage(msg),
    });
    const taste = buildTastePack({
      mode: siteMode.activeMode,
      username: username.value || null,
      sampleSize: sample.sampleSize,
      counts: sample.profile.counts,
      weights: defaultSuggesterWeights(siteMode.activeMode),
    });
    const blob = new Blob([JSON.stringify(taste, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taste-pack-${siteMode.activeMode}.json`;
    a.click();
    URL.revokeObjectURL(url);
    exportOk.value = true;
  } catch (err: unknown) {
    exportError.value = err instanceof Error ? err.message : String(err);
  } finally {
    exporting.value = false;
  }
};

const tryParse = (text: string) => {
  importError.value = null;
  importSummary.value = null;
  try {
    const parsed = JSON.parse(text);
    // Accept Analyzer-style { counts } by wrapping.
    if (parsed && typeof parsed === "object" && parsed.counts && !parsed.version) {
      pack.value = parseTastePack({
        version: 1,
        exportedAt: Date.now(),
        mode: parsed.mode,
        username: parsed.username,
        sampleSize: parsed.sampleSize,
        counts: parsed.counts,
      });
    } else {
      pack.value = parseTastePack(parsed);
    }
    importSummary.value = `Loaded pack${
      pack.value.mode ? ` (${pack.value.mode})` : ""
    }: ${pack.value.topTags?.length || 0} top tags`;
  } catch (err: unknown) {
    pack.value = null;
    importError.value = err instanceof Error ? err.message : String(err);
  }
};

const onFile = async (value: File | File[] | null) => {
  const f = Array.isArray(value) ? value[0] : value;
  if (!f) return;
  tryParse(await f.text());
};

watch(paste, (text) => {
  if (text.trim()) tryParse(text);
});

const applyStars = () => {
  if (!pack.value) return;
  let tags = pack.value.topTags;
  if (!tags?.length && pack.value.counts) {
    tags = [];
    for (const [category, bag] of Object.entries(pack.value.counts)) {
      if (!bag) continue;
      for (const [name, count] of Object.entries(bag)) {
        if (count) tags.push({ name, category, count });
      }
    }
    tags.sort((a, b) => b.count - a.count);
  }
  if (!tags?.length) {
    importError.value = "Pack has no tags to star.";
    return;
  }
  let n = 0;
  for (const t of tags.slice(0, 40)) {
    favorites.setFavorite(t.name, t.category || "general", true);
    n += 1;
  }
  snackbar.addMessage(`Starred ${n} tags`);
  importSummary.value = `Starred ${n} tags into Ungrouped`;
};

const openSuggester = () => {
  if (!pack.value) return;
  const q: Record<string, string> = {};
  const weights =
    pack.value.weights || defaultSuggesterWeights(siteMode.activeMode);
  for (const [k, v] of Object.entries(weights)) {
    if (typeof v === "number") q[k] = String(v);
  }
  router.push({ name: "SuggesterResult", query: q });
};
</script>
