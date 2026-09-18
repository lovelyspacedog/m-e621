<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <settings-page-title
          section="blacklist"
          title="Blacklist"
          color="red-darken-1"
          :chips="navChips"
        />

        <active-mode-banner />

        <settings-group title="Sync" anchor="sync">
          <settings-row title="Copy from another site" stack>
            <profile-list-sync kind="blacklist" />
          </settings-row>
        </settings-group>

        <settings-group title="Mode" anchor="mode">
          <settings-row title="Display mode" stack>
            <v-select :items="modeItems" variant="outlined" hide-details density="comfortable" v-model="mode" />
          </settings-row>
          <settings-row
            title="Hide server-side blacklisted posts"
            description="Unless you are logged in, any posts containing the tag young and a rating other than safe is blacklisted"
            switch
          >
            <v-switch
              v-model="blacklistStore.hideServerSideBlacklisted"
              color="accent"
              hide-details
              density="compact"
            />
          </settings-row>
        </settings-group>

        <settings-group title="Suggestions" anchor="suggestions">
          <settings-row title="Frequently blacklisted tags" stack>
            <blacklist-suggestions
              :tags="suggestions"
              :blacklisted="blacklist"
              @add-tag="addTag(blacklist.length, $event)"
              @remove-tag="removeTag"
            />
          </settings-row>
        </settings-group>

        <settings-group
          title="Custom blacklist"
          description="Blacklisting works similarly to e621, but meta tags (except rating:) don't fully work."
          anchor="custom"
        >
          <settings-row stack>
            <!-- always empty list at the end to add new line -->
            <div v-for="(tags, index) in [...blacklist, []]" :key="index">
              <tag-search
                outlined
                :search-filters="false"
                class="mb-1"
                :tags="tags"
                @add-tag="addTag(index, $event)"
                @remove-tag="removeTag(index, $event)"
              />
            </div>
          </settings-row>
        </settings-group>

        <settings-group title="Import" anchor="import">
          <settings-row title="e621 blacklist import" stack>
            <v-textarea
              variant="outlined"
              :rows="6"
              v-model="blacklistImport"
              label="Paste blacklist here"
              hide-details
            />
            <v-btn variant="text" class="mt-1" color="accent" @click="doImport"> Import </v-btn>
          </settings-row>
        </settings-group>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.blacklistModes"
      title="Blacklist modes"
      v-model="blacklistTipOpen"
    >
      <p class="mb-3">
        Display mode chooses Hide, Blur, or Blackout for matching posts. Server-side
        hide also applies the site’s own blacklist rules when you are not logged in.
      </p>
      <p class="mb-0">
        Custom lines work like e621: each TagSearch row is one rule. Meta tags
        (except rating:) are limited. Edits apply to the active site profile.
      </p>
    </TipDialog>
  </v-container>
</template>

<script setup lang="ts">
import SettingsPageTitle, { type SettingsNavChip } from "./SettingsPageTitle.vue";
import SettingsGroup from "./SettingsGroup.vue";
import SettingsRow from "./SettingsRow.vue";
import ActiveModeBanner from "./ActiveModeBanner.vue";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- registered for <blacklist-suggestions> in template
import BlacklistSuggestions from "./BlacklistSuggestions.vue";
import ProfileListSync from "./ProfileListSync.vue";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import { computed, onMounted, ref } from "vue";
import blacklistSuggestions from "@/misc/data/blacklistSuggestions.json";
import TagSearch from "../Tag/TagSearch.vue";
import { BlacklistMode } from "@/services/types";
import { useBlacklistStore } from "@/services";
import { useHead } from "@unhead/vue";

useHead({ title: "Blacklist Settings" });

const blacklistStore = useBlacklistStore();
const { open: blacklistTipOpen, tryOpen: tryBlacklistTip } = useTipOpen(
  TIP_IDS.blacklistModes,
);
onMounted(() => tryBlacklistTip());

const navChips: SettingsNavChip[] = [
  { label: "Sync", anchor: "sync" },
  { label: "Mode", anchor: "mode" },
  { label: "Custom", anchor: "custom" },
  { label: "Import", anchor: "import" },
];

const modeItems = computed(() => [
  {
    title: "Hide",
    value: BlacklistMode.hide,
  },
  {
    title: "Blur",
    value: BlacklistMode.blur,
  },
  {
    title: "Blackout",
    value: BlacklistMode.blackout,
  },
]);

const mode = computed<BlacklistMode>({
  get() {
    return blacklistStore.mode;
  },
  set(value) {
    blacklistStore.mode = value;
  },
});

const blacklist = computed(() => blacklistStore.tags);

const blacklistImport = ref("");
const doImport = () => {
  const bl = blacklistImport.value
    .split("\n")
    .map((line) => line.trim().split(" ").map((tag) => tag.trim()));
  for (const line of bl) {
    const exists = !!blacklist.value.find((l) => l.join(" ") === line.join(" "));
    if (exists) continue;
    const index = blacklist.value.length;
    for (const tag of line) {
      blacklistStore.addTag(index, tag);
    }
  }
};

const suggestions = blacklistSuggestions;
const addTag = (index: number, tag: string) => blacklistStore.addTag(index, tag);
const removeTag = (index: number, tag: string) => blacklistStore.removeTag(index, tag);
</script>
