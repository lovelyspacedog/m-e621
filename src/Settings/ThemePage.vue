<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col cols="12" sm="10" offset-sm="1" lg="10" offset-lg="1">
        <settings-page-title
          section="appearance"
          title="Themes"
          color="pink-darken-1"
          back-to="/settings/appearance"
        />
        <v-row align="center" class="mt-1">
          <v-col cols="12" sm="6" md="4" lg="3" :key="idx" v-for="(theme, idx) in themes">
            <theme-preview @apply-theme="applyTheme(theme)" :theme="theme" />
          </v-col>
        </v-row>
        <v-btn
          class="ma-2"
          variant="outlined"
          block
          size="large"
          color="primary"
          :href="issueUrl"
          target="_blank"
        >
          <v-icon start>mdi-open-in-new</v-icon>
          Want your theme listed?
        </v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Theme } from "@/services";
import { useAppearanceStore } from "@/services";
import themes from "@/misc/data/themes.json";
import ThemePreview from "./ThemePreview.vue";
import SettingsPageTitle from "./SettingsPageTitle.vue";
import { createIssueLink } from "@/misc/util/git";
import { useHead } from "@unhead/vue";

useHead({ title: "Themes" });

const appearance = useAppearanceStore();

const applyTheme = (theme: Theme) => {
  appearance.applyTheme(theme);
};
const issueUrl = computed(() =>
  createIssueLink({
    title: "New theme: <your theme name here>",
    body: `Hi, I would like to propose adding a new theme:

\`\`\`json
${JSON.stringify(appearance.theme, null, 2)}
\`\`\`
`,
  }),
);
</script>
