<template>
<v-expansion-panel value="inkbunny">
  <v-expansion-panel-title>
    <account-panel-title
      title="Inkbunny"
      :status="inkbunnyStatus"
      :connected="inkbunnyLoggedIn"
      :probe="inkbunnyAuth"
    />
  </v-expansion-panel-title>
  <v-expansion-panel-text>
    <v-text-field
      variant="filled"
      label="Inkbunny username"
      type="text"
      v-model="fields.inkbunny.username"
      autocomplete="username"
      :disabled="inkbunnyLoggedIn"
    />
    <v-text-field
      v-if="!inkbunnyLoggedIn"
      variant="filled"
      :append-icon="showSecret.inkbunny ? 'mdi-eye-off' : 'mdi-eye'"
      :type="showSecret.inkbunny ? 'text' : 'password'"
      label="Inkbunny password"
      v-model="inkbunnyPassword"
      @click:append="showSecret.inkbunny = !showSecret.inkbunny"
      autocomplete="new-password"
    />
    <details class="text-left mb-2">
      <summary class="text-caption text-medium-emphasis account-help-summary">
        Login help
      </summary>
      <p class="text-left text-caption mt-1 mb-0">
        Enable API Access at <external-link href="https://inkbunny.net/account.php" />.
        If you set an Allowed IP Range, the server IP must be included
        (<external-link href="https://inkbunny.net/iprange.php" />).
        The password is used only to log in and is not saved.
      </p>
    </details>
    <div>
      <v-btn
        v-if="!inkbunnyLoggedIn"
        :disabled="!fields.inkbunny.username || !inkbunnyPassword"
        :loading="inkbunnyAuth.loading"
        :color="inkbunnyAuth.success ? 'success' : inkbunnyAuth.message ? 'error' : 'accent'"
        variant="text"
        @click="loginInkbunny"
      >
        Log in
      </v-btn>
      <v-btn
        v-else
        :loading="inkbunnyAuth.loading"
        color="accent"
        variant="text"
        @click="logoutInkbunny"
      >
        Log out
      </v-btn>
      <p v-if="inkbunnyAuth.message">{{ inkbunnyAuth.message }}</p>
    </div>
    <v-btn
      class="mt-4"
      :disabled="!inkbunnyLoggedIn"
      color="accent"
      variant="text"
      @click="toggleInkbunnyFollowingSearch"
    >
      {{ inkbunnyFollowingExists ? `Remove "Following" saved search` : `Add "Following" saved search` }}
    </v-btn>
    <v-btn
      class="mt-2"
      :disabled="!inkbunnyLoggedIn"
      color="accent"
      variant="text"
      @click="toggleInkbunnyUnreadSearch"
    >
      {{ inkbunnyUnreadExists ? `Remove "Unread" saved search` : `Add "Unread" saved search` }}
    </v-btn>
    <v-btn
      class="mt-2"
      :disabled="!inkbunnyLoggedIn"
      color="accent"
      variant="text"
      @click="toggleInkbunnyFavsSearch"
    >
      {{ inkbunnyFavsExists ? `Remove "My Favs" saved search` : `Add "My Favs" saved search` }}
    </v-btn>
    <v-btn
      class="mt-2"
      :disabled="!inkbunnyLoggedIn"
      :loading="inkbunnyWatchlistLoading"
      color="accent"
      variant="text"
      @click="addWatchlistSearches"
    >
      Add watchlist artists as saved searches
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
  addSearchTag,
  searchesHaveTag,
  toggleSearchTag,
} from "@/services/savedSearchNormalize";
import { getApiService } from "@/worker/services";


