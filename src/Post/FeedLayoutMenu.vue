<template>
  <v-list class="pa-0 mt-1 mb-2" density="compact">
    <v-menu
      v-model="layoutMenuOpen"
      location="bottom end"
      :close-on-content-click="false"
    >
      <template #activator="{ props: menuProps }">
        <v-list-item v-bind="menuProps" title="Layout">
          <template #prepend>
            <v-icon>mdi-view-dashboard-outline</v-icon>
          </template>
          <template #append>
            <v-tooltip :text="layoutShortcutHint" location="top">
              <template #activator="{ props: tipProps }">
                <v-icon
                  v-bind="tipProps"
                  size="small"
                  class="text-medium-emphasis"
                  @click.prevent.stop
                >
                  mdi-keyboard-outline
                </v-icon>
              </template>
            </v-tooltip>
            <v-icon size="small" class="ml-1">mdi-menu-down</v-icon>
          </template>
        </v-list-item>
      </template>
      <v-list density="compact" min-width="260">
        <v-list-item>
          <template #prepend>
            <v-icon>mdi-arrow-expand-horizontal</v-icon>
          </template>
          <v-list-item-title>Full-width feed</v-list-item-title>
          <template #append>
            <v-switch
              class="ma-0"
              color="accent"
              density="compact"
              hide-details
              :disabled="postsStore.feedLayout === 'grid'"
              v-model="postsStore.fullWidthFeed"
            />
          </template>
        </v-list-item>
        <v-list-item>
          <template #prepend>
            <v-icon>mdi-view-grid</v-icon>
          </template>
          <v-list-item-title>Grid layout</v-list-item-title>
          <template #append>
            <v-switch
              class="ma-0"
              color="accent"
              density="compact"
              hide-details
              :model-value="postsStore.feedLayout === 'grid'"
              @update:model-value="postsStore.feedLayout = $event ? 'grid' : 'list'"
            />
          </template>
        </v-list-item>
        <v-list-item>
          <template #prepend>
            <v-icon>mdi-card-text-outline</v-icon>
          </template>
          <v-list-item-title>Compact cards</v-list-item-title>
          <template #append>
            <v-switch
              class="ma-0"
              color="accent"
              density="compact"
              hide-details
              v-model="postsStore.compactCards"
            />
          </template>
        </v-list-item>
        <v-list-item>
          <template #prepend>
            <v-icon>mdi-skip-next</v-icon>
          </template>
          <v-list-item-title>Auto-next cards</v-list-item-title>
          <template #append>
            <v-switch
              class="ma-0"
              color="accent"
              density="compact"
              hide-details
              v-model="postsStore.cardAutoNext"
            />
          </template>
        </v-list-item>
        <v-list-item>
          <template #prepend>
            <v-icon>mdi-infinity</v-icon>
          </template>
          <v-list-item-title>Infinite scroll</v-list-item-title>
          <template #append>
            <v-switch
              class="ma-0"
              color="accent"
              density="compact"
              hide-details
              v-model="postsStore.autoLoad"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-menu>

    <TipDialog
      :tip-id="TIP_IDS.feedLayout"
      title="Feed layout"
      v-model="feedLayoutTipOpen"
    >
      <p class="mb-3">
        Use Layout to switch grid, compact cards, full-width list, auto-next,
        and infinite scroll. Turn infinite scroll off to page with previous/next.
      </p>
      <p class="mb-0">
        Keyboard: j/k move between posts; Space starts a slideshow in fullscreen
        (or pauses auto-next on the feed when that is on). The keyboard icon on
        Layout shows the same shortcuts.
      </p>
    </TipDialog>
  </v-list>
</template>

<script setup lang="ts">
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import { usePostsStore } from "@/services";
import { computed, ref, watch } from "vue";

const postsStore = usePostsStore();
const layoutMenuOpen = ref(false);
const { open: feedLayoutTipOpen, tryOpenOnEdge } = useTipOpen(TIP_IDS.feedLayout);

watch(layoutMenuOpen, tryOpenOnEdge);

const layoutShortcutHint = computed(() =>
  postsStore.cardAutoNext
    ? "Space pauses (feed) · slideshow (fullscreen) · j/k next/prev"
    : "j/k next/prev · Space slideshow in fullscreen",
);
</script>
