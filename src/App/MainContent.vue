<template>
  <!-- Background comes from --me621-bg on :root (set below). Extensions can
       override with `:root { --me621-bg: transparent !important; }` because
       we do not redeclare the variable on this element. -->
  <v-main class="me621-main">
    <router-view />
  </v-main>
</template>

<script setup lang="ts">
import { useAppearanceStore } from "@/services";
import { computed, watchEffect } from "vue";

const appearance = useAppearanceStore();
const backgroundColor = computed(() => appearance.backgroundColor);

watchEffect(() => {
  document.documentElement.style.setProperty("--me621-bg", backgroundColor.value);
});
</script>
