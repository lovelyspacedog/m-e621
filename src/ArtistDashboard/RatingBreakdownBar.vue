<template>
  <div>
    <div class="d-flex justify-space-between text-caption mb-1">
      <span>SFW {{ breakdown.s }}</span>
      <span>Questionable {{ breakdown.q }}</span>
      <span>Explicit {{ breakdown.e }}</span>
    </div>
    <div class="rating-bar">
      <div
        v-if="breakdown.s"
        class="rating-seg rating-seg--s"
        :style="{ flex: breakdown.s }"
        :title="`SFW ${breakdown.s}`"
      />
      <div
        v-if="breakdown.q"
        class="rating-seg rating-seg--q"
        :style="{ flex: breakdown.q }"
        :title="`Questionable ${breakdown.q}`"
      />
      <div
        v-if="breakdown.e"
        class="rating-seg rating-seg--e"
        :style="{ flex: breakdown.e }"
        :title="`Explicit ${breakdown.e}`"
      />
    </div>
  </div>
</template>

<script lang="ts">
import type { PropType } from "vue";
import { defineComponent } from "vue";

export default defineComponent({
  props: {
    breakdown: {
      type: Object as PropType<{ s: number; q: number; e: number }>,
      required: true,
    },
  },
});
</script>

<style scoped>
.rating-bar {
  display: flex;
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.rating-seg--s {
  background: #4caf50;
}
.rating-seg--q {
  background: #ffc107;
}
.rating-seg--e {
  background: #f44336;
}
</style>
