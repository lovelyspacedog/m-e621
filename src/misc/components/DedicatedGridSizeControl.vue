<template>
  <template v-if="variant === 'menu'">
    <v-menu v-model="menuOpen" location="bottom end" :close-on-content-click="false">
      <template #activator="{ props: menuProps }">
        <v-btn
          v-bind="menuProps"
          icon
          variant="text"
          :aria-label="ariaLabel"
          :title="ariaLabel"
        >
          <v-icon>mdi-grid-size</v-icon>
        </v-btn>
      </template>
      <v-card min-width="240" class="pa-3">
        <p class="text-caption text-medium-emphasis mb-2">{{ ariaLabel }}</p>
        <v-slider
          v-model="size"
          color="accent"
          class="my-0"
          thumb-label
          :min="DEDICATED_GRID_MIN_PX_MIN"
          :max="DEDICATED_GRID_MIN_PX_MAX"
          :step="DEDICATED_GRID_MIN_PX_STEP"
          hide-details
          density="compact"
        />
      </v-card>
    </v-menu>
  </template>
  <v-slider
    v-else
    v-model="size"
    color="accent"
    class="my-0"
    thumb-label
    :min="DEDICATED_GRID_MIN_PX_MIN"
    :max="DEDICATED_GRID_MIN_PX_MAX"
    :step="DEDICATED_GRID_MIN_PX_STEP"
    :label="ariaLabel"
  />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { usePostsStore } from "@/services";
import {
  DEDICATED_GRID_MIN_PX_MAX,
  DEDICATED_GRID_MIN_PX_MIN,
  DEDICATED_GRID_MIN_PX_STEP,
} from "@/misc/util/dedicatedGridMin";

withDefaults(
  defineProps<{
    variant?: "menu" | "inline";
  }>(),
  { variant: "inline" },
);

const ariaLabel = "Thumbnail grid size";

const menuOpen = ref(false);
const posts = usePostsStore();
const size = computed({
  get: () => posts.dedicatedGridMinPx,
  set: (v: number) => {
    posts.dedicatedGridMinPx = v;
  },
});
</script>
