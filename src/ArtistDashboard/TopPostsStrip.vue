<template>
  <div class="top-posts d-flex flex-row ga-2 overflow-x-auto pb-1">
    <button
      v-for="post in posts"
      :key="post.id"
      type="button"
      class="top-post"
      :title="`#${post.id} · ${post.fav_count} favs`"
      @click="$emit('select', post)"
    >
      <img
        class="top-post-img"
        :src="post.preview.url"
        :alt="`Post ${post.id}`"
        loading="lazy"
      />
      <div class="top-post-meta text-caption">
        {{ post.fav_count }} favs
      </div>
    </button>
  </div>
</template>

<script lang="ts">
import type { EnhancedPost } from "@/worker/ApiService";
import type { PropType } from "vue";
import { defineComponent } from "vue";

export default defineComponent({
  props: {
    posts: {
      type: Array as PropType<EnhancedPost[]>,
      required: true,
    },
  },
  emits: {
    select: (post: EnhancedPost) => {
      void post;
      return true;
    },
  },
});
</script>

<style scoped>
.top-post {
  flex: 0 0 auto;
  width: 96px;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: inherit;
}
.top-post-img {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.top-post-meta {
  margin-top: 4px;
  opacity: 0.8;
}
</style>
