<template>
<v-expansion-panel value="weasyl">
  <v-expansion-panel-title>
    <account-panel-title
      title="Weasyl"
      :status="weasylStatus"
      :connected="weasylConnected"
      :probe="weasylAuth"
    />
  </v-expansion-panel-title>
  <v-expansion-panel-text>
    <v-text-field
      variant="filled"
      label="Weasyl username"
      type="text"
      v-model="fields.weasyl.username"
      autocomplete="username"
    />
    <v-text-field
      variant="filled"
      :append-icon="showSecret.weasyl ? 'mdi-eye-off' : 'mdi-eye'"
      :type="showSecret.weasyl ? 'text' : 'password'"
      label="Weasyl API key"
      v-model="fields.weasyl.apiKey"
      @click:append="showSecret.weasyl = !showSecret.weasyl"
      autocomplete="off"
    />
    <details class="text-left mb-2">
      <summary class="text-caption text-medium-emphasis account-help-summary">
        How to get an API key
      </summary>
      <p class="text-left text-caption mt-1 mb-0">
        Go to <external-link href="https://www.weasyl.com/control/apikeys" /> to generate an API key.
        Without a key, only SFW/general content is shown. The username is used to browse your favorites.
      </p>
    </details>
    <div>
      <v-btn
        :disabled="!fields.weasyl.apiKey"
        :loading="weasylAuth.loading"
        :color="weasylAuth.success ? 'success' : weasylAuth.message ? 'error' : 'accent'"
        variant="text"
        @click="verifyWeasyl"
      >
        Verify API key
      </v-btn>
      <p v-if="weasylAuth.message">{{ weasylAuth.message }}</p>
    </div>
    <v-btn
      class="mt-4"
      :disabled="!fields.weasyl.username"
      color="accent"
      variant="text"
      @click="toggleWeasylFavsSearch"
    >
      {{ weasylFavsExists ? `Remove "My Favs" saved search` : `Add "My Favs" saved search` }}
    </v-btn>
  </v-expansion-panel-text>
</v-expansion-panel>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import ExternalLink from "@/App/ExternalLink.vue";
import AccountPanelTitle from "../AccountPanelTitle.vue";
import {
  clearAuthProbe,
  emptyAuth,
  markAuthProbe,
} from "../accountAuth";
import { useAccountFields } from "../useAccountFields";
import { useMainStore } from "@/services";
import { liveSearches, profileHasAuthMaterial } from "@/services/siteProfiles";
import {
  searchesHaveTag,
  toggleSearchTag,
} from "@/services/savedSearchNormalize";
import { getApiService } from "@/worker/services";


const main = useMainStore();
const fields = { weasyl: useAccountFields("weasyl") };
const showSecret = reactive({ weasyl: false });
const weasylAuth = ref(emptyAuth());
const weasylConnected = computed(() =>
  profileHasAuthMaterial("weasyl", fields.weasyl),
);
const weasylStatus = computed(() =>
  weasylConnected.value
    ? fields.weasyl.username
      ? `Signed in as ${fields.weasyl.username}`
      : "API key saved"
    : "No credentials saved",
);
const WEASYL_FAVS_TAG = "favs:me";
const weasylFavsExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "weasyl"), WEASYL_FAVS_TAG),
);
const toggleWeasylFavsSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "weasyl"), WEASYL_FAVS_TAG, "My Favs");

const verifyWeasyl = async () => {
  if (!fields.weasyl.apiKey) return;
  weasylAuth.value.loading = true;
  weasylAuth.value.message = "";
  try {
    const service = await getApiService();
    await service.verifyAccount({
      username: fields.weasyl.username || "",
      apiKey: fields.weasyl.apiKey,
      baseUrl: "https://www.weasyl.com/",
      mode: "weasyl",
    });
    markAuthProbe(weasylAuth.value, true, "API key is valid");
  } catch (e: unknown) {
    markAuthProbe(weasylAuth.value, false, e instanceof Error ? e.message : String(e));
  } finally {
    weasylAuth.value.loading = false;
  }
};

watch(
  () => [fields.weasyl.username, fields.weasyl.apiKey],
  () => {
    clearAuthProbe(weasylAuth.value);
  },
);

</script>

<style scoped>
.account-help-summary {
  cursor: pointer;
  user-select: none;
}
.fill-width {
  width: 100%;
}
</style>
