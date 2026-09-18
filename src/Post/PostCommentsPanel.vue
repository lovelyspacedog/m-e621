<template>
  <div class="post-comments-panel">
    <div class="mb-4">
      <v-textarea
        v-model="draftComment"
        label="Write a comment"
        variant="outlined"
        rows="3"
        auto-grow
        hide-details="auto"
        :disabled="postingComment"
        bg-color="surface"
      />
      <div class="d-flex justify-end mt-2">
        <v-btn
          color="accent"
          variant="flat"
          size="small"
          :loading="postingComment"
          :disabled="!draftComment.trim() || postingComment"
          @click="submitComment"
        >
          Post
        </v-btn>
      </div>
    </div>
    <div v-if="commentsLoading" class="text-center py-4">
      <v-progress-circular indeterminate color="accent" size="32" />
    </div>
    <div v-else-if="commentsError" class="text-medium-emphasis">
      {{ commentsError }}
    </div>
    <div v-else-if="!comments.length" class="text-medium-emphasis">
      No comments
    </div>
    <div v-else>
      <div v-for="comment in comments" :key="comment.id" class="mb-4">
        <div class="text-caption mb-1">
          {{ comment.creator_name }}
          · score {{ comment.score }}
        </div>
        <d-text :text="comment.body" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRaw, watch } from "vue";
import { useRouter } from "vue-router";
import DText from "@/Parser/DText.vue";
import type { EnhancedPost } from "@/worker/ApiService";
import type { Comment } from "@/worker/api";
import {
  useMainStore,
  useSiteModeStore,
  useSnackbarStore,
  useUrlStore,
} from "@/services";
import { originAuthForPost, postFeedKey } from "@/misc/util/postOrigin";
import { getApiService } from "@/worker/services";

const props = defineProps<{
  post: EnhancedPost;
}>();

const siteMode = useSiteModeStore();
const urlStore = useUrlStore();
const snackbar = useSnackbarStore();
const router = useRouter();
const main = useMainStore();

const comments = ref<Comment[]>([]);
const commentsLoading = ref(false);
const commentsError = ref<string | null>(null);
const commentsLoadedFor = ref<string | null>(null);
const draftComment = ref("");
const postingComment = ref(false);

const feedKey = computed(() => postFeedKey(props.post));

const loadComments = async (key: string) => {
  if (commentsLoadedFor.value === key) return;
  const postId = props.post.id;
  commentsLoading.value = true;
  commentsError.value = null;
  try {
    const service = await getApiService();
    const origin = originAuthForPost(
      props.post,
      main.$state,
      siteMode.activeMode,
    );
    const result = await service.getComments({
      postId,
      baseUrl: toRaw(origin.baseUrl),
      mode: toRaw(origin.mode),
      auth: toRaw(origin.auth),
    });
    // Ignore stale responses after the user switched posts (H6).
    if (postFeedKey(props.post) !== key) return;
    comments.value = result;
    commentsLoadedFor.value = key;
  } catch (error: unknown) {
    if (postFeedKey(props.post) !== key) return;
    commentsError.value = error instanceof Error ? error.message : String(error);
    comments.value = [];
  } finally {
    if (postFeedKey(props.post) === key) {
      commentsLoading.value = false;
    }
  }
};

const resetAndLoad = () => {
  comments.value = [];
  commentsLoadedFor.value = null;
  commentsError.value = null;
  draftComment.value = "";
  void loadComments(feedKey.value);
};

watch(
  feedKey,
  () => {
    resetAndLoad();
  },
  { immediate: true },
);

const submitComment = async () => {
  const post = props.post;
  const body = draftComment.value.trim();
  if (!post || !body || postingComment.value) return;
  const origin = originAuthForPost(post, main.$state, siteMode.activeMode);
  if (!origin.auth) {
    snackbar.addMessage(`Not logged in to ${origin.mode}`);
    router.push({ name: "AccountSettings" });
    return;
  }
  postingComment.value = true;
  try {
    const service = await getApiService();
    const created = await service.createComment({
      postId: post.id,
      body,
      auth: toRaw(origin.auth),
      proxyUrl: toRaw(urlStore.proxyUrl),
      baseUrl: toRaw(origin.baseUrl),
      mode: toRaw(origin.mode),
    });
    comments.value = [...comments.value, created];
    post.comment_count = (post.comment_count || 0) + 1;
    draftComment.value = "";
    snackbar.addMessage("Comment posted");
  } catch (error: unknown) {
    snackbar.addMessage(error instanceof Error ? error.message : String(error));
  } finally {
    postingComment.value = false;
  }
};
</script>
