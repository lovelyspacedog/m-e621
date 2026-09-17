<template>
  <div class="d-flex align-center fill-width pr-2">
    <div class="text-left flex-grow-1">
      <div>{{ title }}</div>
      <div class="text-caption text-medium-emphasis">{{ statusLine }}</div>
    </div>
    <v-chip
      size="x-small"
      label
      :color="chip.color"
      :variant="chip.variant"
    >
      {{ chip.label }}
    </v-chip>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  authChipState,
  formatAuthProbeHint,
  type AuthProbe,
} from "./accountAuth";

const props = defineProps<{
  title: string;
  status: string;
  connected: boolean;
  probe?: AuthProbe | null;
}>();

const chip = computed(() => authChipState(props.connected, props.probe));

const statusLine = computed(() => {
  const hint = formatAuthProbeHint(props.probe || emptyNull(), props.connected);
  return hint ? `${props.status} · ${hint}` : props.status;
});

const emptyNull = (): AuthProbe => ({
  success: false,
  loading: false,
  message: "",
  checkedAt: null,
});
</script>

<style scoped>
.fill-width {
  width: 100%;
}
</style>
