<template>
  <div>
    <div v-if="categories.length > 1" class="d-flex flex-wrap ga-1 mb-2">
      <v-chip
        size="small"
        :variant="categoryFilter === null ? 'flat' : 'outlined'"
        color="primary"
        @click="categoryFilter = null"
      >
        All
      </v-chip>
      <v-chip
        v-for="cat in categories"
        :key="cat"
        size="small"
        :variant="categoryFilter === cat ? 'flat' : 'outlined'"
        color="primary"
        @click="categoryFilter = cat"
      >
        {{ cat }}
      </v-chip>
    </div>
    <v-list>
      <v-list-item v-for="tag in visibleTags" :key="tag.name">
        <v-list-item-title>
          <TagLabel :tag="tag" />
        </v-list-item-title>
        <template #append>
          <div class="text-right mr-2">
            <div class="text-caption text-no-wrap">
              {{ formatMetric(tag) }}
            </div>
            <div
              class="metric-bar"
              :style="{ width: `${barWidth(tag)}%` }"
            />
          </div>
          <div v-if="tag.category">
            <TagMenu :tag="tag" />
          </div>
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>

<script lang="ts">
import type { DashboardTag } from "@/misc/util/dashboardMetrics";
import TagLabel from "@/Tag/TagLabel.vue";
import TagMenu from "@/Tag/TagMenu.vue";
import type { PropType } from "vue";
import { computed, defineComponent, ref } from "vue";

export default defineComponent({
  components: { TagLabel, TagMenu },
  props: {
    tags: {
      type: Array as PropType<DashboardTag[]>,
      required: true,
    },
  },
  setup(props) {
    const categoryFilter = ref<string | null>(null);

    const categories = computed(() =>
      [...new Set(props.tags.map((t) => t.category).filter(Boolean) as string[])].sort(),
    );

    const visibleTags = computed(() => {
      if (!categoryFilter.value) return props.tags;
      return props.tags.filter((t) => t.category === categoryFilter.value);
    });

    const maxMetric = computed(() =>
      Math.max(0, ...visibleTags.value.map((t) => t.metricValue || 0)),
    );

    const formatMetric = (tag: DashboardTag) => {
      if (tag.metricLabel === "posts") {
        return `${tag.metricValue} posts`;
      }
      return `${tag.metricValue} ${tag.metricLabel}`;
    };

    const barWidth = (tag: DashboardTag) => {
      if (!maxMetric.value) return 0;
      return Math.max(4, Math.round((tag.metricValue / maxMetric.value) * 100));
    };

    return {
      categoryFilter,
      categories,
      visibleTags,
      formatMetric,
      barWidth,
    };
  },
});
</script>

<style scoped>
.metric-bar {
  height: 3px;
  margin-top: 4px;
  border-radius: 2px;
  background: rgb(var(--v-theme-primary));
  max-width: 72px;
  margin-left: auto;
}
</style>
