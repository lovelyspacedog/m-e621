<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <settings-page-title
          section="account"
          title="API & Account"
          color="yellow-darken-3"
          :chips="navChips"
        />

        <settings-group title="Sites" anchor="sites">
          <settings-row stack>
            <p class="text-left text-body-2 mb-0">
              Each site keeps its own credentials, starred tags, blacklist, saved searches, and history.
              Pick a site in the sidebar; Federated mixes the children you enable below.
            </p>
            <v-btn
              class="mt-2 px-0"
              variant="text"
              color="accent"
              size="small"
              @click="showSitesMore = !showSitesMore"
            >
              {{ showSitesMore ? "Less" : "More" }}
            </v-btn>
            <v-expand-transition>
              <p v-if="showSitesMore" class="text-left text-caption text-medium-emphasis mt-1 mb-0">
                <template v-if="siteMode.supportsLocalMode">
                  Local browse folders are under Posts → Save &amp; Local (separate from Save Locally).
                </template>
                Tailspace login uses a password or a pasted <code>tailspace_session</code> cookie
                (password is not stored).
              </p>
            </v-expand-transition>
          </settings-row>
        </settings-group>

        <settings-group
          title="Copy starred tags / blacklist"
          description="One-shot copy into the currently active site mode."
          anchor="sync"
        >
          <settings-row :title="`Into ${activeModeLabel}`" stack>
            <div class="text-left mb-4">
              <div class="text-subtitle-2 mb-1">Starred tags</div>
              <profile-list-sync kind="favorites" />
            </div>
            <div class="text-left">
              <div class="text-subtitle-2 mb-1">Blacklist</div>
              <profile-list-sync kind="blacklist" />
            </div>
          </settings-row>
        </settings-group>

        <settings-group
          title="Federated feed"
          description="Uses each site's login when present, otherwise guest search. Following merges watch feeds from Inkbunny, FurAffinity, Itaku, and SoFurry only."
          anchor="unified"
        >
          <settings-row title="Source">
            <v-btn-toggle
              color="accent"
              density="compact"
              divided
              mandatory
              :model-value="siteMode.unifiedFeedSource"
              @update:model-value="onUnifiedFeedSource"
            >
              <v-btn value="search" size="small">Search</v-btn>
              <v-btn value="following" size="small">Following</v-btn>
            </v-btn-toggle>
          </settings-row>
          <settings-row title="Presets">
            <div class="d-flex flex-wrap ga-2">
              <v-btn
                size="small"
                :variant="siteMode.isUnifiedSitesPresetActive('default') ? 'flat' : 'tonal'"
                color="accent"
                :aria-pressed="siteMode.isUnifiedSitesPresetActive('default')"
                @click="siteMode.applyUnifiedSitesPreset('default')"
              >
                Defaults
              </v-btn>
              <v-btn
                size="small"
                :variant="siteMode.isUnifiedSitesPresetActive('authenticated') ? 'flat' : 'tonal'"
                color="accent"
                :aria-pressed="siteMode.isUnifiedSitesPresetActive('authenticated')"
                @click="siteMode.applyUnifiedSitesPreset('authenticated')"
              >
                Auth only
              </v-btn>
            </div>
          </settings-row>
          <settings-row
            v-for="child in unifiedChildren"
            :key="child"
            :title="unifiedChildLabel(child)"
            :description="
              siteMode.unifiedFeedSource === 'following' && !modeSupportsFollowing(child)
                ? 'Not used in Following'
                : undefined
            "
            switch
          >
            <v-switch
              :model-value="siteMode.unifiedSites[child]"
              :disabled="
                siteMode.unifiedFeedSource === 'following' &&
                !modeSupportsFollowing(child)
              "
              color="accent"
              hide-details
              density="compact"
              @update:model-value="siteMode.setUnifiedChild(child, !!$event)"
            />
          </settings-row>
        </settings-group>

        <settings-group title="Accounts" anchor="accounts">
          <settings-row stack>
            <account-panels />
          </settings-row>
        </settings-group>

        <settings-group
          title="Favorites proxy"
          description="Favorites are proxied through this app's /api/ so they work on this host."
          anchor="proxy"
        >
          <settings-row stack>
            <v-text-field
              variant="filled"
              label="Favorites API"
              type="text"
              v-model="proxyUrl"
              autocomplete="url"
              hide-details="auto"
            />
            <p class="text-left text-caption text-medium-emphasis mt-2 mb-0">
              The old public Vercel proxy only allows the original Material e621 websites, which is why it
              returns “Failed to fetch” here.
            </p>
          </settings-row>
        </settings-group>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import SettingsPageTitle, { type SettingsNavChip } from "./SettingsPageTitle.vue";
import SettingsGroup from "./SettingsGroup.vue";
import SettingsRow from "./SettingsRow.vue";
import ProfileListSync from "./ProfileListSync.vue";
import AccountPanels from "./AccountPanels.vue";
import { computed, ref } from "vue";
import { useSiteModeStore, useUrlStore } from "@/services";
import { UNIFIED_CHILD_MODES, type UnifiedFeedSource } from "@/services/types";
import { unifiedChildLabel } from "@/misc/util/postOrigin";
import { modeSupportsFollowing } from "@/misc/util/siteCapabilities";
import { useHead } from "@unhead/vue";

useHead({ title: "Account Settings" });

const url = useUrlStore();
const siteMode = useSiteModeStore();
const unifiedChildren = UNIFIED_CHILD_MODES;
const showSitesMore = ref(false);

const onUnifiedFeedSource = (value: unknown) => {
  if (value === "search" || value === "following") {
    siteMode.setUnifiedFeedSource(value as UnifiedFeedSource);
  }
};

const activeModeLabel = computed(() => unifiedChildLabel(siteMode.activeMode));

const navChips: SettingsNavChip[] = [
  { label: "Sites", anchor: "sites" },
  { label: "Sync", anchor: "sync" },
  { label: "Federated", anchor: "unified" },
  { label: "Accounts", anchor: "accounts" },
  { label: "Proxy", anchor: "proxy" },
];

const proxyUrl = computed<string>({
  get() {
    return url.proxyUrl;
  },
  set(value) {
    url.proxyUrl = value;
  },
});
</script>
