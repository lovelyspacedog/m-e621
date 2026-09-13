<template>
  <!-- Use --me621-bg CSS variable so browser extensions (e.g. Transparent Zen /
       Zen Internet) can override the background with a simple :root rule instead
       of fighting an inline !important declaration. -->
  <v-main class="me621-main" :style="`--me621-bg: ${backgroundColor};`">
    <router-view />
  </v-main>
</template>

<script setup lang="ts">
import { useAppearanceStore } from "@/services";
import { computed } from "vue";
const appearance = useAppearanceStore();

const backgroundColor = computed(() => appearance.backgroundColor);
</script>

<style scoped>
/* Apply the CSS custom property so normal stylesheet !important rules
   (e.g. from Transparent Zen) can still override us. */
.me621-main {
  background-color: var(--me621-bg) !important;
  border-color: var(--me621-bg) !important;
}
</style>
