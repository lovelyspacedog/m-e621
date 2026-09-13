<template>
  <v-card :id="'post_' + post.id" color="secondary" class="post-card">
    <div :class="[blacklistClasses]">
      <post-preview
        :file="post.file"
        :preview="post.preview"
        :sample="post.sample"
        :unplayable="isUnplayable"
        @open-post="setClicked"
      />
    </div>
    <v-card-text>
      <post-text :post="post" />
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <post-buttons
        :buttons="buttons"
        :post="post"
        @open-post-details="$emit('open-post-details', $event)"
        @open-post-fullscreen="setClicked"
        @set-post-favorite="$emit('set-post-favorite', $event)"
      />
    </v-card-actions>
    <div class="post-card-footer">
      <div
        v-if="showAutoNextProgress"
        class="auto-next-progress"
        :class="{ paused: autoNext.paused.value }"
      >
        <div class="auto-next-progress__bar" :style="{ width: autoNext.progress.value + '%' }" />
      </div>
      <div :class="stripeColor" :style="{ height: '5px' }" />
    </div>
  </v-card>
</template>

<script lang="ts">
import { useBlacklistClasses } from "@/misc/util/blacklist";
import { useBlacklistStore, usePostsStore, useSiteModeStore } from "@/services";
import type { EnhancedPost } from "@/worker/ApiService";
import type { PropType, Ref } from "vue";
import { computed, defineComponent, inject, ref } from "vue";
import PostButtons from "./PostButtons.vue";
import PostPreview from "./PostPreview.vue";
import PostText from "./PostText.vue";
import { useStripeColor } from "./stripeColor";

export type CardAutoNextInject = {
  activeId: Ref<number | null>;
  progress: Ref<number>;
  paused: Ref<boolean>;
};

const fallbackAutoNext: CardAutoNextInject = {
  activeId: ref(null),
  progress: ref(0),
  paused: ref(false),
};

export default defineComponent({
  components: {
    PostButtons,
    PostPreview,
    PostText,
  },
  props: {
    post: {
      type: Object as PropType<EnhancedPost>,
      required: true,
    },
  },
  setup(props, context) {
    const blacklist = useBlacklistStore();
    const posts = usePostsStore();
    const siteMode = useSiteModeStore();
    const postIsBlacklisted = computed(
      () => Boolean(props.post?.__meta.isBlacklisted), // TODO: types
    );
    const { classes: blacklistClasses } = useBlacklistClasses({
      mode: blacklist.mode,
      postIsBlacklisted,
    });
    const { stripeColor } = useStripeColor(props);

    const setClicked = () => {
      context.emit("open-post", props.post.id);
    };

    const buttons = computed(() => siteMode.filterButtons(posts.buttons));
    const isUnplayable = computed(
      () => siteMode.isLocal && props.post.__meta?.localPlayable === false,
    );

    const autoNext = inject<CardAutoNextInject>("cardAutoNext", fallbackAutoNext);
    const showAutoNextProgress = computed(
      () =>
        posts.cardAutoNext &&
        autoNext.activeId.value === props.post.id &&
        autoNext.progress.value > 0,
    );

    return {
      blacklistClasses,
      stripeColor,
      setClicked,
      buttons,
      isUnplayable,
      autoNext,
      showAutoNextProgress,
    };
  },
});
</script>

<style scoped>
.post-card-footer {
  position: relative;
}
.auto-next-progress {
  position: absolute;
  left: 0;
  right: 0;
  top: -3px;
  height: 3px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.auto-next-progress.paused .auto-next-progress__bar {
  opacity: 0.45;
}
.auto-next-progress__bar {
  height: 100%;
  background: rgb(var(--v-theme-accent));
  transition: width 80ms linear;
}
</style>
