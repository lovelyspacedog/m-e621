<template>
  <v-list-item
    v-view-transition-name="`settings-toolbar-${section}`"
    :to="overlayNav ? undefined : { path: '/settings/' + section }"
    @click="onClick"
  >
    <template #prepend>
      <v-avatar :color="color">
        <v-icon>{{ icon }}</v-icon>
      </v-avatar>
    </template>

    <v-list-item-title>
      {{ title }}
    </v-list-item-title>
    <slot />

    <template #append>
      <v-icon>mdi-chevron-right</v-icon>
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import { useSettingsOverlayNav } from "./settingsOverlay";

const props = defineProps<{
  title?: string;
  section?: string;
  icon?: string;
  color?: string;
}>();

const overlayNav = useSettingsOverlayNav();

const onClick = (event: MouseEvent) => {
  if (!overlayNav || !props.section) return;
  event.preventDefault();
  overlayNav.navigate(props.section);
};
</script>
