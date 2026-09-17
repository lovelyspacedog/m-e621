<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <MigrationInfo />

        <v-text-field
          v-model="searchQuery"
          class="mb-3"
          variant="outlined"
          density="comfortable"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          label="Search settings"
          placeholder="autoplay, api key, data saver…"
        />

        <v-card v-if="!searchQuery.trim()">
          <v-list>
            <settings-page-section
              v-for="section in orderedSections"
              :key="section.section"
              :section="section.section"
              :title="section.title"
              :icon="section.icon"
              :color="section.color"
            >
              <v-list-item-subtitle v-if="sectionSubtitle(section.section)">
                {{ sectionSubtitle(section.section) }}
              </v-list-item-subtitle>
            </settings-page-section>
          </v-list>
        </v-card>

        <template v-else>
          <v-card v-if="matchedControls.length || matchedSections.length" class="mb-3">
            <v-list>
              <v-list-subheader v-if="matchedControls.length">Settings</v-list-subheader>
              <v-list-item
                v-for="entry in matchedControls"
                :key="`${entry.section}-${entry.hash}-${entry.label}`"
                :to="settingsHref(entry)"
              >
                <v-list-item-title>{{ entry.label }}</v-list-item-title>
                <v-list-item-subtitle>
                  {{ sectionTitle(entry.section) }}
                  <template v-if="entry.hash"> · {{ entry.hash }}</template>
                </v-list-item-subtitle>
                <template #append>
                  <v-icon>mdi-chevron-right</v-icon>
                </template>
              </v-list-item>

              <v-list-subheader v-if="matchedSections.length">Sections</v-list-subheader>
              <settings-page-section
                v-for="section in matchedSections"
                :key="section.section"
                :section="section.section"
                :title="section.title"
                :icon="section.icon"
                :color="section.color"
              />
            </v-list>
          </v-card>
          <v-card v-else>
            <v-card-text class="text-medium-emphasis">
              No settings match “{{ searchQuery.trim() }}”.
            </v-card-text>
          </v-card>
        </template>

        <v-card class="mt-3" v-if="githubInfoVisible">
          <v-card-title class="pb-1 pt-2">
            Found a bug or got an idea for a new feature?
          </v-card-title>
          <v-card-text class="py-0">
            Create, comment on, or react to issues on the m-e621 GitHub page!
          </v-card-text>
          <v-card-actions class="pb-2">
            <v-spacer />
            <v-btn @click="hideGithubInfo" size="small" variant="outlined" color="primary">
              Never show again
            </v-btn>
            <v-btn
              size="small"
              variant="outlined"
              color="primary"
              target="_blank"
              href="https://github.com/lovelyspacedog/m-e621/issues"
            >
              <v-icon start> mdi-open-in-new </v-icon>
              browse issues
            </v-btn>
            <v-btn
              size="small"
              variant="outlined"
              color="primary"
              target="_blank"
              href="https://github.com/lovelyspacedog/m-e621/issues/new/choose"
            >
              <v-icon start> mdi-open-in-new </v-icon>
              create issue
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { getGitInfo } from "@/misc/util/git";
import {
  useAccountStore,
  useAppearanceStore,
  useBlacklistStore,
  useHistoryStore,
  useMainStore,
  useShortcutStore,
} from "@/services";
import { liveAccount } from "@/services/siteProfiles";
import type { SiteMode } from "@/services/types";
import { computed, onMounted, ref } from "vue";
import { formatDistanceToNow } from "date-fns";
import SettingsPageSection from "./SettingsPageSection.vue";
import {
  SETTINGS_SECTIONS,
  matchSettingsQuery,
  settingsHref,
} from "./settingsIndex";
import { useHead } from "@unhead/vue";
import MigrationInfo from "@/Landing/MigrationInfo.vue";

useHead({ title: "Settings" });

const history = useHistoryStore();
const blacklist = useBlacklistStore();
const account = useAccountStore();
const shortcuts = useShortcutStore();
const appearance = useAppearanceStore();
const main = useMainStore();

const searchQuery = ref("");

onMounted(() => {
  window.scrollTo({ top: 0 });
});

const orderedSections = SETTINGS_SECTIONS;

const matchResult = computed(() => matchSettingsQuery(searchQuery.value));

const matchedControls = computed(() => matchResult.value.controls);

const matchedSections = computed(() => {
  const controlSections = new Set(matchedControls.value.map((c) => c.section));
  return SETTINGS_SECTIONS.filter(
    (s) =>
      matchResult.value.sections.includes(s.section) && !controlSections.has(s.section),
  );
});

const sectionTitle = (section: string) =>
  SETTINGS_SECTIONS.find((s) => s.section === section)?.title ?? section;

const connectedSiteCount = computed(() => {
  const modes: SiteMode[] = [
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
    const a = liveAccount(main.$state, mode);
    return !!(a.username || a.apiKey);
  }).length;
});

const lastUpdated = computed(() =>
  formatDistanceToNow(getGitInfo()[0].date, { addSuffix: true }),
);

const sectionSubtitle = (section: string): string | null => {
  switch (section) {
    case "info":
      return `Last update was ${lastUpdated.value}`;
    case "blacklist": {
      const n = blacklist.tags.length;
      return `${n} blacklist ${n === 1 ? "entry" : "entries"}`;
    }
    case "history": {
      const n = history.entries.length;
      return `${n} ${n === 1 ? "entry" : "entries"}`;
    }
    case "account": {
      if (account.username) return `Signed in as ${account.username}`;
      const n = connectedSiteCount.value;
      return n > 0
        ? `${n} site ${n === 1 ? "account" : "accounts"} connected`
        : "No sites connected";
    }
    case "shortcuts": {
      const n = shortcuts.shortcuts.length;
      return `${n} ${n === 1 ? "shortcut" : "shortcuts"} defined`;
    }
    case "posts": {
      const layout = main.posts.feedLayout === "grid" ? "Grid" : "List";
      return `${layout} feed · ${main.posts.postListFetchLimit} per page`;
    }
    case "appearance": {
      const scheme = appearance.colorScheme;
      if (scheme === "system") return "System color scheme";
      return scheme === "light" ? "Light theme" : "Dark theme";
    }
    case "restore":
      return "Backup includes credentials — use sanitized to strip secrets";
    default:
      return null;
  }
};

const hideGithubInfo = () => (appearance.hideGithubInfo = true);
const githubInfoVisible = computed(() => !appearance.hideGithubInfo);
</script>
