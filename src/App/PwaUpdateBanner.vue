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
import { getAppName } from "@/misc/util/utilities";

const pwa = usePwaUpdateStore();
const bannerText = computed(() => {
  const name = getAppName();
  // getAppName is `m-e621` or `m-e621 <hash>`
  const hash = name.startsWith("m-e621 ") ? name.slice("m-e621 ".length) : "";
  return hash ? `New version available (${hash})` : "New version available";
});
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
