<template>
  <v-timeline>
    <v-timeline-item
      side="end"
      v-for="(entry, idx) in commits"
      :key="entry.hash"
      fill-dot
      :size="idx !== 0 ? 'small' : 'large'"
    >
      <template v-slot:icon>
        <v-icon v-if="idx === 0">mdi-calendar-star</v-icon>
      </template>
      <commit-entry :entry="entry" />
    </v-timeline-item>
  </v-timeline>
  <div v-if="!commits.length" class="text-medium-emphasis text-center py-4">
    No commits in this column
  </div>
</template>

<script setup lang="ts">
import { getGitInfo, isForkAuthor } from "@/misc/util/git";
import type { PropType } from "vue";
import { computed } from "vue";
import CommitEntry from "./CommitEntry.vue";

const props = defineProps({
  limit: {
    type: Number,
    default: 10,
  },
  /** "fork" = Tony Pup; "upstream" = Avoonix/Avoo; omit = all */
  source: {
    type: String as PropType<"fork" | "upstream">,
    default: undefined,
  },
});

const commits = computed(() => {
  let list = getGitInfo();
  if (props.source === "fork") {
    list = list.filter((c) => isForkAuthor(c.author));
  } else if (props.source === "upstream") {
    list = list.filter((c) => !isForkAuthor(c.author));
  }
  return list.slice(0, props.limit);
});
</script>
