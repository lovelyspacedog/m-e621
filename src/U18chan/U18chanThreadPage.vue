<template>
  <div class="u18-thread-page">
    <div class="u18-thread-header">
      <v-btn
        variant="text"
        size="small"
        prepend-icon="mdi-arrow-left"
        @click="goBack"
      >
        Catalog
      </v-btn>
      <div class="u18-thread-title-block">
        <span class="text-overline text-medium-emphasis">u18chan /{{ liveBoard }}/</span>
        <h1 class="text-h6 font-weight-bold">{{ thread?.subject || `Thread ${topicId}` }}</h1>
      </div>
      <v-btn
        icon
        variant="text"
        :loading="loading"
        aria-label="Refresh"
        @click="load"
      >
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <div v-if="loading && !thread" class="pa-4">
      <v-skeleton-loader type="article, image" />
    </div>

    <div v-else-if="thread" class="u18-posts">
      <article
        v-for="post in thread.posts"
        :id="`p${post.id}`"
        :key="post.id"
        class="u18-post"
        :class="{ 'u18-post--op': post.isOp }"
      >
        <header class="u18-post-meta">
          <strong v-if="post.subject" class="u18-post-subject">{{ post.subject }}</strong>
          <span class="u18-post-name">{{ post.name }}</span>
          <span class="text-medium-emphasis">{{ post.timestamp }}</span>
          <span class="text-medium-emphasis">No.{{ post.id }}</span>
        </header>
        <div v-if="post.images.length" class="u18-post-images">
          <a
            v-for="(img, i) in post.images"
            :key="i"
            :href="img.fullUrl"
            target="_blank"
            rel="noopener"
          >
            <img :src="img.thumbUrl || img.fullUrl" :alt="`Post ${post.id}`" loading="lazy" />
          </a>
        </div>
        <div class="u18-post-body" v-text="post.comment" />
      </article>
    </div>

    <v-card v-if="thread" class="u18-compose ma-4" variant="outlined">
      <v-card-title class="text-subtitle-1">Reply</v-card-title>
      <v-card-text>
        <u18chan-compose-form
          :live-board="liveBoard"
          :topic-id="topicId"
          :submitting="posting"
          @submit="onReply"
        />
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { createPost, getThread } from "@/worker/u18chan/api";
import type { U18chanPostPayload, U18chanThread } from "@/worker/u18chan/types";
import {
  DEFAULT_U18CHAN_INDEX,
  u18chanIndexBySlug,
} from "@/misc/util/u18chanBoards";
import U18chanComposeForm from "./U18chanComposeForm.vue";

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const posting = ref(false);
const error = ref<string | null>(null);
const thread = ref<U18chanThread | null>(null);

const indexBoard = computed(() =>
  String(route.params.board || DEFAULT_U18CHAN_INDEX).toLowerCase(),
);
const topicId = computed(() => Number(route.params.id || 0));
const liveBoard = computed(() => {
  const q = String(route.query.live || "").toLowerCase();
  if (q) return q;
  return u18chanIndexBySlug(indexBoard.value)?.live || "fur";
});

const load = async () => {
  if (!topicId.value) {
    error.value = "Missing thread id";
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    thread.value = await getThread(liveBoard.value, topicId.value, indexBoard.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load thread";
    thread.value = null;
  } finally {
    loading.value = false;
  }
};

const goBack = () => {
  void router.push({
    name: "U18chanCatalog",
    params: { board: indexBoard.value },
  });
};

const onReply = async (payload: Omit<U18chanPostPayload, "liveBoard" | "topicId">) => {
  posting.value = true;
  error.value = null;
  try {
    await createPost({
      ...payload,
      liveBoard: liveBoard.value,
      topicId: topicId.value,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to reply";
  } finally {
    posting.value = false;
  }
};

watch(
  () => [liveBoard.value, topicId.value] as const,
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<style scoped>
.u18-thread-page {
  max-width: 900px;
  margin: 0 auto;
  padding-bottom: 48px;
}
.u18-thread-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
}
.u18-thread-title-block {
  flex: 1;
  min-width: 0;
}
.u18-posts {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 16px;
}
.u18-post {
  padding: 12px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.08);
}
.u18-post--op {
  background: rgba(128, 128, 128, 0.14);
}
.u18-post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.85rem;
  margin-bottom: 8px;
}
.u18-post-subject {
  color: rgb(var(--v-theme-primary));
}
.u18-post-name {
  font-weight: 600;
}
.u18-post-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.u18-post-images img {
  max-width: 240px;
  max-height: 240px;
  border-radius: 4px;
  object-fit: contain;
}
.u18-post-body {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.95rem;
  line-height: 1.4;
}
</style>
