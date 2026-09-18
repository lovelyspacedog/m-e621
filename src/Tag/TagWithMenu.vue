<template>
  <TagMenu :tag="tag" :origin-mode="originMode">
    <template #default="{ props }">
      <v-chip :color="color" variant="outlined" class="mr-2 mb-2" v-bind="props" :small="small">
        <v-icon v-if="icon">{{ icon }}</v-icon>
        <span :class="{ 'ml-2': icon }">
          {{ tag.name }}
        </span>
      </v-chip>
    </template>
  </TagMenu>
</template>

<script lang="ts">
import { getTagColorFromCategory, getTagIconFromCategory } from "@/misc/util/utilities";
import type { PropType } from "vue";
import { computed, defineComponent } from "vue";
import type { ITag } from "./ITag";
import TagMenu from "./TagMenu.vue";
import type { PoolOriginMode } from "@/services/types";

export default defineComponent({
  inheritAttrs: false,
  props: {
    tag: {
      type: Object as PropType<ITag>,
      required: true,
    },
    small: {
      type: Boolean,
      default: false
    },
    originMode: {
      type: String as PropType<PoolOriginMode | null>,
      default: null,
    },
  },
  setup(props) {
    const color = computed(() => getTagColorFromCategory(props.tag.category));
    const icon = computed(() => getTagIconFromCategory(props.tag.category));
    return {
      color,
      icon,
    };
  },
  components: { TagMenu }
});
</script>
