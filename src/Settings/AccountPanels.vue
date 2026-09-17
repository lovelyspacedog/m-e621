<template>
  <v-expansion-panels v-model="openAccounts" variant="accordion" class="account-panels">
    <v-expansion-panel v-for="site in keySites" :key="site.mode" :value="site.mode">
      <v-expansion-panel-title>
        <account-panel-title
          :title="site.label"
          :status="keySiteStatus(site)"
          :connected="keySiteConnected(site)"
          :probe="verification[site.mode]"
        />
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <v-text-field
          v-if="site.showUsername"
          variant="filled"
          :label="`${site.label} username`"
          type="text"
          v-model="fields[site.mode].username"
          autocomplete="username"
        />
        <v-text-field
          variant="filled"
          :append-icon="showSecret[site.mode] ? 'mdi-eye-off' : 'mdi-eye'"
          :type="showSecret[site.mode] ? 'text' : 'password'"
          :label="`${site.label} API key`"
          v-model="fields[site.mode].apiKey"
          @click:append="showSecret[site.mode] = !showSecret[site.mode]"
          autocomplete="password"
          :counter="site.showUsername ? 24 : undefined"
        />
        <details class="text-left mb-2">
          <summary class="text-caption text-medium-emphasis account-help-summary">
            How to get an API key
          </summary>
          <p class="text-left text-caption mt-1 mb-0">
            <template v-if="site.mode === 'furbooru'">
              Go to <external-link href="https://furbooru.org/registration/edit" /> > API Key to generate your key.
              No username is required — the key identifies your account automatically.
            </template>
            <template v-else>
              Go to <external-link :href="`${fields[site.mode].baseUrl}users/home`" /> > Manage API Access to get the API key
            </template>
          </p>
        </details>
        <v-select
          v-if="site.apiItems"
          variant="filled"
          :label="`${site.label} API`"
          v-model="fields[site.mode].baseUrl"
          :items="site.apiItems"
        />
        <v-text-field
          v-if="site.apiItems"
          variant="filled"
          :label="`Custom ${site.label} URL`"
          type="text"
          v-model="fields[site.mode].baseUrl"
          autocomplete="url"
          hint="You might want to change your username/API key if you switch instances"
          persistent-hint
        />
        <div>
          <v-btn
            :disabled="site.showUsername ? (!fields[site.mode].username || !fields[site.mode].apiKey) : !fields[site.mode].apiKey"
            :loading="verification[site.mode].loading"
            :color="verification[site.mode].success ? 'success' : verification[site.mode].message ? 'error' : 'accent'"
            variant="text"
            @click="verifyKeySite(site.mode)"
          >
            Verify credentials
          </v-btn>
          <p v-if="verification[site.mode].message">
            {{ verification[site.mode].message }}
          </p>
          <details
            v-if="!verification[site.mode].success && verification[site.mode].message"
            class="text-left mt-1"
          >
            <summary class="text-caption text-medium-emphasis account-help-summary">
              Troubleshooting
            </summary>
            <p class="text-left text-caption mt-1 mb-0">
              A network error means that <i>something</i> did not work.
              Most likely, this was an authentication error.
              <template v-if="site.mode === 'furbooru'">
                Make sure you copied the Furbooru API key from
                <external-link href="https://furbooru.org/registration/edit" /> correctly.
              </template>
              <template v-else>
                Double check if the username is exactly the same as on
                <external-link :href="`${fields[site.mode].baseUrl}users/home`" /> and make sure you copied the API key correctly - it
                should be 24 characters long.
                <br />
                Due to a security policy (CORS), m-e621 cannot determine the cause of the error. There might be a
                general error with the network or {{ site.label }}.
              </template>
            </p>
          </details>
        </div>
        <v-btn
          class="mt-4"
          :disabled="site.showUsername ? !fields[site.mode].username : !fields[site.mode].apiKey"
          color="accent"
          variant="text"
          @click="toggleKeySiteFavs(site)"
        >
          {{ keySiteFavsExists(site) ? `Remove "${site.favsName}" saved search` : `Add "${site.favsName}" saved search` }}
        </v-btn>
      </v-expansion-panel-text>
    </v-expansion-panel>

    <account-inkbunny-panel />
    <account-fur-affinity-panel />
    <account-weasyl-panel />
    <account-itaku-panel />
    <account-sofurry-panel />
    <account-tailspace-panel />
  </v-expansion-panels>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import ExternalLink from "@/App/ExternalLink.vue";
