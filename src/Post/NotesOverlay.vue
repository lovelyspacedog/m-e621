<template>
  <div class="notes-overlay" v-if="activeNotes.length">
    <v-menu
      v-for="note in activeNotes"
      :key="note.id"
      :open-on-hover="openOnHover"
      :open-on-click="!openOnHover"
      :close-on-content-click="false"
      location="top"
    >
      <template #activator="{ props: menuProps }">
        <button
          type="button"
          class="note-box"
          v-bind="menuProps"
          :style="boxStyle(note)"
          @click.stop
        />
      </template>
      <v-card color="secondary" max-width="280" class="pa-2">
        <div class="text-caption mb-1">{{ note.creator_name }}</div>
        <d-text :text="note.body" />
      </v-card>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Note } from "@/worker/api";
import DText from "@/Parser/DText.vue";

const props = defineProps<{
  notes: Note[];
  imageWidth: number;
  imageHeight: number;
}>();

const activeNotes = computed(() =>
  props.notes.filter((n) => n.is_active !== false),
);

/** Hover menus fail on touch; use click when the pointer has no hover. */
const openOnHover = computed(() => {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return !window.matchMedia("(hover: none)").matches;
});

const boxStyle = (note: Note) => {
  const w = Math.max(1, props.imageWidth || 1);
  const h = Math.max(1, props.imageHeight || 1);
  return {
    left: `${(note.x / w) * 100}%`,
    top: `${(note.y / h) * 100}%`,
    width: `${(note.width / w) * 100}%`,
    height: `${(note.height / h) * 100}%`,
  };
};
</script>

<style scoped>
.notes-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
.note-box {
  position: absolute;
  pointer-events: auto;
  border: 2px solid rgba(255, 220, 80, 0.85);
  background: rgba(255, 220, 80, 0.18);
  cursor: help;
  padding: 0;
}
</style>
