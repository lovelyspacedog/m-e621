<template>
  <v-list density="compact">
    <template v-for="(tag, index) in visibleTags" :key="index">
      <v-list-item density="compact" class="suggestion-row">
        <div>
          <tag-label :tag="tag" />
        </div>
        <template #append class="ma-0">
          <div v-if="tag.post_count" class="text-grey text-caption mr-2">
            {{ tag.post_count }}
          </div>
          <template v-if="tag.category">
            <tag-favorite-button
              :category="tag.category"
              :name="tag.name"
              class="mr-2 suggestion-action"
            />
            <tag-menu :tag="tag" class="suggestion-action" />
          </template>
        </template>
      </v-list-item>
    </template>
    <v-list-item v-if="canToggleMore" density="compact" @click="expanded = !expanded">
      <v-list-item-title class="text-caption text-accent">
        {{ expanded ? "Show less" : `Show more (${hiddenCount})` }}
      </v-list-item-title>
    </v-list-item>
  </v-list>
</template>

<script lang="ts">
import type { PropType } from "vue";
import { computed, defineComponent, ref, watch } from "vue";
import TagLabel from "../Tag/TagLabel.vue";
import TagFavoriteButton from "@/Tag/TagFavoriteButton.vue";
import TagMenu from "@/Tag/TagMenu.vue";
import type { ITag } from "@/Tag/ITag";

const INITIAL_VISIBLE = 12;

export default defineComponent({
  components: {
    TagLabel,
    TagFavoriteButton,
    TagMenu,
  },
  props: {
    tags: {
      type: Array as PropType<ITag[]>,
      required: true,
    },
  },
  setup(props) {
    const expanded = ref(false);
    watch(
      () => props.tags,
      () => {
        expanded.value = false;
      },
    );
    const visibleTags = computed(() =>
      expanded.value ? props.tags : props.tags.slice(0, INITIAL_VISIBLE),
    );
    const hiddenCount = computed(() =>
      Math.max(0, props.tags.length - INITIAL_VISIBLE),
    );
    const canToggleMore = computed(() => props.tags.length > INITIAL_VISIBLE);
    return {
      expanded,
      visibleTags,
      hiddenCount,
      canToggleMore,
    };
  },
});
</script>

<style scoped>
.suggestion-action {
  opacity: 0;
  transition: opacity 0.12s ease;
}
.suggestion-row:hover .suggestion-action,
.suggestion-row:focus-within .suggestion-action {
  opacity: 1;
}
@media (hover: none) {
  .suggestion-action {
    opacity: 1;
  }
}
</style>
