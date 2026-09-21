<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" md="8" offset-md="2">
        <v-card>
          <v-card-title>Similar Artists</v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis text-start mb-4">
              From a favorites sample, find artists who often appear on the same
              posts as a seed artist you like.
            </p>
            <v-form @submit.prevent="submit">
              <v-text-field
                v-if="showUsername"
                v-model="username"
                label="Username (optional if signed in)"
                class="mb-2"
              />
              <v-text-field
                v-model="seed"
                label="Seed artist tag"
                hint="e.g. the artist name as it appears on posts"
                persistent-hint
                class="mb-2"
              />
              <v-btn
                color="primary"
                :disabled="!canSubmit"
                @click="submit"
              >
                Find similar
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
      :tip-id="TIP_IDS.similarArtists"
      title="Similar Artists"
      v-model="tipOpen"
    >
      <p class="mb-0">
        Counts how often other artists share posts with your seed artist in a
        favorites sample. Open an artist to search Posts, or send seeds into
        Post Suggester.
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
import { useRouter } from "vue-router";

useHead({ title: "Similar Artists" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const username = ref(account.username || "");
const seed = ref("");
const hostFaCookiesAvailable = ref(false);
const router = useRouter();
const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.similarArtists);

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

const canSubmit = computed(
  () => submitGate.value.ok && !!seed.value.trim(),
);

const submit = () => {
  if (!canSubmit.value) return;
  router.push({
    name: "SimilarArtistsResult",
    query: {
      seed: seed.value.trim(),
      ...(showUsername.value && username.value.trim()
        ? { name: username.value.trim() }
        : {}),
    },
  });
};
</script>
