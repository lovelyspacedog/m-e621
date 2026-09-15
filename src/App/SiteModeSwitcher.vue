<template>
  <v-list v-if="variant === 'list'" class="pa-0 mt-2 mb-1" density="compact">
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
  <div v-else class="site-mode-chips">
    <v-btn
      v-for="mode in siteMode.siteModes"
      :key="mode"
      size="small"
      class="text-none"
      :variant="siteMode.activeMode === mode ? 'flat' : 'outlined'"
      :color="siteMode.activeMode === mode ? 'secondary' : 'white'"
      @click="onSelect(mode)"
    >
      <v-icon start size="18">{{ modeIcon(mode) }}</v-icon>
      {{ modeLabel(mode) }}
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { useSiteModeStore } from "@/services/SiteModeStore";
import type { SiteMode } from "@/services/types";

const props = withDefaults(
  defineProps<{
    /** Sidebar list vs compact chips for the landing search. */
    variant?: "list" | "chips";
    /** When false, only switch mode (stay on the current page). */
    navigateOnChange?: boolean;
  }>(),
  {
    variant: "list",
    navigateOnChange: true,
  },
);

const siteMode = useSiteModeStore();
const router = useRouter();

const modeIcon = (mode: SiteMode) => {
  switch (mode) {
    case "e6ai": return "mdi-robot";
    case "local": return "mdi-harddisk";
    case "tailspace": return "mdi-rocket-launch";
    case "furbooru": return "mdi-dog";
    case "inkbunny": return "mdi-rabbit";
    case "furaffinity": return "$fox";
    case "unified": return "mdi-earth";
    default: return "mdi-paw";
  }
};

const modeLabel = (mode: SiteMode) => {
  switch (mode) {
    case "local": return "Local";
    case "tailspace": return "Tailspace";
    case "furbooru": return "Furbooru";
    case "inkbunny": return "Inkbunny";
    case "furaffinity": return "FurAffinity";
    case "unified": return "Unified";
    default: return mode;
  }
};

const postsRouteFor = (mode: SiteMode) =>
  mode === "tailspace"
    ? { name: "TailspacePosts" as const }
    : { name: "Posts" as const, query: {} };

const onSelect = async (mode: SiteMode) => {
  // Landing: active chip is a shortcut to browse that site (otherwise a no-op).
  if (mode === siteMode.activeMode) {
    if (!props.navigateOnChange) {
      await router.push(postsRouteFor(mode));
    }
    return;
  }
  if (!props.navigateOnChange) {
    siteMode.setMode(mode);
    return;
  }
  // Navigate off /posts before setMode when entering Tailspace so PostsPage's
  // modeChangeCount watcher cannot fire an e621-shaped getPosts (C3).
  if (mode === "tailspace") {
    await router.push({ name: "TailspacePosts" });
    siteMode.setMode(mode);
    return;
  }
  siteMode.setMode(mode);
  await router.push({ name: "Posts", query: {} });
};
</script>

<style scoped>
.site-mode-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
</style>
