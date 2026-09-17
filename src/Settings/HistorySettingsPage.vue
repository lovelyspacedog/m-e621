<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <settings-page-title
          section="history"
          title="History & Saved Searches"
          color="green-darken-1"
          :chips="navChips"
        />

        <settings-group title="Saved Searches" anchor="saved">
          <settings-row stack>
            <profile-list-sync kind="searches" />
          </settings-row>
          <settings-row stack>
            <saved-search-list
              :entries="savedSearches"
              @delete-entry="deleteSavedSearch($event)"
              @click-entry="openSearch($event)"
            />
          </settings-row>
        </settings-group>

        <settings-group title="History" anchor="history">
          <settings-row title="Max history length" stack>
            <v-text-field
              type="number"
              v-model.number.lazy="maxLength"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </settings-row>
          <settings-row stack>
            <history-list
              :entries="entries"
              @delete-entry="deleteEntry($event)"
              @click-entry="openSearch($event)"
            />
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
import HistoryList from "../Tag/HistoryList.vue";
import { computed } from "vue";
import { useHistoryStore, useSavedSearchStore } from "@/services";
import SavedSearchList from "@/Tag/SavedSearchList.vue";
import ProfileListSync from "./ProfileListSync.vue";
import { useHead } from "@unhead/vue";
import { useRouter } from "vue-router";

useHead({ title: "History" });

const router = useRouter();

const history = useHistoryStore();
const savedSearchesStore = useSavedSearchStore();

const navChips: SettingsNavChip[] = [
  { label: "Saved", anchor: "saved" },
  { label: "History", anchor: "history" },
];

const openSearch = async (tags: string[]) => {
  router.push({
    name: "Posts",
    query: {
      tags: tags.join(" "),
    },
  });
};
const entries = history.entries;
const savedSearches = savedSearchesStore.entries;
const deleteSavedSearch = (idx: number) => savedSearchesStore.deleteEntry(idx);
const deleteEntry = (idx: number) => history.deleteEntry(idx);
const maxLength = computed<number>({
  get() {
    return history.maxLength;
  },
  set(value) {
    history.maxLength = value;
  },
});
</script>
