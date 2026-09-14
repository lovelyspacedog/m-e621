<template>
  <v-list class="pa-0 mt-2 mb-1" density="compact">
    <v-list-subheader class="text-overline">Site</v-list-subheader>
    <v-list-item
      v-for="mode in siteMode.siteModes"
      :key="mode"
      :active="siteMode.activeMode === mode"
      @click="onSelect(mode)"
    >
      <template #prepend>
        <v-icon>{{ modeIcon(mode) }}</v-icon>
      </template>
      <v-list-item-title>{{ modeLabel(mode) }}</v-list-item-title>
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { useSiteModeStore } from "@/services/SiteModeStore";
import type { SiteMode } from "@/services/types";

const siteMode = useSiteModeStore();
const router = useRouter();

const modeIcon = (mode: SiteMode) => {
  switch (mode) {
    case "e6ai": return "mdi-robot";
    case "local": return "mdi-folder-image";
    case "tailspace": return "mdi-space-station";
    case "furbooru": return "mdi-dog";
    case "inkbunny": return "mdi-rabbit";
    default: return "mdi-paw";
  }
};

const modeLabel = (mode: SiteMode) => {
  switch (mode) {
    case "tailspace": return "Tailspace";
    case "furbooru": return "Furbooru";
    case "inkbunny": return "Inkbunny";
    default: return mode;
  }
};

const onSelect = (mode: SiteMode) => {
  if (mode === siteMode.activeMode) return;
  siteMode.setMode(mode);
  if (mode === "tailspace") {
    router.push({ name: "TailspacePosts" });
  } else {
    router.push({ name: "Posts", query: {} });
  }
};
</script>
