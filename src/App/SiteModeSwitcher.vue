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
  <div v-else-if="variant === 'chips'" class="site-mode-chips">
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
  <v-autocomplete
    v-else-if="variant === 'inline'"
    :model-value="siteMode.activeMode"
    :items="selectItems"
    item-title="title"
    item-value="value"
    variant="solo"
    flat
    bg-color="secondary"
    density="comfortable"
    hide-details
    rounded="lg"
    class="site-mode-inline"
    menu-icon="mdi-chevron-down"
    placeholder="Choose site"
    @update:model-value="onSelect($event as SiteMode)"
  >
    <template #selection="{ item }">
      <span class="d-inline-flex align-center ga-1">
        <v-icon size="20">{{ modeIcon(item.raw.value) }}</v-icon>
        <span>{{ item.title }}</span>
      </span>
    </template>
    <template #item="{ props: itemProps, item }">
      <v-list-item
        v-bind="itemProps"
        :prepend-icon="modeIcon(item.raw.value)"
        :title="item.title"
      />
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useSiteModeStore } from "@/services/SiteModeStore";
import type { SiteMode } from "@/services/types";

const props = withDefaults(
  defineProps<{
    /** Sidebar list, landing chips, or inline headline select. */
    variant?: "list" | "chips" | "inline";
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

const selectItems = computed(() =>
  siteMode.siteModes.map((mode) => ({
    value: mode,
    title: modeLabel(mode),
  })),
);

const modeIcon = (mode: SiteMode) => {
  switch (mode) {
    case "e6ai": return "$tanukiAi";
    case "local": return "mdi-harddisk";
    case "tailspace": return "mdi-rocket-launch";
    case "furbooru": return "mdi-dog";
    case "inkbunny": return "mdi-rabbit";
    case "furaffinity": return "$fox";
    case "weasyl": return "$weasyl";
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
    case "weasyl": return "Weasyl";
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

.site-mode-inline {
  display: inline-flex;
  flex: 0 1 auto;
  min-width: 11rem;
  max-width: min(70vw, 16rem);
  vertical-align: middle;
}

.site-mode-inline :deep(.v-field) {
  font: inherit;
  letter-spacing: inherit;
}

.site-mode-inline :deep(.v-field__input) {
  min-height: 2.25rem;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
