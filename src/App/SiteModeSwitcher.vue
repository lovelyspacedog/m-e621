<template>
  <div v-if="variant === 'list'" class="site-mode-list mt-2 mb-1">
    <v-list class="pa-0" density="compact">
      <v-list-subheader class="text-overline">Site</v-list-subheader>
    </v-list>
    <v-autocomplete
      :model-value="siteMode.activeMode"
      :items="selectItems"
      item-title="title"
      item-value="value"
      variant="outlined"
      density="compact"
      hide-details
      class="site-mode-sidebar mx-3"
      :class="siteMode.isNews ? 'mb-2' : 'mb-1'"
      menu-icon="mdi-chevron-down"
      placeholder="Choose site"
      autocomplete="off"
      @update:model-value="onSelect($event as SiteMode)"
    >
      <template #selection="{ item }">
        <span class="d-inline-flex align-center ga-2">
          <v-icon size="18">{{ modeIcon(item.raw.value) }}</v-icon>
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
    <v-list v-if="!siteMode.isNews" class="pa-0" density="compact">
      <v-list-item
        :active="posts.sfwOnly"
        @click="posts.sfwOnly = !posts.sfwOnly"
      >
        <template #prepend>
          <v-icon>{{ posts.sfwOnly ? "mdi-shield-check" : "mdi-shield-outline" }}</v-icon>
        </template>
        <v-list-item-title>SFW only</v-list-item-title>
        <template #append>
          <v-switch
            :model-value="posts.sfwOnly"
            color="accent"
            hide-details
            density="compact"
            @click.stop
            @update:model-value="(v: boolean | null) => { posts.sfwOnly = !!v }"
          />
        </template>
      </v-list-item>
    </v-list>
  </div>
  <div v-else-if="variant === 'chips'" class="site-mode-chips">
    <v-btn
      v-for="mode in siteMode.siteModes"
      :key="mode"
      size="small"
      class="text-none"
      :variant="chipVariant(mode)"
      :color="chipColor(mode)"
      :disabled="chipDisabled(mode)"
      :aria-pressed="chipAriaPressed(mode)"
      @click="onChipClick(mode)"
    >
      <v-icon start size="18">{{ modeIcon(mode) }}</v-icon>
      {{ modeLabel(mode) }}
      <v-icon
        v-if="mode === 'unified' && siteMode.isUnified"
        end
        size="16"
        class="site-mode-chips__close"
        aria-label="Exit Federated mode"
        @click.stop="onExitFederated"
      >
        mdi-close
      </v-icon>
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
import { usePostsStore } from "@/services";
import { useSiteModeStore } from "@/services/SiteModeStore";
import type { SiteMode, UnifiedChildMode } from "@/services/types";

const props = withDefaults(
  defineProps<{
    /** Sidebar select, landing chips, or inline headline select. */
    variant?: "list" | "chips" | "inline";
    /** When false, only switch mode (stay on the current page). */
    navigateOnChange?: boolean;
  }>(),
  {
    variant: "list",
    navigateOnChange: true,
  },
);

const posts = usePostsStore();
const siteMode = useSiteModeStore();
const router = useRouter();

const selectItems = computed(() =>
  siteMode.siteModes.map((mode) => ({
    value: mode,
    title: modeLabel(mode),
    props: {
      disabled: !siteMode.isModeOnlineCapable(mode),
    },
  })),
);

const modeIcon = (mode: SiteMode) => {
  switch (mode) {
    case "e6ai": return "$tanukiAi";
    case "local": return "mdi-harddisk";
    case "tailspace": return "mdi-rocket-launch";
    case "news": return "mdi-newspaper";
    case "furbooru": return "mdi-dog";
    case "inkbunny": return "mdi-rabbit";
    case "furaffinity": return "$fox";
    case "weasyl": return "$weasyl";
    case "itaku": return "$itaku";
    case "sofurry": return "$sofurry";
    case "murrtube": return "mdi-video";
    case "badpups": return "mdi-dog-side";
    case "unified": return "mdi-earth";
    default: return "mdi-paw";
  }
};

