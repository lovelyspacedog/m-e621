<template>
  <v-dialog
    :model-value="!!post"
    max-width="560"
    scrollable
    @update:model-value="onToggle"
  >
    <v-card v-if="post">
      <v-img
        v-if="imageUrl"
        :src="imageUrl"
        max-height="360"
        cover
      />
      <v-card-title class="d-flex align-center">
        Post #{{ post.id }}
        <v-spacer />
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap ga-3 text-body-2">
          <span>{{ post.fav_count.toLocaleString() }} favorites</span>
          <span>
            score {{ post.score.total }}
            ({{ post.score.up }} / {{ post.score.down }})
          </span>
          <span>{{ post.comment_count }} comments</span>
          <span>rating {{ post.rating }}</span>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" :to="postsRoute" @click="close">
          Open in Posts
        </v-btn>
        <v-btn
          variant="text"
          :href="externalUrl"
          target="_blank"
          rel="noopener"
        >
          Open on site
          <v-icon end>mdi-open-in-new</v-icon>
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="close">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { useUrlStore } from "@/services";
import type { EnhancedPost } from "@/worker/ApiService";
import type { PropType } from "vue";
import { computed, defineComponent } from "vue";
import type { RouteLocationRaw } from "vue-router";

export default defineComponent({
  props: {
    post: {
      type: Object as PropType<EnhancedPost | null>,
      default: null,
    },
  },
  emits: {
    close: () => true,
  },
  setup(props, { emit }) {
    const urlStore = useUrlStore();

    const imageUrl = computed(
      () => props.post?.sample.url || props.post?.preview.url || "",
    );

    const postsRoute = computed<RouteLocationRaw>(() => ({
      name: "Posts",
      query: { tags: `id:${props.post?.id ?? 0}` },
    }));

    const externalUrl = computed(
      () => `${urlStore.e621Url}posts/${props.post?.id ?? 0}`,
    );

    const close = () => emit("close");
    const onToggle = (open: boolean) => {
      if (!open) close();
    };

    return {
      imageUrl,
      postsRoute,
      externalUrl,
      close,
      onToggle,
    };
  },
});
</script>
