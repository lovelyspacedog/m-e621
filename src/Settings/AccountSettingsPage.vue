<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <settings-page-title section="account" title="API & Account" color="yellow-darken-3" />
        <settings-page-item title="Site" select>
          <v-btn-toggle
            :model-value="siteMode.activeMode"
            color="accent"
            density="comfortable"
            mandatory
            class="mb-2"
            @update:model-value="onModeChange"
          >
            <v-btn value="e621">e621</v-btn>
            <v-btn value="e6ai">e6ai</v-btn>
            <v-btn value="local">local</v-btn>
            <v-btn value="furbooru">Furbooru</v-btn>
          </v-btn-toggle>
          <p class="text-left">
            Each site keeps its own username, API key, starred tags, blacklist, saved searches, and history.
            Local mode reads a browse folder you pick (not the Save Locally folder). Switching clears the current post search.
          </p>
        </settings-page-item>
        <settings-page-item title="Local folder" select v-if="siteMode.isLocal">
          <p class="text-left">
            Local mode shows images and videos from this folder. Save Locally still uses its own folder in Post settings.
          </p>
          <local-folder-picker purpose="local" />
        </settings-page-item>
        <settings-page-item title="Credentials" select v-if="!siteMode.isLocal">
          <!-- Username: hidden for Furbooru (API key only) -->
          <v-text-field
            v-if="!siteMode.isFurbooru"
            variant="filled"
            :label="`${siteLabel} username`"
            type="text"
            v-model="username"
            autocomplete="username"
          />
          <v-text-field variant="filled" :append-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            :type="showPassword ? 'text' : 'password'" :label="`${siteLabel} API key`" v-model="apiKey"
            @click:append="showPassword = !showPassword" autocomplete="password" :counter="siteMode.isFurbooru ? undefined : 24" />
          <p class="text-left" v-if="!siteMode.isFurbooru">
            Go to <external-link :href="`${e621Url}users/home`" /> > Manage API Access to get the API key
          </p>
          <p class="text-left" v-else>
            Go to <external-link href="https://furbooru.org/registration/edit" /> > API Key to generate your key.
            No username is required — the key identifies your account automatically.
          </p>
          <div>
            <v-btn
              :disabled="siteMode.isFurbooru ? !apiKey : (!username || !apiKey)"
              :loading="verification.loading"
              :color="verification.success ? 'success' : verification.message ? 'error' : 'accent'"
              variant="text"
              @click="verifyCredentials"
            >
              Verify credentials
            </v-btn>
            <p v-if="verification.message">
              {{ verification.message }}
            </p>
            <p class="text-left" v-if="!verification.success && verification.message">
              A network error means that <i>something</i> did not work.
              Most likely, this was an authentication error.
              <template v-if="!siteMode.isFurbooru">
                Double check if the username is exactly the same as on
                <external-link :href="`${e621Url}users/home`" /> and make sure you copied the API key correctly - it
                should be 24 characters long.
                <br />
                Due to a security policy (CORS), Material e621 cannot determine the cause of the error. There might be a
                general error with the network or {{ siteLabel }}.
              </template>
              <template v-else>
                Make sure you copied the Furbooru API key from
                <external-link href="https://furbooru.org/registration/edit" /> correctly.
              </template>
            </p>
          </div>
          <v-btn v-if="!siteMode.isFurbooru" class="mt-4" :disabled="!username" color="accent" variant="text" @click="toggleFavoritesMenuItem">
            {{ usernameSavedSearchExists ? `Remove "Favorites" saved search` : `Add "Favorites" saved search` }}
          </v-btn>
          <v-btn v-else class="mt-4" :disabled="!apiKey" color="accent" variant="text" @click="toggleFurbooruFavoritesMenuItem">
            {{ furbooruFavsSearchExists ? `Remove "My Faves" saved search` : `Add "My Faves" saved search` }}
          </v-btn>
        </settings-page-item>
        <settings-page-item title="API" select v-if="!siteMode.isLocal && !siteMode.isFurbooru">
          <v-select variant="filled" :label="`${siteLabel} API`" type="text" v-model="e621Url"
            :items="apiUrlItems" />
          <v-text-field variant="filled" :label="`Custom ${siteLabel} URL`" type="text" v-model="e621Url" autocomplete="url"
            hint="You might want to change your username/API key if you switch instances" persistent-hint />
          <v-text-field variant="filled" label="Favorites API" type="text" v-model="proxyUrl" autocomplete="url" />
          <p class="text-left">
            Favorites are proxied through this app's <code>/api/</code> so they
            work on this host. The old public Vercel proxy only allows the
            original Material e621 websites, which is why it returns
            “Failed to fetch” here.
          </p>
        </settings-page-item>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import SettingsPageTitle from "./SettingsPageTitle.vue";
