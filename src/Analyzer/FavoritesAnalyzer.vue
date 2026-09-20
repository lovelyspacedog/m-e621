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
                label="Username"
                hint="Public favorites for this user"
                persistent-hint
              />
              <div v-else class="text-body-2 text-medium-emphasis mb-4">
                {{ ownFavoritesLabel }}
                <span v-if="!canSubmitOwn" class="text-error d-block mt-1">
                  Sign in for this site to analyze favorites.
                </span>
              </div>
              <v-btn
                v-if="!showUsername"
                color="primary"
                class="mb-2"
                :disabled="!canSubmitOwn"
                @click="submit"
              >
                Analyze favorites
              </v-btn>
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
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";

useHead({ title: "Favorite Analyzer" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const username = ref(account.username || "");
const router = useRouter();
const { open: analyzerTipOpen, tryOpen: tryAnalyzerTip } = useTipOpen(
  TIP_IDS.favoritesAnalyzer,
);
onMounted(() => tryAnalyzerTip());

const showUsername = computed(() =>
  modeSupportsOtherUserFavorites(siteMode.activeMode),
);

const ownFavoritesLabel = computed(() => {
  if (siteMode.activeMode === "local") return "Using library favorites";
  if (siteMode.activeMode === "unified") {
    return "Using favorites from each enabled Federated child";
  }
  return "Using logged-in favorites";
});

const canSubmitOwn = computed(() => {
  if (siteMode.activeMode === "local") return true;
  if (siteMode.activeMode === "furaffinity") return true;
  if (siteMode.activeMode === "unified") return true;
  return Boolean(account.auth?.api_key);
});

const query = computed<RouteLocationRaw>(() => ({
  name: "FavoritesAnalyzerResult",
  query: showUsername.value ? { name: username.value.trim() } : {},
}));

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
