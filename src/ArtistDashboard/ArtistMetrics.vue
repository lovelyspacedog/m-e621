<template>
  <v-row>
    <v-col
      v-for="(metric, idx) in metrics"
      :key="idx"
      cols="12"
      lg="3"
      md="4"
      sm="6"
    >
      <v-card>
        <v-tooltip location="bottom" :disabled="metric.value <= 1000">
          <template #activator="{ props }">
            <v-card-title class="text-h3" v-bind="props">
              {{ formatValue(metric.value) }}
            </v-card-title>
          </template>
          <span>{{ metric.value.toLocaleString() }}</span>
        </v-tooltip>
        <v-card-text>
          {{ metric.display }}
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script lang="ts">
import type { IMetric } from "@/misc/util/dashboardMetrics";
import { round } from "@/misc/util/round";
import type { PropType } from "vue";
import { defineComponent } from "vue";

export default defineComponent({
  props: {
    metrics: {
      type: Array as PropType<IMetric[]>,
      required: true,
    },
  },
  setup() {
    const formatValue = (value: number) => {
      if (value > 1_000_000) {
        return `${round(value / 1_000_000)}M`;
      }
      if (value > 1_000) {
        return `${round(value / 1_000)}K`;
      }
      return value;
    };
    return { formatValue };
  },
});
</script>
