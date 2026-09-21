<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" md="8" offset-md="2">
        <v-card>
          <v-card-title>Artist Radar</v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis text-start mb-4">
              Ranks artists from your favorites, then checks each for posts newer
              than your last visit. Useful as a watchlist digest across sites.
            </p>
            <v-form @submit="submit">
              <v-text-field
                v-if="showUsername"
                v-model="username"
                append-icon="mdi-send"
                @click:append="submit"
                label="Username (optional if signed in)"
                hint="Public favorites for this user, or leave blank for your own"
                persistent-hint
              />
              <div v-else class="text-body-2 text-medium-emphasis mb-4">
                {{ ownFavoritesLabel }}
                <span v-if="!submitGate.ok" class="text-error d-block mt-1">
                  {{ submitGate.message }}
                </span>
              </div>
              <v-btn
                color="primary"
                class="mb-2"
                :disabled="!submitGate.ok"
                @click="submit"
              >
                Open Artist Radar
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
      :tip-id="TIP_IDS.artistRadar"
      title="Artist Radar"
      v-model="tipOpen"
    >
      <p class="mb-3">
        Counts which artists appear most in a favorites sample, then checks for
        newer posts since you last marked each artist as seen.
      </p>
      <p class="mb-0">
        Federated merges enabled children’s favorites. Local uses library
        favorites. Mark seen after you catch up so the next check only counts
        new work.
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

useHead({ title: "Artist Radar" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const username = ref(account.username || "");
const hostFaCookiesAvailable = ref(false);
const router = useRouter();
const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.artistRadar);

const refreshFaHostCookies = async () => {
  if (siteMode.activeMode !== "furaffinity") {
    hostFaCookiesAvailable.value = false;
    return;
  }
  hostFaCookiesAvailable.value = await probeFaHostCookiesAvailable();
};

onMounted(() => {
  tryOpen();
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
    name: "ArtistRadarResult",
    query: showUsername.value && trimmed ? { name: trimmed } : {},
  };
});

const submit = (event?: SubmitEvent | MouseEvent) => {
  event?.preventDefault?.();
  if (!submitGate.value.ok) return;
  router.push(query.value);
};
</script>
