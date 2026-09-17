<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" md="8" offset-md="2">
        <v-card>
          <v-card-title>Favorite Analyzer</v-card-title>
          <v-card-text>
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
            <div class="text-caption text-medium-emphasis mt-2">
              Ranks tags by how often they appear in a sample of favorites.
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { useAccountStore, useSiteModeStore } from "@/services";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";

useHead({ title: "Favorite Analyzer" });

const account = useAccountStore();
const siteMode = useSiteModeStore();
const username = ref(account.username || "");
const router = useRouter();

const showUsername = computed(() =>
  modeSupportsOtherUserFavorites(siteMode.activeMode),
);

const ownFavoritesLabel = computed(() => {
  if (siteMode.activeMode === "local") return "Using library favorites";
  if (siteMode.activeMode === "unified") {
    return "Using favorites from each enabled Unified child";
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
  query: {
    ...(showUsername.value ? { name: username.value.trim() } : {}),
  },
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
