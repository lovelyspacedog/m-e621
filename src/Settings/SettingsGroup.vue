<template>
  <v-card :id="anchorId" class="settings-group ma-3" color="secondary">
    <div v-if="title || description" class="settings-group__header text-left px-4 pt-3 pb-1">
      <div v-if="title" class="text-subtitle-1 font-weight-medium">{{ title }}</div>
      <div v-if="description" class="text-caption text-medium-emphasis">
        {{ description }}
        <slot name="description" />
      </div>
      <slot v-else name="description" />
    </div>
    <div class="settings-group__body">
      <slot />
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  title?: string;
  description?: string;
  /** In-page anchor id (without #), e.g. "media" → id="settings-media" */
  anchor?: string;
}>();

const anchorId = computed(() =>
  props.anchor ? `settings-${props.anchor}` : undefined,
);
</script>

<style scoped>
.settings-group {
  scroll-margin-top: 96px;
}

.settings-group__body :deep(.settings-row + .settings-row) {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