import SettingsPageItem from "./SettingsPageItem.vue";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ExternalLink from "@/App/ExternalLink.vue";
import LocalFolderPicker from "./LocalFolderPicker.vue";
import { useAccountStore, useSavedSearchStore, useSiteModeStore, useUrlStore } from "@/services";
import type { SavedSearchEntry, SiteMode } from "@/services/types";
import { getApiService } from "@/worker/services";
import { useHead } from "@unhead/vue";

useHead({ title: "Account Settings", });

const account = useAccountStore();
const url = useUrlStore();
const siteMode = useSiteModeStore();
const router = useRouter();
const showPassword = ref(false);

const siteLabel = computed(() => siteMode.activeLabel);
const apiUrlItems = computed(() =>
  siteMode.activeMode === "e6ai"
    ? ["https://e6ai.net/"]
    : ["https://e621.net/", "https://e926.net/", "https://e6ai.net/"],
);

const onModeChange = (mode: SiteMode | null) => {
  if (!mode || mode === siteMode.activeMode) return;
  siteMode.setMode(mode);
  router.push({ name: "Posts", query: {} });
};

const username = computed<string>({
  get() {
    return account.username || "";
  },
  set(value) {
    account.username = value ? value : null;
  },
});

const apiKey = computed<string>({
  get() {
    return account.apiKey || "";
  },
  set(value) {
    account.apiKey = value ? value : null;
  },
});

const e621Url = computed<string>({
  get() {
    return url.e621Url
  },
  set(value) {
    url.e621Url = value;
  },
});

const proxyUrl = computed<string>({
  get() {
    return url.proxyUrl
  },
  set(value) {
    url.proxyUrl = value;
  },
});

const findSavedSearch = (e: SavedSearchEntry) => e.tags.length === 1 && e.tags[0] === usernameSavedSearchTag.value;
const savedSearches = useSavedSearchStore();
const usernameSavedSearchTag = computed(() => `fav:${username.value}`);
const usernameSavedSearchExists = computed(() =>
  !!savedSearches.entries.find(findSavedSearch)
)

const toggleFavoritesMenuItem = () => {
  if (usernameSavedSearchExists.value) {
    savedSearches.deleteEntry(savedSearches.entries.findIndex(findSavedSearch))
  } else {
    savedSearches.addEntry([usernameSavedSearchTag.value], `Favorites (${username.value})`)
  }
}

// Furbooru: "my:faves" saved search
const FURBOORU_FAVES_TAG = "my:faves";
const furbooruFavsSearchExists = computed(() =>
  !!savedSearches.entries.find((e) => e.tags.length === 1 && e.tags[0] === FURBOORU_FAVES_TAG)
);
const toggleFurbooruFavoritesMenuItem = () => {
  const idx = savedSearches.entries.findIndex((e) => e.tags.length === 1 && e.tags[0] === FURBOORU_FAVES_TAG);
  if (idx >= 0) {
    savedSearches.deleteEntry(idx);
  } else {
    savedSearches.addEntry([FURBOORU_FAVES_TAG], "My Faves");
  }
};

const verification = ref({
  success: false,
  loading: false,
  message: "",
});
const verifyCredentials = async () => {
  verification.value.loading = true;
  try {
    const service = await getApiService();
    await service.verifyAccount({
      username: username.value,
      apiKey: apiKey.value,
      baseUrl: url.e621Url,
    });
    verification.value.success = true;
    verification.value.message = "Credentials are valid";
  } catch (e: any) {
    console.dir(e);
    verification.value.success = false;
    verification.value.message = `Credentials are invalid: ${e.message || e}`;
  } finally {
    verification.value.loading = false;
  }
};

watch(username, () => {
  verification.value.message = "";
  verification.value.success = false;
});
watch(apiKey, () => {
  verification.value.message = "";
  verification.value.success = false;
});

</script>