const modeLabel = (mode: SiteMode) => {
  switch (mode) {
    case "local": return "Local";
    case "tailspace": return "Tailspace";
    case "news": return "News";
    case "furbooru": return "Furbooru";
    case "inkbunny": return "Inkbunny";
    case "furaffinity": return "FurAffinity";
    case "weasyl": return "Weasyl";
    case "itaku": return "Itaku";
    case "sofurry": return "SoFurry";
    case "murrtube": return "Murrtube";
    case "badpups": return "Badpups";
    case "unified": return "Federated";
    default: return mode;
  }
};

const chipIncluded = (mode: SiteMode) =>
  siteMode.isUnified &&
  siteMode.isUnifiedChildMode(mode) &&
  !!siteMode.unifiedSites[mode as UnifiedChildMode];

const chipActive = (mode: SiteMode) =>
  siteMode.activeMode === mode || chipIncluded(mode);

const chipVariant = (mode: SiteMode) =>
  chipActive(mode) ? "flat" : "outlined";

const chipColor = (mode: SiteMode) =>
  chipActive(mode) ? "secondary" : "white";

const chipDisabled = (mode: SiteMode) => {
  if (!siteMode.isModeOnlineCapable(mode)) return true;
  if (siteMode.isUnified && siteMode.isFederatedIncompatible(mode)) return true;
  return false;
};

const chipAriaPressed = (mode: SiteMode) => {
  if (siteMode.isUnified && siteMode.isUnifiedChildMode(mode)) {
    return chipIncluded(mode);
  }
  return siteMode.activeMode === mode;
};

const postsRouteFor = (mode: SiteMode) => {
  if (mode === "tailspace") return { name: "TailspacePosts" as const };
  if (mode === "news") return { name: "NewsFeed" as const };
  return { name: "Posts" as const, query: {} };
};

const onExitFederated = async () => {
  siteMode.exitUnifiedMode();
  if (!props.navigateOnChange) return;
  await router.push(postsRouteFor(siteMode.activeMode));
};

const onChipClick = async (mode: SiteMode) => {
  if (siteMode.isUnified) {
    if (mode === "unified") {
      await onExitFederated();
      return;
    }
    if (siteMode.isUnifiedChildMode(mode)) {
      siteMode.setUnifiedChild(
        mode,
        !siteMode.unifiedSites[mode as UnifiedChildMode],
      );
      return;
    }
    return;
  }
  await onSelect(mode);
};

const onSelect = async (mode: SiteMode) => {
  // Landing: active chip is a shortcut to browse that site (otherwise a no-op).
  if (mode === siteMode.activeMode) {
    if (!props.navigateOnChange) {
      await router.push(postsRouteFor(mode));
    }
    return;
  }
  // setMode before navigate: the router guard blocks Tailspace* routes while
  // activeMode is still non-tailspace, so push-first left us on Posts with
  // Tailspace selected and the previous site's feed still showing.
  // PostsPage's modeChangeCount watcher already no-ops when isTailspace (C3).
  siteMode.setMode(mode);
  if (!props.navigateOnChange) return;
  await router.push(postsRouteFor(mode));
};
</script>

<style scoped>
.site-mode-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

/* Inactive chips: thicker outline + tint so they hold up on busy transparent BGs. */
.site-mode-chips :deep(.v-btn--variant-outlined) {
  background-color: rgba(0, 0, 0, 0.34) !important;
  border-width: 2px !important;
}

.site-mode-chips :deep(.v-btn--variant-flat) {
  border: 2px solid rgba(255, 255, 255, 0.55);
}

.site-mode-chips__close {
  margin-inline-start: 2px;
  opacity: 0.9;
}

.site-mode-sidebar :deep(.v-field__input) {
  min-height: 2rem;
  padding-top: 0;
  padding-bottom: 0;
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
