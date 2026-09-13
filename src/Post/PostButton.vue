<template>
  <v-btn icon @click="button.onClick" :loading="button.loading" :disabled="button.disabled">
    <v-icon :color="button.color">{{ button.icon }}</v-icon>
  </v-btn>
</template>

<script lang="ts">
import { openE6PostInStandaloneWindow } from "@/misc/util/url";
import { savePostLocally } from "@/misc/util/saveLocal";
import { useSnackbarStore } from "@/services";
import type { ButtonType } from "@/services/types";
import type { EnhancedPost } from "@/worker/ApiService";
import type { PropType } from "vue";
import { computed, defineComponent, ref } from "vue";
import type { usePostListManager } from "./postListManager";

interface IButton {
  color: any;
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

    const buttons = computed<{ [key in ButtonType]: IButton }>(() => ({
      info: {
        color: "",
        icon: "mdi-information",
        onClick: () => {
          if (props.post) context.emit("open-post-details", props.post.id);
        },
      },
      fullscreen: {
        color: "",
        icon: "mdi-fullscreen",
        onClick: () => {
          if (props.post) context.emit("open-post-fullscreen", props.post.id);
        },
      },
      external: {
        color: "",
        icon: "mdi-open-in-new",
        onClick: () => {
          if (props.post) openE6PostInStandaloneWindow(props.post.id);
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
          } as Parameters<ReturnType<typeof usePostListManager>["setPostFavorite"]>["0"]);
        },
      },
      save_local: {
        color: "",
        icon: "mdi-download",
        loading: saving.value,
        disabled: !props.post?.file?.url || saving.value,
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
    }));

    const button = computed(() => buttons.value[props.type]);

    return {
      button,
    };
  },
});
</script>
