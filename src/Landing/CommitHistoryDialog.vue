<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    scrollable
    scrim="primary"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card color="secondary">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-source-commit</v-icon>
        {{ title }}
        <v-spacer />
        <v-btn
          icon
          variant="text"
          :aria-label="`Close ${title}`"
          @click="emit('update:modelValue', false)"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text class="dialog-body">
        <commit-timeline :limit="40" :source="source" />
      </v-card-text>

      <v-card-actions>
        <v-btn
          variant="text"
          color="primary"
          :href="githubUrl"
          target="_blank"
          rel="noopener"
        >
          <v-icon start>mdi-open-in-new</v-icon>
          More on GitHub
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
import { computed } from "vue";
import CommitTimeline from "@/About/CommitTimeline.vue";
import { FORK_GITHUB_REPO, UPSTREAM_GITHUB_REPO } from "@/misc/util/git";

const props = defineProps<{
  modelValue: boolean;
  source: "fork" | "upstream";
  title: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const githubUrl = computed(() => {
  const repo = props.source === "fork" ? FORK_GITHUB_REPO : UPSTREAM_GITHUB_REPO;
  return `https://github.com/${repo}/commits/master`;
});
</script>

<style scoped>
.dialog-body {
  max-height: min(70vh, 640px);
}
</style>
