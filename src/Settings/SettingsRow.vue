<template>
  <div class="settings-row px-4 py-3 text-left" :class="{ 'settings-row--stack': stack }">
    <div v-if="title || description || $slots.label" class="settings-row__label">
      <slot name="label">
        <div v-if="title" class="text-body-1">{{ title }}</div>
        <div v-if="description" class="text-caption text-medium-emphasis">
          {{ description }}
        </div>
      </slot>
    </div>
    <div class="settings-row__control" :class="{ 'settings-row__control--grow': !isSwitch }">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    /** Compact title+switch on one line */
    switch?: boolean;
    /** Force stacked label-above-control layout (for editors, textareas) */
    stack?: boolean;
  }>(),
  {
    switch: false,
    stack: false,
  },
);

const isSwitch = computed(() => props.switch);
</script>

<style scoped>
.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-row--stack {
  flex-direction: column;
  align-items: stretch;
}

.settings-row__label {
  flex: 1 1 auto;
  min-width: 0;
}

.settings-row__control {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.settings-row__control--grow,
.settings-row--stack .settings-row__control {
  flex: 1 1 auto;
  width: 100%;
  justify-content: stretch;
}

.settings-row--stack .settings-row__label {
  margin-bottom: 4px;
}
</style>
