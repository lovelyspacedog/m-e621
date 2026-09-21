<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" md="8" offset-md="2">
        <v-card>
          <v-card-title>Post Suggester</v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis text-start mb-4">
              Builds a taste profile from favorites, then ranks new posts that
              share those tags (recent posts plus searches for your top tags).
              Already-favorited posts are skipped. Use the sliders to weight
              tag types — for example artist vs character.
            </p>
            <v-form @submit="submit">
              <v-text-field
                v-if="showUsername"
                v-model="username"
                append-icon="mdi-send"
                @click:append="submit"
                :label="usernameFieldLabel"
                :hint="usernameFieldHint"
                :persistent-hint="!!usernameFieldHint"
              />
              <div v-else class="text-body-2 text-medium-emphasis mb-4">
                {{
                  siteMode.isUnified
                    ? "Using favorites from each enabled Federated child"
                    : "Using logged-in favorites"
                }}
                <span v-if="!submitGate.ok" class="text-error d-block mt-1">
                  {{ submitGate.message }}
                </span>
              </div>
              <v-btn
                v-if="!showUsername"
                color="primary"
                class="mb-4"
                :disabled="!submitGate.ok"
                @click="submit"
              >
                Suggest posts
              </v-btn>
              <p
                v-if="showUsername && !submitGate.ok"
                class="text-error text-body-2 text-start mt-2 mb-0"
              >
                {{ submitGate.message }}
              </p>
            </v-form>
            <slider-group v-model="sliders" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.postSuggester"
      title="Post Suggester"
      v-model="suggesterTipOpen"
    >
      <p class="mb-3">
        Learns a taste profile from favorites (yours, another user’s public
        favorites where supported, Federated children, or your Local library),
        then finds posts you have not favorited yet that look similar.
      </p>
      <p class="mb-3">
        It mixes recent posts with searches for your most common tags, scores
        each candidate by how well its tags match that profile, and ranks the
        results. Already-favorited posts are skipped.
      </p>
      <p class="mb-0">
        Use the sliders to decide which tag types matter more (for example
        artist vs character). Some sites only support your own favorites;
        Federated uses each enabled child’s sign-in.
      </p>
    </TipDialog>
  </v-container>
</template>

<script setup lang="ts">
import { useAccountStore, useSiteModeStore } from "@/services";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";
import SliderGroup from "./SliderGroup.vue";
import { useHead } from "@unhead/vue";
import {
  defaultSuggesterWeights,
  suggesterWeightCategories,
  type SuggesterWeightCategory,
} from "@/misc/util/favoriteQuery";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";
import {
  favoriteToolSubmitGate,
  probeFaHostCookiesAvailable,
} from "@/misc/util/favoriteAuthGate";

useHead({ title: "Post Suggester" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const username = ref(account.username || "");
const hostFaCookiesAvailable = ref(false);
const router = useRouter();
const { open: suggesterTipOpen, tryOpen: trySuggesterTip } = useTipOpen(
  TIP_IDS.postSuggester,
);

const refreshFaHostCookies = async () => {
  if (siteMode.activeMode !== "furaffinity") {
    hostFaCookiesAvailable.value = false;
    return;
  }
  hostFaCookiesAvailable.value = await probeFaHostCookiesAvailable();
};

onMounted(() => {
  trySuggesterTip();
  void refreshFaHostCookies();
});

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
  showUsername.value
    ? "Leave blank to use your own favorites when signed in"
    : undefined,
);

const buildSliders = (mode: typeof siteMode.activeMode) => {
  const defaults = defaultSuggesterWeights(mode);
  const allowed = suggesterWeightCategories(mode);
  return Object.fromEntries(
    allowed.map((key) => [key, defaults[key]]),
  ) as Record<SuggesterWeightCategory, number>;
};

const sliders = ref(buildSliders(siteMode.activeMode));

watch(
  () => siteMode.activeMode,
  (mode) => {
    sliders.value = buildSliders(mode);
    void refreshFaHostCookies();
  },
);

const query = computed<RouteLocationRaw>(() => {
  const weightEntries = Object.entries(sliders.value).filter(([key]) =>
    suggesterWeightCategories(siteMode.activeMode).includes(
      key as SuggesterWeightCategory,
    ),
  );
  const trimmed = username.value.trim();
  return {
    name: "SuggesterResult",
    query: {
      ...(showUsername.value && trimmed ? { name: trimmed } : {}),
      ...Object.fromEntries(
        weightEntries.map(([key, value]) => [key, `${value}`]),
      ),
    },
  };
});

const submit = async (event?: SubmitEvent | MouseEvent) => {
  event?.preventDefault?.();
  if (!submitGate.value.ok) return;
  router.push(query.value);
};
</script>
