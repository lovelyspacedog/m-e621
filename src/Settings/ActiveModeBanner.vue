<template>
  <v-alert
    class="mb-3 text-left"
    density="compact"
    variant="tonal"
    color="accent"
    :icon="modeIcon"
  >
    Editing profile for
    <strong>{{ modeLabel }}</strong>
    — switch sites in the sidebar to change which profile these lists apply to.
  </v-alert>
</template>

<script setup lang="ts">
import { useSiteModeStore } from "@/services";
import { unifiedChildIcon, unifiedChildLabel } from "@/misc/util/postOrigin";
import { computed } from "vue";

const siteMode = useSiteModeStore();
const modeLabel = computed(() => unifiedChildLabel(siteMode.activeMode));
const modeIcon = computed(() => unifiedChildIcon(siteMode.activeMode));
</script>