import AccountPanelTitle from "./AccountPanelTitle.vue";
import AccountInkbunnyPanel from "./account/AccountInkbunnyPanel.vue";
import AccountFurAffinityPanel from "./account/AccountFurAffinityPanel.vue";
import AccountWeasylPanel from "./account/AccountWeasylPanel.vue";
import AccountItakuPanel from "./account/AccountItakuPanel.vue";
import AccountSofurryPanel from "./account/AccountSofurryPanel.vue";
import AccountTailspacePanel from "./account/AccountTailspacePanel.vue";
import {
  clearAuthProbe,
  emptyAuth,
  markAuthProbe,
} from "./accountAuth";
import { useAccountFields } from "./useAccountFields";
import { useMainStore } from "@/services";
import { liveAccount, liveSearches, profileHasAuthMaterial } from "@/services/siteProfiles";
import { searchesHaveTag, toggleSearchTag } from "@/services/savedSearchNormalize";
import { getApiService } from "@/worker/services";

const main = useMainStore();

type KeySiteMode = "e621" | "e6ai" | "furbooru";
type AccountMode =
  | KeySiteMode
  | "inkbunny"
  | "furaffinity"
  | "weasyl"
  | "itaku"
  | "sofurry"
  | "tailspace";

type KeySite = {
  mode: KeySiteMode;
  label: string;
  showUsername: boolean;
  apiItems?: string[];
  favsName: string;
  favsTag: (username: string) => string;
};

const keySites: KeySite[] = [
  {
    mode: "e621",
    label: "e621",
    showUsername: true,
    apiItems: ["https://e621.net/", "https://e926.net/", "https://e6ai.net/"],
    favsName: "Favorites",
    favsTag: (username) => `fav:${username}`,
  },
  {
    mode: "e6ai",
    label: "e6ai",
    showUsername: true,
    apiItems: ["https://e6ai.net/"],
    favsName: "Favorites",
    favsTag: (username) => `fav:${username}`,
  },
  {
    mode: "furbooru",
    label: "Furbooru",
    showUsername: false,
    favsName: "My Faves",
    favsTag: () => "my:faves",
  },
];

const fields = {
  e621: useAccountFields("e621"),
  e6ai: useAccountFields("e6ai"),
  furbooru: useAccountFields("furbooru"),
};

const signedInModes = (): AccountMode[] => {
  const modes: AccountMode[] = [
    "e621",
    "e6ai",
    "furbooru",
    "inkbunny",
    "furaffinity",
    "weasyl",
    "itaku",
    "sofurry",
    "tailspace",
  ];
  return modes.filter((mode) => {
    const account = liveAccount(main.$state, mode);
    return !!(account.username || account.apiKey);
  });
};

const openAccounts = ref<AccountMode | undefined>(signedInModes()[0]);
const showSecret = reactive<Record<KeySiteMode, boolean>>({
  e621: false,
  e6ai: false,
  furbooru: false,
});

const verification = reactive<Record<KeySiteMode, ReturnType<typeof emptyAuth>>>({
  e621: emptyAuth(),
  e6ai: emptyAuth(),
  furbooru: emptyAuth(),
});

const keySiteConnected = (site: KeySite) =>
  profileHasAuthMaterial(site.mode, fields[site.mode]);

const keySiteStatus = (site: KeySite) => {
  const account = fields[site.mode];
  if (!profileHasAuthMaterial(site.mode, account)) return "No credentials saved";
  if (site.mode === "furbooru") return "API key saved";
  return account.username ? `Signed in as ${account.username}` : "Credentials saved";
};

const keySiteFavsTag = (site: KeySite) => site.favsTag(fields[site.mode].username);
const keySiteFavsExists = (site: KeySite) =>
  searchesHaveTag(liveSearches(main.$state, site.mode), keySiteFavsTag(site));
const keySiteFavsLabel = (site: KeySite) =>
  site.mode === "furbooru"
    ? site.favsName
    : `${site.favsName} (${fields[site.mode].username})`;

const toggleKeySiteFavs = (site: KeySite) => {
  const tag = keySiteFavsTag(site);
  if (!tag) return;
  toggleSearchTag(liveSearches(main.$state, site.mode), tag, keySiteFavsLabel(site));
};

const verifyKeySite = async (mode: KeySiteMode) => {
  const site = fields[mode];
  verification[mode].loading = true;
  try {
    const service = await getApiService();
    await service.verifyAccount({
      username: site.username,
      apiKey: site.apiKey,
      baseUrl: site.baseUrl,
      mode,
    });
    markAuthProbe(verification[mode], true, "Credentials are valid");
  } catch (e: any) {
    console.dir(e);
    markAuthProbe(
      verification[mode],
      false,
      `Credentials are invalid: ${e.message || e}`,
    );
  } finally {
    verification[mode].loading = false;
  }
};

for (const mode of ["e621", "e6ai", "furbooru"] as const) {
  watch(
    () => [fields[mode].username, fields[mode].apiKey],
    () => {
      clearAuthProbe(verification[mode]);
    },
  );
}
</script>

<style scoped>
.account-panels {
  width: 100%;
}
.account-panels :deep(.v-expansion-panel) {
  background: transparent;
}
.account-help-summary {
  cursor: pointer;
  user-select: none;
}
</style>