const main = useMainStore();
const fields = { inkbunny: useAccountFields("inkbunny") };
const showSecret = reactive({ inkbunny: false });
const inkbunnyPassword = ref("");
const inkbunnyWatchlistLoading = ref(false);
const inkbunnyAuth = ref(emptyAuth());
const inkbunnyLoggedIn = computed(
  () =>
    profileHasAuthMaterial("inkbunny", fields.inkbunny) &&
    !!fields.inkbunny.username &&
    fields.inkbunny.username.toLowerCase() !== "guest",
);
const inkbunnyStatus = computed(() =>
  inkbunnyLoggedIn.value
    ? `Signed in as ${fields.inkbunny.username}`
    : "No credentials saved",
);

const INKBUNNY_UNREAD_TAG = "unread:yes";
const INKBUNNY_FOLLOWING_TAG = "following:me";
const INKBUNNY_FAVS_TAG = "favs:me";
const inkbunnyUnreadExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_UNREAD_TAG),
);
const inkbunnyFollowingExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FOLLOWING_TAG),
);
const inkbunnyFavsExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FAVS_TAG),
);
const toggleInkbunnyUnreadSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_UNREAD_TAG, "Unread");
const toggleInkbunnyFollowingSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FOLLOWING_TAG, "Following");
const toggleInkbunnyFavsSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FAVS_TAG, "My Favs");

const loginInkbunny = async () => {
  if (!fields.inkbunny.username || !inkbunnyPassword.value) return;
  if (fields.inkbunny.username.toLowerCase() === "guest") {
    markAuthProbe(inkbunnyAuth.value, false, "Use a member account. Guest browsing needs no login.");
    return;
  }
  inkbunnyAuth.value.loading = true;
  inkbunnyAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginInkbunny({
      username: fields.inkbunny.username,
      password: inkbunnyPassword.value,
    });
    setLiveAccount(main.$state, "inkbunny", {
      username: result.username,
      apiKey: result.sid,
      userId: result.userId,
    });
    inkbunnyPassword.value = "";
    addSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FOLLOWING_TAG, "Following");
    addSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_UNREAD_TAG, "Unread");
    addSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FAVS_TAG, "My Favs");
    markAuthProbe(inkbunnyAuth.value, true, `Logged in as ${result.username}`);
  } catch (e: unknown) {
    markAuthProbe(inkbunnyAuth.value, false, e instanceof Error ? e.message : String(e));
  } finally {
    inkbunnyAuth.value.loading = false;
  }
};

const logoutInkbunny = async () => {
  inkbunnyAuth.value.loading = true;
  try {
    const service = await getApiService();
    if (fields.inkbunny.apiKey) {
      await service.logoutInkbunny({ sid: fields.inkbunny.apiKey });
    }
  } catch {
    // SID may already be dead; still clear local credentials
  } finally {
    setLiveAccount(main.$state, "inkbunny", {
      username: null,
      apiKey: null,
      userId: null,
    });
    inkbunnyPassword.value = "";
    inkbunnyAuth.value.loading = false;
    clearAuthProbe(inkbunnyAuth.value);
    inkbunnyAuth.value.message = "Logged out. Browsing as guest.";
  }
};

const addWatchlistSearches = async () => {
  if (!fields.inkbunny.apiKey) return;
  inkbunnyWatchlistLoading.value = true;
  try {
    const service = await getApiService();
    const watches = await service.getInkbunnyWatchlist({ sid: fields.inkbunny.apiKey });
    let added = 0;
    for (const watch of watches) {
      if (addSearchTag(liveSearches(main.$state, "inkbunny"), `user:${watch.username}`, watch.username)) {
        added += 1;
      }
    }
    inkbunnyAuth.value.message =
      added > 0
        ? `Added ${added} watchlist artist search${added === 1 ? "" : "es"}`
        : "No new watchlist artists to add";
  } catch (e: unknown) {
    inkbunnyAuth.value.message = e instanceof Error ? e.message : String(e);
  } finally {
    inkbunnyWatchlistLoading.value = false;
  }
};

watch(inkbunnyPassword, () => {
  clearAuthProbe(inkbunnyAuth.value);
});

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
