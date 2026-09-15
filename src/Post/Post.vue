<template>
  <v-card
    :id="'post_' + feedKey"
    color="secondary"
    class="post-card"
    :class="{ compact: compactCards, expanded: forceExpanded }"
    tabindex="0"
    @click="onCardActivate"
  >
    <div :class="[blacklistClasses]" class="post-preview-wrap">
      <v-chip
        v-if="originLabel"
        class="origin-badge"
        size="x-small"
        color="secondary"
        variant="flat"
      >
        {{ originLabel }}
      </v-chip>
      <post-preview
        :file="post.file"
        :preview="post.preview"
        :sample="post.sample"
        :unplayable="isUnplayable"
        :local-path="post.__meta?.localPath || ''"
        @open-post="setClicked"
        @remuxed="$emit('remuxed')"
      />
    </div>
    <v-card-text class="post-card-chrome">
      <post-text :post="post" />
    </v-card-text>
    <v-card-actions class="post-card-chrome">
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
import { postFeedKey, unifiedChildLabel } from "@/misc/util/postOrigin";
import { useBlacklistStore, usePostsStore, useSiteModeStore } from "@/services";
import type { EnhancedPost } from "@/worker/ApiService";
import type { PropType, Ref } from "vue";
import { computed, defineComponent, inject, ref, type ComputedRef } from "vue";
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
  emits: ["open-post", "open-post-details", "set-post-favorite", "remuxed"],
  setup(props, context) {
    const blacklist = useBlacklistStore();
    const posts = usePostsStore();
    const siteMode = useSiteModeStore();
    const forceExpanded = ref(false);
    const feedIsGrid = inject<ComputedRef<boolean>>(
      "feedIsGrid",
      computed(() => false),
    );
    const postIsBlacklisted = computed(
      () => Boolean(props.post?.__meta.isBlacklisted), // TODO: types
    );
    const { classes: blacklistClasses } = useBlacklistClasses({
      mode: blacklist.mode,
      postIsBlacklisted,
    });
    const { stripeColor } = useStripeColor(props);

    const setClicked = () => {
      context.emit("open-post", {
        postId: props.post.id,
        originMode: props.post.__meta?.originMode,
      });
    };

    const buttons = computed(() => {
      let list = siteMode.filterButtons(posts.buttons);
      if (props.post.__meta?.originMode === "inkbunny") {
        list = list.filter((button) => button !== "favorite");
      }
      return list;
    });
    const originLabel = computed(() =>
      props.post.__meta?.originMode
        ? unifiedChildLabel(props.post.__meta.originMode)
        : "",
    );
    const feedKey = computed(() =>
      postFeedKey(props.post).replace(":", "-"),
    );
    const isUnplayable = computed(
      () => siteMode.isLocal && props.post.__meta?.localPlayable === false,
    );
    const compactCards = computed(
      () => posts.compactCards || feedIsGrid.value,
    );

    const onCardActivate = (event: MouseEvent) => {
      if (!compactCards.value) return;
      if ((event.target as HTMLElement | null)?.closest("button, a, video, input")) {
        return;
      }
      // Touch / click expands chrome once on coarse pointers.
      if (window.matchMedia("(hover: none)").matches) {
        forceExpanded.value = !forceExpanded.value;
      }
    };

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
      compactCards,
      forceExpanded,
      onCardActivate,
      originLabel,
      feedKey,
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
.post-card.compact:not(:hover):not(:focus-within):not(.expanded) .post-card-chrome {
  display: none;
}
.post-preview-wrap {
  position: relative;
}
.origin-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
}
</style>
