<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" md="8" offset-md="2">
        <v-card>
          <v-card-title>Taste Diff</v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis text-start mb-4">
              Compare top tags from two favorites samples — you vs another user,
              or this site vs your Local library.
            </p>
            <v-form @submit="submit">
              <template v-if="showUsername">
                <v-text-field
                  v-model="leftName"
                  label="Left username (blank = you)"
                  class="mb-2"
                />
                <v-text-field
                  v-model="rightName"
                  label="Right username"
                  hint="Required — public favorites to compare against"
                  persistent-hint
                  class="mb-2"
                />
              </template>
              <template v-else>
                <div class="text-body-2 text-medium-emphasis mb-2 text-start">
                  Left: {{ ownFavoritesLabel }}
                </div>
                <v-radio-group v-model="rightSource" class="text-start mb-2">
                  <v-radio
                    v-if="siteMode.activeMode !== 'local'"
                    label="Local library favorites"
                    value="local"
                  />
                  <v-radio
                    label="Same site, larger sample (self check)"
                    value="self"
                  />
                </v-radio-group>
                <span v-if="!submitGate.ok" class="text-error text-body-2">
                  {{ submitGate.message }}
                </span>
              </template>
              <v-btn
                color="primary"
                class="mt-2"
                :disabled="!canSubmit"
                @click="submit"
              >
                Compare
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.tasteDiff"
      title="Taste Diff"
      v-model="tipOpen"
    >
      <p class="mb-3">
        Samples two favorites profiles and shows tags you share, tags only on
        the left, and tags only on the right.
      </p>
      <p class="mb-0">
        On sites with public favorites, leave the left blank for yourself and
        enter another username on the right. Elsewhere, compare against Local
        library favorites when available.
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

useHead({ title: "Taste Diff" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const leftName = ref(account.username || "");
const rightName = ref("");
const rightSource = ref<"local" | "self">(
  siteMode.activeMode === "local" ? "self" : "local",
);
const hostFaCookiesAvailable = ref(false);
const router = useRouter();
const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.tasteDiff);

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
    if (siteMode.activeMode === "local") rightSource.value = "self";
  },
);

const showUsername = computed(() =>
  modeSupportsOtherUserFavorites(siteMode.activeMode),
);

const submitGate = computed(() =>
  favoriteToolSubmitGate({
    mode: siteMode.activeMode,
    username: leftName.value,
    apiKey: account.auth?.api_key,
    hostFaCookiesAvailable: hostFaCookiesAvailable.value,
  }),
);

const ownFavoritesLabel = computed(() => {
  if (siteMode.activeMode === "local") return "Library favorites";
  if (siteMode.activeMode === "unified") {
    return "Federated favorites (enabled children)";
  }
  return "Logged-in favorites";
});

const canSubmit = computed(() => {
  if (!submitGate.value.ok) return false;
  if (showUsername.value) return !!rightName.value.trim();
  return true;
});

const submit = (event?: SubmitEvent | MouseEvent) => {
  event?.preventDefault?.();
  if (!canSubmit.value) return;
  if (showUsername.value) {
    router.push({
      name: "TasteDiffResult",
      query: {
        ...(leftName.value.trim() ? { left: leftName.value.trim() } : {}),
        right: rightName.value.trim(),
      },
    });
    return;
  }
  router.push({
    name: "TasteDiffResult",
    query: { rightMode: rightSource.value },
  });
};
</script>
