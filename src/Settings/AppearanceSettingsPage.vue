<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <settings-page-title
          section="appearance"
          title="Appearance"
          color="pink-darken-1"
          :chips="navChips"
        />

        <settings-group title="Colors" anchor="colors">
          <settings-row stack>
            <v-btn
              variant="outlined"
              block
              size="large"
              color="primary"
              to="/settings/appearance/themes"
              class="mb-2"
            >
              Browse themes
            </v-btn>
            <color-chooser label="Primary" v-model:color="appearance.primaryColor" />
            <color-chooser label="Secondary" v-model:color="appearance.secondaryColor" />
            <color-chooser label="Accent" v-model:color="appearance.accentColor" />
            <color-chooser label="Background" v-model:color="appearance.backgroundColor" />
            <color-chooser label="Sidebar" v-model:color="appearance.sidebarColor" />
            <color-chooser label="Toolbar" v-model:color="appearance.toolbarColor" />
          </settings-row>
          <settings-row
            title="Color scheme"
            description="System follows your OS light/dark preference."
            stack
          >
            <v-btn-toggle
              color="accent"
              density="compact"
              divided
              mandatory
              :model-value="appearance.colorScheme"
              @update:model-value="onColorScheme"
            >
              <v-btn value="system" size="small">System</v-btn>
              <v-btn value="dark" size="small">Dark</v-btn>
              <v-btn value="light" size="small">Light</v-btn>
            </v-btn-toggle>
          </settings-row>
        </settings-group>

        <settings-group title="Chrome" anchor="chrome">
          <settings-row title="Fullscreen image transitions" description="Change the image transitions" stack>
            <v-select
              :items="transitionItems"
              variant="outlined"
              v-model="appearance.fullscreenTransition"
              hide-details
              density="comfortable"
            />
            <transition-preview
              :transition-name="appearance.fullscreenTransition"
              :ratio="2"
              :directions="[
                'left',
                'right',
                'left',
                'right',
                'left',
                'left',
                'right',
                'right',
              ]"
              class="mt-3"
            />
          </settings-row>
          <settings-row
            title="Route transitions"
            description="Animation when navigating between pages. Disabled automatically when the OS requests reduced motion."
            stack
          >
            <v-select
              :items="transitionItems"
              variant="outlined"
              v-model="appearance.routeTransition"
              hide-details
              density="comfortable"
            />
          </settings-row>
          <settings-row title="Colored stripe indicating post rating" switch>
            <v-switch v-model="appearance.ratingStripe" color="accent" hide-details density="compact" />
          </settings-row>
          <settings-row title="Navigation" stack>
            <v-select
              :items="navigationTypeItems"
              variant="outlined"
              v-model="appearance.navigationType"
              hide-details
              density="comfortable"
            />
          </settings-row>
          <settings-row title="Logo" stack>
            <v-select
              :items="logoStyleItems"
              variant="outlined"
              v-model="appearance.logoStyle"
              hide-details
              density="comfortable"
            />
          </settings-row>
          <settings-row title="Paw cursor" description="Use the blue paw cursor throughout the app" switch>
            <v-switch
              v-model="appearance.pawCursor"
              color="accent"
              hide-details
              density="compact"
            />
          </settings-row>
        </settings-group>

        <settings-group
          title="Prompts"
          description="Dismissable banners and install prompts on the Settings hub and elsewhere."
          anchor="prompts"
        >
          <settings-row title="Hide install prompt" switch>
            <v-switch
              v-model="appearance.hideInstallPrompt"
              color="accent"
              hide-details
              density="compact"
            />
          </settings-row>
          <settings-row title="Hide GitHub info" switch>
            <v-switch
              v-model="appearance.hideGithubInfo"
              color="accent"
              hide-details
              density="compact"
            />
          </settings-row>
          <settings-row title="Hide Migration info" switch>
            <v-switch
              v-model="appearance.hideMigrationInfo"
              color="accent"
              hide-details
              density="compact"
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
import TransitionPreview from "./TransitionPreview.vue";
import { computed } from "vue";
import ColorChooser from "./ColorChooser.vue";
import transitions from "@/misc/data/transitions.json";
import { useAppearanceStore, type ColorScheme } from "@/services";
import { useHead } from "@unhead/vue";

useHead({
  title: "Appearance Settings",
});

const appearance = useAppearanceStore();

const navChips: SettingsNavChip[] = [
  { label: "Colors", anchor: "colors" },
  { label: "Chrome", anchor: "chrome" },
  { label: "Prompts", anchor: "prompts" },
];

const onColorScheme = (value: unknown) => {
  if (value === "system" || value === "dark" || value === "light") {
    appearance.colorScheme = value as ColorScheme;
  }
};

const transitionItems = computed(() =>
  Object.entries(transitions).map(([key, val]) => ({
    title: val.name,
    value: key,
  })),
);

const navigationTypeItems = ["sidebar", "toolbar", "floating"];
const logoStyleItems = computed(() => appearance.logoStyles);
</script>
