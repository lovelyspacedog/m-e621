<template>
  <v-btn icon @click="button.onClick" :loading="button.loading" :disabled="button.disabled">
    <v-icon :color="button.color">{{ button.icon }}</v-icon>
  </v-btn>
</template>

<script lang="ts">
import { openPostOnSourceSite } from "@/misc/util/url";
import { savePostLocally } from "@/misc/util/saveLocal";
import { fluffleImageUrl, isFluffleStillPost } from "@/misc/util/fluffleSearch";
import { useSavedPostsStore, useSnackbarStore } from "@/services";
import type { ButtonType } from "@/services/types";
import type { EnhancedPost } from "@/worker/ApiService";
import type { PropType } from "vue";
import { computed, defineComponent, ref } from "vue";
import type { usePostListManager } from "./postListManager";

interface IButton {
  color: string;
  icon: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export default defineComponent({
  props: {
    type: {
      type: String as PropType<ButtonType>,
      required: true,
    },
    post: {
      type: Object as PropType<EnhancedPost>,
    },
  },
  setup(props, context) {
    const saving = ref(false);
    const snackbar = useSnackbarStore();
    const savedPosts = useSavedPostsStore();

    const bookmarked = computed(() => savedPosts.isSaved(props.post));
    const fluffleImageOk = computed(
      () => !!props.post && isFluffleStillPost(props.post) && !!fluffleImageUrl(props.post),
    );

    const buttons = computed<{ [key in ButtonType]: IButton }>(() => ({
      info: {
        color: "",
        icon: "mdi-information",
        onClick: () => {
          if (props.post) {
            context.emit("open-post-details", {
              postId: props.post.id,
              originMode: props.post.__meta?.originMode,
            });
          }
        },
      },
      fullscreen: {
        color: "",
        icon: "mdi-fullscreen",
        onClick: () => {
          if (props.post) {
            context.emit("open-post-fullscreen", {
              postId: props.post.id,
              originMode: props.post.__meta?.originMode,
            });
          }
        },
      },
      external: {
        color: "",
        icon: "mdi-open-in-new",
        onClick: () => {
          if (props.post) openPostOnSourceSite(props.post);
        },
      },
      favorite: {
        color: props.post?.is_favorited ? "red" : "",
        icon: props.post?.is_favorited ? "mdi-heart" : "mdi-heart-outline",
        loading: props.post?.__meta.isFavoriteLoading || false,
        onClick: async () => {
          if (!props.post) return;
          context.emit("set-post-favorite", {
            postId: props.post.id,
            favorited: !props.post.is_favorited,
            originMode: props.post.__meta?.originMode,
          } as Parameters<ReturnType<typeof usePostListManager>["setPostFavorite"]>["0"]);
        },
      },
      bookmark: {
        color: bookmarked.value ? "amber" : "",
        icon: bookmarked.value ? "mdi-bookmark" : "mdi-bookmark-outline",
        onClick: () => {
          if (!props.post) return;
          savedPosts.toggle(props.post);
        },
      },
      save_local: {
        color: "",
        icon: "mdi-download",
        loading: saving.value,
        // No post = settings palette; keep enabled so drag-and-drop works.
        disabled: props.post ? !props.post.file?.url || saving.value : false,
        onClick: async () => {
          if (!props.post?.file?.url || saving.value) return;
          saving.value = true;
          try {
            await savePostLocally(props.post);
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to save locally";
            snackbar.addMessage(message);
          } finally {
            saving.value = false;
          }
        },
      },
      fluffle: {
        color: "",
        icon: "mdi-image-search",
        // No post = settings palette; keep enabled so drag-and-drop works.
        disabled: props.post ? !fluffleImageOk.value : false,
        onClick: () => {
          if (!props.post || !fluffleImageOk.value) return;
          context.emit("open-fluffle-search", props.post);
        },
      },
    }));

    const button = computed(() => buttons.value[props.type]);

    return {
      button,
    };
  },
});
</script>
