<template>
  <div class="flayrah-article-page">
    <div class="flayrah-article-toolbar d-flex flex-wrap align-center ga-2 pa-4">
      <v-btn
        variant="text"
        prepend-icon="mdi-arrow-left"
        :to="{ name: 'FlayrahFeed' }"
      >
        Back to feed
      </v-btn>
      <v-spacer />
      <v-btn
        v-if="article"
        :href="article.link"
        target="_blank"
        rel="noopener"
        variant="tonal"
        append-icon="mdi-open-in-new"
      >
        Open on Flayrah
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <div v-if="loading" class="pa-4">
      <v-skeleton-loader type="article" />
    </div>

    <article v-else-if="article" class="flayrah-article pa-4">
      <p class="text-overline text-medium-emphasis mb-1">Flayrah</p>
      <h1 class="text-h4 mb-2">{{ article.title }}</h1>
      <p class="text-body-2 text-medium-emphasis mb-3">
        By {{ article.author }}
        <template v-if="dateLabel"> · {{ dateLabel }}</template>
        ·
        <a :href="article.link" target="_blank" rel="noopener">Original on Flayrah</a>
      </p>
      <div v-if="article.tags.length" class="d-flex flex-wrap ga-1 mb-4">
        <v-chip
          v-for="tag in article.tags"
          :key="tag"
          size="small"
          variant="tonal"
          :to="{ name: 'FlayrahFeed', query: { tags: tag } }"
        >
          {{ tag }}
        </v-chip>
      </div>
      <!-- Sanitized in sanitizeFlayrahHtml before bind. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="flayrah-body text-body-1" v-html="bodyHtml" />
      <p class="text-caption text-medium-emphasis mt-6 mb-0">
        Content © Flayrah staff and contributors — some rights reserved. Default license is
        Creative Commons Attribution-ShareAlike. Attribution: {{ article.author }} /
        <a :href="article.link" target="_blank" rel="noopener">flayrah.com</a>.
      </p>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  fetchFlayrahArticles,
  findFlayrahArticle,
  type FlayrahArticle,
} from "@/worker/flayrah/api";
import { sanitizeFlayrahHtml } from "@/misc/util/flayrahHtml";
import { useSnackbarStore } from "@/services/SnackbarStore";

const route = useRoute();
const router = useRouter();
const snackbar = useSnackbarStore();

const article = ref<FlayrahArticle | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const articleId = computed(() => {
  const raw = route.params.id;
  const n = parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
  return Number.isFinite(n) ? n : 0;
});

const bodyHtml = computed(() =>
  article.value ? sanitizeFlayrahHtml(article.value.descriptionHtml) : "",
);

const dateLabel = computed(() => {
  if (!article.value?.publishedMs) return "";
  try {
    return new Date(article.value.publishedMs).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return article.value.publishedAt;
  }
});

async function load() {
  const id = articleId.value;
  if (!id) {
    snackbar.addMessage("Unknown Flayrah article");
    await router.replace({ name: "FlayrahFeed" });
    return;
  }
  loading.value = true;
  error.value = null;
  article.value = null;
  try {
    const list = await fetchFlayrahArticles();
    const hit = findFlayrahArticle(list, id);
    if (!hit) {
      snackbar.addMessage("Article not in the current Flayrah RSS feed");
      await router.replace({ name: "FlayrahFeed" });
      return;
    }
    article.value = hit;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load article.";
  } finally {
    loading.value = false;
  }
}

watch(articleId, () => {
  void load();
}, { immediate: true });
</script>

<style scoped>
.flayrah-article {
  max-width: 48rem;
  margin-inline: auto;
}
.flayrah-body :deep(img) {
  max-width: 100%;
  height: auto;
}
.flayrah-body :deep(figure) {
  margin: 1rem 0;
}
.flayrah-body :deep(blockquote) {
  border-inline-start: 3px solid rgba(var(--v-theme-primary), 0.5);
  padding-inline-start: 1rem;
  margin: 1rem 0;
  opacity: 0.95;
}
.flayrah-body :deep(a) {
  color: rgb(var(--v-theme-primary));
}
</style>
