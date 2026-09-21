<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" md="8" offset-md="2">
        <v-card>
          <v-card-title>Pool / Series Suggester</v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis text-start mb-4">
              Suggests pools and galleries matching top artists/characters from
              your favorites. Available where pools are supported
              (e621-family, Furbooru, Federated). Inkbunny has no list API.
            </p>
            <v-alert
              v-if="!poolsOk"
              type="info"
              density="compact"
              class="mb-4 text-start"
            >
              Switch to e621, e6ai, Furbooru, Inkbunny, or Federated to use this
              tool.
            </v-alert>
            <v-form v-else @submit.prevent="submit">
              <v-text-field
                v-if="showUsername"
                v-model="username"
                label="Username (optional if signed in)"
                class="mb-2"
              />
              <v-btn
                color="primary"
                :disabled="!submitGate.ok"
                @click="submit"
              >
                Suggest pools
              </v-btn>
              <p v-if="!submitGate.ok" class="text-error text-body-2 mt-2 mb-0">
                {{ submitGate.message }}
              </p>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.poolSeriesSuggester"
      title="Pool / Series Suggester"
      v-model="tipOpen"
    >
      <p class="mb-0">
        Seeds pool searches from your favorite artists and characters. Already
        watched pools are marked. No fake pools on sites without a pools API.
      </p>
    </TipDialog>
  </v-container>
</template>

<script setup lang="ts">
import { useAccountStore, useSiteModeStore } from "@/services";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import {
  modeSupportsOtherUserFavorites,
  modeSupportsPools,
} from "@/misc/util/siteCapabilities";
import {
  favoriteToolSubmitGate,
  probeFaHostCookiesAvailable,
} from "@/misc/util/favoriteAuthGate";
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

useHead({ title: "Pool / Series Suggester" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const username = ref(account.username || "");
const hostFaCookiesAvailable = ref(false);
const router = useRouter();
const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.poolSeriesSuggester);

const poolsOk = computed(() => modeSupportsPools(siteMode.activeMode));
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

const submit = () => {
  if (!poolsOk.value || !submitGate.value.ok) return;
  router.push({
    name: "PoolSeriesSuggesterResult",
    query:
      showUsername.value && username.value.trim()
        ? { name: username.value.trim() }
        : {},
  });
};
</script>
