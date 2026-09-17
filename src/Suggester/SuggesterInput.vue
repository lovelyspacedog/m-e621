<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" md="8" offset-md="2">
        <v-card>
          <v-card-text>
            <v-form @submit="submit">
              <v-text-field
                v-if="showUsername"
                v-model="username"
                append-icon="mdi-send"
                @click:append="submit"
                label="Username"
              />
              <div v-else class="text-body-2 text-medium-emphasis mb-4">
                {{
                  siteMode.isUnified
                    ? "Using favorites from each enabled Federated child"
                    : "Using logged-in favorites"
                }}
                <span v-if="!canSubmitOwn" class="text-error d-block mt-1">
                  Sign in for this site to run Post Suggester.
                </span>
              </div>
              <v-btn
                v-if="!showUsername"
                color="primary"
                class="mb-4"
                :disabled="!canSubmitOwn"
                @click="submit"
              >
                Suggest posts
              </v-btn>
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
        Suggests posts from weighted tag categories based on favorites (your
        login, another user’s public favorites where supported, Federated
        children, or Local).
      </p>
      <p class="mb-0">
        Adjust the sliders to bias which tag types matter more. Some modes only
        support your own favorites; Federated uses each enabled child’s auth.
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

useHead({ title: "Post Suggester" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const username = ref(account.username || "");
const router = useRouter();
const { open: suggesterTipOpen, tryOpen: trySuggesterTip } = useTipOpen(
  TIP_IDS.postSuggester,
);
onMounted(() => trySuggesterTip());

const showUsername = computed(() =>
  modeSupportsOtherUserFavorites(siteMode.activeMode),
);

const canSubmitOwn = computed(() => {
  if (siteMode.activeMode === "local") return true;
  if (siteMode.activeMode === "furaffinity") return true;
  // Federated uses per-child credentials (same as Favorite Analyzer).
  if (siteMode.activeMode === "unified") return true;
  return Boolean(account.auth?.api_key);
});

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
  },
);

const query = computed<RouteLocationRaw>(() => {
  const weightEntries = Object.entries(sliders.value).filter(([key]) =>
    suggesterWeightCategories(siteMode.activeMode).includes(
      key as SuggesterWeightCategory,
    ),
  );
  return {
    name: "SuggesterResult",
    query: {
      ...(showUsername.value ? { name: username.value } : {}),
      ...Object.fromEntries(
        weightEntries.map(([key, value]) => [key, `${value}`]),
      ),
    },
  };
});

const submit = async (event?: SubmitEvent | MouseEvent) => {
  event?.preventDefault?.();
  if (showUsername.value) {
    if (!username.value.trim()) return;
  } else if (!canSubmitOwn.value) {
    return;
  }
  router.push(query.value);
};
</script>
