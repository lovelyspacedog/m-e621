<template>
  <settings-group>
    <settings-row
      :title="title"
      :description="description"
      :switch="isSwitch"
      :stack="isSelect || (!isSwitch && !isSelect)"
    >
      <template v-if="$slots.description" #label>
        <div v-if="title" class="text-body-1">{{ title }}</div>
        <div v-if="description || $slots.description" class="text-caption text-medium-emphasis">
          {{ description }}
          <slot name="description" />
        </div>
      </template>
      <slot />
    </settings-row>
  </settings-group>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SettingsGroup from "./SettingsGroup.vue";
import SettingsRow from "./SettingsRow.vue";

const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    switch?: boolean;
    select?: boolean;
  }>(),
  {
    switch: false,
    select: false,
  },
);

const isSwitch = computed(() => props.switch);
const isSelect = computed(() => props.select);
</script>
