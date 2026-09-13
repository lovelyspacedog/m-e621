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
        <v-icon>{{ mode === "e6ai" ? "mdi-robot" : "mdi-paw" }}</v-icon>
      </template>
      <v-list-item-title>{{ mode }}</v-list-item-title>
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { useSiteModeStore } from "@/services/SiteModeStore";
import type { SiteMode } from "@/services/types";

const siteMode = useSiteModeStore();
const router = useRouter();

const onSelect = (mode: SiteMode) => {
  if (mode === siteMode.activeMode) return;
  siteMode.setMode(mode);
  router.push({ name: "Posts", query: {} });
};
</script>
