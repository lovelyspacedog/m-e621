<template>
  <v-dialog
    :model-value="settingsOverlayState.open"
    max-width="1100"
    scrollable
    scrim="primary"
    content-class="settings-overlay-dialog"
    @update:model-value="onDialogUpdate"
  >
    <v-card color="secondary" class="settings-overlay-card d-flex flex-column">
      <v-card-title class="d-flex align-center flex-grow-0">
        <v-icon class="mr-2">mdi-cog</v-icon>
        Settings
        <v-spacer />
        <v-btn
          icon
          variant="text"
          aria-label="Close Settings"
          @click="closeSettings()"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text class="settings-overlay-body pa-0 flex-grow-1">
        <component :is="activePage" :key="settingsOverlayState.section" />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, provide, watch } from "vue";
import {
  SETTINGS_OVERLAY_NAV_KEY,
  closeSettings,
  createSettingsOverlayNav,
  settingsOverlayState,
} from "./settingsOverlay";

provide(SETTINGS_OVERLAY_NAV_KEY, createSettingsOverlayNav());

const pages: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  hub: defineAsyncComponent(() => import("./SettingsPage.vue")),
  account: defineAsyncComponent(() => import("./AccountSettingsPage.vue")),
  posts: defineAsyncComponent(() => import("./PostSettingsPage.vue")),
  blacklist: defineAsyncComponent(() => import("./BlacklistSettingsPage.vue")),
  appearance: defineAsyncComponent(() => import("./AppearanceSettingsPage.vue")),
  "appearance/themes": defineAsyncComponent(() => import("./ThemePage.vue")),
  history: defineAsyncComponent(() => import("./HistorySettingsPage.vue")),
  restore: defineAsyncComponent(() => import("./RestoreSettingsPage.vue")),
  info: defineAsyncComponent(() => import("./InfoPage.vue")),
  shortcuts: defineAsyncComponent(() => import("./ShortcutSettingsPage.vue")),
};

const activePage = computed(
  () => pages[settingsOverlayState.section] ?? pages.hub,
);

const onDialogUpdate = (open: boolean) => {
  if (!open) closeSettings();
};

watch(
  () => settingsOverlayState.hash,
  (hash) => {
    if (!hash || !settingsOverlayState.open) return;
    const id = hash.startsWith("settings-") ? hash : `settings-${hash}`;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  },
);
</script>

<style scoped>
.settings-overlay-card {
  max-height: min(90vh, 900px);
}
.settings-overlay-body {
  max-height: min(78vh, 800px);
  overflow-y: auto;
}
</style>
