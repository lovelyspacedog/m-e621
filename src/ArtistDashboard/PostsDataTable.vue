<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <v-select
        v-model="ratingFilter"
        :items="ratingItems"
        label="Rating"
        density="compact"
        hide-details
        multiple
        chips
        clearable
        style="max-width: 280px"
      />
      <v-text-field
        v-model.number="minFavs"
        type="number"
        label="Min favorites"
        density="compact"
        hide-details
        style="max-width: 140px"
      />
      <v-text-field
        v-model.number="minScore"
        type="number"
        label="Min score"
        density="compact"
        hide-details
        style="max-width: 140px"
      />
      <v-menu>
        <template #activator="{ props }">
          <v-btn v-bind="props" variant="text" size="small">
            Columns
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="showUpdated = !showUpdated">
            <template #prepend>
              <v-checkbox-btn :model-value="showUpdated" />
            </template>
            <v-list-item-title>Last Updated</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
      <v-chip v-if="dayFilter" size="small" closable @click:close="$emit('clear-day')">
        Day {{ dayFilter }}
      </v-chip>
    </div>
    <v-data-table
      :items="filtered"
      :headers="headers"
      :sort-by="[{ key: 'fav_count', order: 'desc' }]"
    >
      <template #item.preview="{ item }">
        <button type="button" class="thumb-btn" @click="$emit('select', item)">
          <img
            class="thumb"
            :src="item.preview.url"
            :alt="`Post ${item.id}`"
            loading="lazy"
          />
        </button>
      </template>
      <template #item.score.total="{ item }">
        {{ item.score.total }}
        <span class="half-opacity-text">
          ({{ item.score.up }} - {{ item.score.down }})
        </span>
      </template>
      <template #item.created_at="{ item }">
        <DateDisplay :value="item.created_at" />
      </template>
      <template #item.updated_at="{ item }">
        <DateDisplay :value="item.updated_at" />
      </template>
      <template #item.rating="{ item }">
        <v-icon :color="getColor(item.rating)">mdi-circle-medium</v-icon>
      </template>
      <template #item.buttons="{ item }">
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn
              :to="{ name: 'Posts', query: { tags: `id:${item.id}` } }"
              v-bind="props"
              icon
            >
              <v-icon>mdi-image-search</v-icon>
            </v-btn>
          </template>
          <span>Open in Posts</span>
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn
              :href="`${urlStore.e621Url}posts/${item.id}`"
              target="_blank"
              v-bind="props"
              icon
            >
              <v-icon>mdi-open-in-new</v-icon>
            </v-btn>
          </template>
          <span>Open on site</span>
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn
              :href="`${urlStore.e621Url}post_versions?search[post_id]=${item.id}`"
              target="_blank"
              v-bind="props"
              icon
            >
              <v-icon>mdi-history</v-icon>
            </v-btn>
          </template>
          <span>View edits on site</span>
        </v-tooltip>
      </template>
    </v-data-table>
  </div>
</template>

<script lang="ts">
import { getColor } from "@/Post/stripeColor";
import { useUrlStore } from "@/services";
import type { EnhancedPost } from "@/worker/ApiService";
import { format, parseISO } from "date-fns";
import type { PropType } from "vue";
import { computed, defineComponent, ref } from "vue";
import DateDisplay from "./DateDisplay.vue";

type Header = {
  title: string;
  value: string;
  width?: number;
  sortable?: boolean;
  cellClass?: string;
  divider?: boolean;
};

export default defineComponent({
  components: { DateDisplay },
  props: {
    posts: {
      type: Array as PropType<EnhancedPost[]>,
      required: true,
    },
    dayFilter: {
      type: String as PropType<string | null>,
      default: null,
    },
  },
  emits: {
    select: (_post: EnhancedPost) => true,
    "clear-day": () => true,
  },
  setup(props) {
    const urlStore = useUrlStore();
    const ratingFilter = ref<Array<"s" | "q" | "e">>([]);
    const minFavs = ref<number | null>(null);
    const minScore = ref<number | null>(null);
    const showUpdated = ref(false);

    const ratingItems = [
      { title: "SFW", value: "s" },
      { title: "Questionable", value: "q" },
      { title: "Explicit", value: "e" },
    ];

    const filtered = computed(() =>
      props.posts.filter((post) => {
        if (ratingFilter.value.length && !ratingFilter.value.includes(post.rating)) {
          return false;
        }
        if (minFavs.value != null && post.fav_count < minFavs.value) {
          return false;
        }
        if (minScore.value != null && post.score.total < minScore.value) {
          return false;
        }
        if (props.dayFilter) {
          const day = format(parseISO(post.created_at), "yyyy-MM-dd");
          if (day !== props.dayFilter) return false;
        }
        return true;
      }),
    );

    const headers = computed<Header[]>(() => {
      const cols: Header[] = [
        { title: "", value: "preview", sortable: false, width: 56 },
        { title: "Rating", value: "rating", width: 0, sortable: false },
        { title: "Post ID", value: "id" },
        { title: "Favorites", value: "fav_count" },
        { title: "Score", value: "score.total", cellClass: "text-no-wrap" },
        { title: "Comments", value: "comment_count", divider: true },
        {
          title: "Created",
          value: "created_at",
          cellClass: "text-no-wrap width-0",
        },
      ];
      if (showUpdated.value) {
        cols.push({
          title: "Last Updated",
          value: "updated_at",
          cellClass: "text-no-wrap width-0",
          divider: true,
        });
      }
      cols.push({
        title: "",
        value: "buttons",
        sortable: false,
        cellClass: "text-no-wrap",
        width: 0,
      });
      return cols;
    });

    return {
      headers,
      filtered,
      ratingFilter,
      ratingItems,
      minFavs,
      minScore,
      showUpdated,
      getColor,
      urlStore,
    };
  },
});
</script>

<style scoped>
.thumb-btn {
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  display: block;
}
</style>
