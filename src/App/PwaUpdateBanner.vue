<template>
  <v-banner
    v-if="pwa.needRefresh"
    class="pwa-update-banner"
    bg-color="surface-variant"
    density="comfortable"
    icon="mdi-update"
    lines="one"
    sticky
    text="New version available"
  >
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
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2000;
}
</style>
