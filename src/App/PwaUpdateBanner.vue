<template>
  <v-banner
    v-if="pwa.needRefresh"
    class="pwa-update-banner"
    color="accent"
    density="comfortable"
    icon="mdi-update"
    sticky
  >
    <v-banner-text>New version available</v-banner-text>
    <template #actions>
      <v-btn variant="text" @click="pwa.dismiss()">Later</v-btn>
      <v-btn color="primary" variant="flat" @click="pwa.reload()">Reload</v-btn>
    </template>
  </v-banner>
</template>

<script setup lang="ts">
import { usePwaUpdateStore } from "@/services";

const pwa = usePwaUpdateStore();
</script>

<style scoped>
.pwa-update-banner {
  position: sticky;
  top: 0;
  z-index: 1000;
}
</style>
