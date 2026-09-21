<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" md="8" offset-md="2">
        <v-card>
          <v-card-title>Favorite Analyzer</v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis text-start mb-4">
              Samples favorites and ranks tags by how often they appear, so you
              can see which themes show up most. From the results you can copy
              top tags, export JSON, or open the same profile in Post Suggester.
            </p>
            <v-form @submit="submit">
              <v-text-field
                v-if="showUsername"
                v-model="username"
                append-icon="mdi-send"
                @click:append="submit"
                :label="usernameFieldLabel"
                :hint="usernameFieldHint"
                persistent-hint
              />
              <div v-else class="text-body-2 text-medium-emphasis mb-4">
                {{ ownFavoritesLabel }}
                <span v-if="!submitGate.ok" class="text-error d-block mt-1">
                  {{ submitGate.message }}
                </span>
              </div>
              <v-btn
                v-if="!showUsername"
                color="primary"
                class="mb-2"
                :disabled="!submitGate.ok"
                @click="submit"
              >
                Analyze favorites
              </v-btn>
              <p
                v-if="showUsername && !submitGate.ok"
                class="text-error text-body-2 text-start mt-2 mb-0"
              >
                {{ submitGate.message }}
              </p>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.favoritesAnalyzer"
      title="Favorite Analyzer"
      v-model="analyzerTipOpen"
    >
      <p class="mb-3">
        Takes a sample of favorites and counts how often each tag appears, so
        you can see which themes show up most (artists, characters, species,
        and so on).
      </p>
      <p class="mb-3">
        Pick another username where the site supports public favorites; on
        other sites it uses your signed-in account. Federated merges each
        enabled child’s favorites; Local uses your library favorites.
      </p>
      <p class="mb-0">
        From the results you can copy top tags, export JSON, or open the same
        profile in Post Suggester to get ranked recommendations.
      </p>
    </TipDialog>
  </v-container>
</template>

<script setup lang="ts">
import { useAccountStore, useSiteModeStore } from "@/services";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";
import {
  favoriteToolSubmitGate,
  probeFaHostCookiesAvailable,
} from "@/misc/util/favoriteAuthGate";
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";

useHead({ title: "Favorite Analyzer" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const username = ref(account.username || "");
const hostFaCookiesAvailable = ref(false);
const router = useRouter();
const { open: analyzerTipOpen, tryOpen: tryAnalyzerTip } = useTipOpen(
  TIP_IDS.favoritesAnalyzer,
);

const refreshFaHostCookies = async () => {
  if (siteMode.activeMode !== "furaffinity") {
    hostFaCookiesAvailable.value = false;
    return;
  }
  hostFaCookiesAvailable.value = await probeFaHostCookiesAvailable();
};

onMounted(() => {
  tryAnalyzerTip();
  void refreshFaHostCookies();
});

watch(
  () => siteMode.activeMode,
  () => {
    void refreshFaHostCookies();
  },
);

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

const usernameFieldLabel = computed(() =>
  submitGate.value.ok || username.value.trim()
    ? "Username (optional if signed in)"
    : "Username",
);

const usernameFieldHint = computed(() =>
  "Public favorites for this user, or leave blank for your own when signed in",
);

const ownFavoritesLabel = computed(() => {
  if (siteMode.activeMode === "local") return "Using library favorites";
  if (siteMode.activeMode === "unified") {
    return "Using favorites from each enabled Federated child";
  }
  return "Using logged-in favorites";
});

const query = computed<RouteLocationRaw>(() => {
  const trimmed = username.value.trim();
  return {
    name: "FavoritesAnalyzerResult",
    query: showUsername.value && trimmed ? { name: trimmed } : {},
  };
});

const submit = async (event?: SubmitEvent | MouseEvent) => {
  event?.preventDefault?.();
  if (!submitGate.value.ok) return;
  router.push(query.value);
};
</script>
