<template>
  <div class="settings-page-title" :style="{ '--settings-title-color': resolvedColor }">
    <v-toolbar
      :color="color"
      density="comfortable"
      v-view-transition-name="`settings-toolbar-${section}`"
    >
      <v-btn v-if="overlayNav" icon @click="overlayNav.back(backTo)">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-btn v-else icon exact :to="backTo">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-left">
        {{ title }}
      </v-toolbar-title>
      <v-spacer />
    </v-toolbar>
    <div v-if="chips.length" class="settings-page-title__chips px-2 py-1 d-flex flex-wrap ga-1">
      <v-chip
        v-for="chip in chips"
        :key="chip.anchor"
        size="small"
        variant="tonal"
        :color="color"
        label
        @click="scrollToAnchor(chip.anchor)"
      >
        {{ chip.label }}
      </v-chip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useSettingsOverlayNav } from "./settingsOverlay";

export type SettingsNavChip = { label: string; anchor: string };

const props = withDefaults(
  defineProps<{
    title?: string;
    color?: string;
    section?: string;
    chips?: SettingsNavChip[];
    /** Router location for the back button */
    backTo?: string | { name: string };
  }>(),
  {
    chips: () => [],
    backTo: () => ({ name: "Settings" }),
  },
);

const overlayNav = useSettingsOverlayNav();

/** Named Vuetify colors fall back to secondary under the chip row */
const resolvedColor = computed(() => {
  const c = props.color;
  if (!c) return "rgb(var(--v-theme-secondary))";
  if (c.startsWith("#") || c.startsWith("rgb")) return c;
  return "rgb(var(--v-theme-secondary))";
});

const scrollToAnchor = (anchor: string) => {
  const el = document.getElementById(`settings-${anchor}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
};

const scrollHashIntoView = () => {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;
  const id = hash.startsWith("settings-") ? hash : `settings-${hash}`;
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
};

const route = useRoute();

onMounted(() => {
  window.scrollTo({ top: 0 });
  scrollHashIntoView();
});

watch(
  () => route.hash,
  () => scrollHashIntoView(),
);
</script>

<style scoped>
.settings-page-title {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--settings-title-color, rgb(var(--v-theme-secondary)));
}

.settings-page-title__chips {
  background: rgb(var(--v-theme-secondary));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.settings-page-title__chips :deep(.v-chip) {
  cursor: pointer;
}
</style>
