<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" md="8" offset-md="2">
        <v-card>
          <v-card-title>Blacklist Coach</v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis text-start mb-4">
              Samples favorites, finds posts that already match your blacklist,
              and suggests single tags that would cover more of those posts —
              with a collateral preview on the rest of the sample.
            </p>
            <v-form @submit="submit">
              <v-text-field
                v-if="showUsername"
                v-model="username"
                append-icon="mdi-send"
                @click:append="submit"
                label="Username (optional if signed in)"
                persistent-hint
                hint="Uses this user’s favorites sample"
              />
              <div v-else class="text-body-2 text-medium-emphasis mb-4">
                {{ ownFavoritesLabel }}
                <span v-if="!submitGate.ok" class="text-error d-block mt-1">
                  {{ submitGate.message }}
                </span>
              </div>
              <v-btn
                color="primary"
                :disabled="!submitGate.ok"
                @click="submit"
              >
                Open Blacklist Coach
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.blacklistCoach"
      title="Blacklist Coach"
      v-model="tipOpen"
    >
      <p class="mb-3">
        Looks at favorites that already hit your blacklist and suggests tags you
        might add as single-line rules. Each suggestion shows how many extra
        (non-blacklisted) sample posts would also match.
      </p>
      <p class="mb-0">
        Apply only when the collateral count looks acceptable. Suggestions never
        invent Inkbunny/Weasyl favorite toggles or scrape new surfaces.
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

useHead({ title: "Blacklist Coach" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const username = ref(account.username || "");
const hostFaCookiesAvailable = ref(false);
const router = useRouter();
const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.blacklistCoach);

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

const submit = (event?: SubmitEvent | MouseEvent) => {
  event?.preventDefault?.();
  if (!submitGate.value.ok) return;
  const trimmed = username.value.trim();
  router.push({
    name: "BlacklistCoachResult",
    query: showUsername.value && trimmed ? { name: trimmed } : {},
  });
};
</script>
