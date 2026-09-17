<template>
<v-expansion-panel value="itaku">
  <v-expansion-panel-title>
    <account-panel-title
      title="Itaku"
      :status="itakuStatus"
      :connected="itakuConnected"
      :probe="itakuAuth"
    />
  </v-expansion-panel-title>
  <v-expansion-panel-text>
    <v-text-field
      variant="filled"
      label="Itaku username (from verify)"
      type="text"
      v-model="fields.itaku.username"
      autocomplete="username"
      readonly
    />
    <v-text-field
      variant="filled"
      :append-icon="showSecret.itaku ? 'mdi-eye-off' : 'mdi-eye'"
      :type="showSecret.itaku ? 'text' : 'password'"
      label="Itaku auth token"
      v-model="fields.itaku.apiKey"
      @click:append="showSecret.itaku = !showSecret.itaku"
      autocomplete="off"
    />
    <details class="text-left mb-2">
      <summary class="text-caption text-medium-emphasis account-help-summary">
        How to get a token
      </summary>
      <p class="text-left text-caption mt-1 mb-0">
        In a logged-in Itaku browser tab, open DevTools → Network → any
        <code>/api/</code> request → copy the
        <code>Authorization: Token …</code> value (with or without the
        <code>Token</code> prefix). Guest browse works without a token;
        login unlocks stars and following.
      </p>
    </details>
    <div>
      <v-btn
        :disabled="!fields.itaku.apiKey"
        :loading="itakuAuth.loading"
        :color="itakuAuth.success ? 'success' : itakuAuth.message ? 'error' : 'accent'"
        variant="text"
        @click="verifyItaku"
      >
        Verify token
      </v-btn>
      <p v-if="itakuAuth.message">{{ itakuAuth.message }}</p>
    </div>
    <v-btn
      class="mt-4"
      :disabled="!fields.itaku.apiKey"
      color="accent"
      variant="text"
      @click="toggleItakuStarsSearch"
    >
      {{ itakuStarsExists ? `Remove "My Stars" saved search` : `Add "My Stars" saved search` }}
    </v-btn>
    <v-btn
      class="mt-2"
      :disabled="!fields.itaku.apiKey"
      color="accent"
      variant="text"
      @click="toggleItakuFollowingSearch"
    >
      {{ itakuFollowingExists ? `Remove "Following" saved search` : `Add "Following" saved search` }}
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
import { liveSearches, setLiveAccount, profileHasAuthMaterial } from "@/services/siteProfiles";
import {
  searchesHaveTag,
  toggleSearchTag,
} from "@/services/savedSearchNormalize";
import { getApiService } from "@/worker/services";


const main = useMainStore();
const fields = { itaku: useAccountFields("itaku") };
const showSecret = reactive({ itaku: false });
const itakuAuth = ref(emptyAuth());
const itakuConnected = computed(() =>
  profileHasAuthMaterial("itaku", fields.itaku),
);
const itakuStatus = computed(() =>
  itakuConnected.value
    ? fields.itaku.username
      ? `Signed in as ${fields.itaku.username}`
      : "Token saved"
    : "No credentials saved",
);
const ITAKU_STARS_TAG = "stars:me";
const ITAKU_FOLLOWING_TAG = "following:me";
const itakuStarsExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "itaku"), ITAKU_STARS_TAG),
);
const itakuFollowingExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "itaku"), ITAKU_FOLLOWING_TAG),
);
const toggleItakuStarsSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "itaku"), ITAKU_STARS_TAG, "My Stars");
const toggleItakuFollowingSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "itaku"), ITAKU_FOLLOWING_TAG, "Following");

const verifyItaku = async () => {
  if (!fields.itaku.apiKey) return;
  itakuAuth.value.loading = true;
  itakuAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.verifyAccount({
      username: fields.itaku.username || "",
      apiKey: fields.itaku.apiKey,
      baseUrl: "https://itaku.ee/",
      mode: "itaku",
    });
    if (result && typeof result === "object") {
      setLiveAccount(main.$state, "itaku", {
        username: result.username,
        apiKey: fields.itaku.apiKey,
        userId: result.userId,
      });
      fields.itaku.username = result.username;
      markAuthProbe(itakuAuth.value, true, `Signed in as ${result.username}`);
    } else {
      markAuthProbe(itakuAuth.value, true, "Token is valid");
    }
  } catch (e: any) {
    markAuthProbe(itakuAuth.value, false, e?.message || String(e));
  } finally {
    itakuAuth.value.loading = false;
  }
};

watch(
  () => [fields.itaku.username, fields.itaku.apiKey],
  () => {
    clearAuthProbe(itakuAuth.value);
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
