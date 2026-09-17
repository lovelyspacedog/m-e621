<template>
  <v-dialog
    :model-value="modelValue"
    max-width="720"
    scrollable
    scrim="primary"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card color="secondary">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-newspaper-variant-outline</v-icon>
        Changelog
        <v-spacer />
        <v-btn
          icon
          variant="text"
          aria-label="Close changelog"
          @click="emit('update:modelValue', false)"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text class="changelog-body">
        <p class="text-body-2 text-medium-emphasis mb-6">{{ changelogIntro }}</p>
        <section
          v-for="section in changelogSections"
          :key="section.date"
          class="changelog-section mb-6"
        >
          <h3 class="text-h6 mb-1">{{ section.title }}</h3>
          <div class="text-caption text-medium-emphasis mb-3">
            {{ formatDate(section.date) }}
          </div>
          <ul class="changelog-list">
            <li v-for="(item, idx) in section.items" :key="idx">{{ item }}</li>
          </ul>
        </section>
      </v-card-text>
      <v-card-actions>
        <v-btn
          variant="text"
          color="primary"
          href="https://github.com/lovelyspacedog/m-e621/commits/master"
          target="_blank"
          rel="noopener"
        >
          <v-icon start>mdi-open-in-new</v-icon>
          Full commit history
        </v-btn>
        <v-spacer />
        <v-btn
          variant="text"
          color="primary"
          @click="emit('update:modelValue', false)"
        >
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { changelogIntro, changelogSections } from "./changelog";

defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const formatDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};
</script>

<style scoped>
.changelog-body {
  max-height: min(70vh, 640px);
}
.changelog-list {
  margin: 0;
  padding-left: 1.25rem;
}
.changelog-list li {
  margin-bottom: 0.35rem;
}
.changelog-list li::marker {
  color: rgb(var(--v-theme-primary));
}
</style>
