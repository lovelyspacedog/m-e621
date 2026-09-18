<template>
  <v-banner
    v-if="pwa.needRefresh"
    class="pwa-update-banner"
    bg-color="surface-variant"
    density="comfortable"
    icon="mdi-update"
    lines="one"
    sticky
    :text="bannerText"
  >
    <template #actions>
      <v-btn variant="text" @click.stop="pwa.dismiss()">Later</v-btn>
      <v-btn color="primary" variant="flat" @click.stop="pwa.reload()">Reload</v-btn>
    </template>
  </v-banner>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePwaUpdateStore } from "@/services";
import { APP_NAME } from "@/misc/util/brand";
import { getAppName } from "@/misc/util/utilities";

const pwa = usePwaUpdateStore();
const bannerText = computed(() => {
  const name = getAppName();
  const prefix = `${APP_NAME} `;
  const hash = name.startsWith(prefix) ? name.slice(prefix.length) : "";
  return hash ? `New version available (${hash})` : "New version available";
});
</script>

<style scoped>
.pwa-update-banner {
  position: fixed;
  top: env(safe-area-inset-top, 0px);
  left: 0;
  right: 0;
  z-index: 2000;
}
</style>
