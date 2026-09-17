<template>
  <div class="flayrah-article-page">
    <div class="flayrah-article-toolbar d-flex flex-wrap align-center ga-2 pa-4">
      <v-btn
        variant="text"
        prepend-icon="mdi-arrow-left"
        :to="feedRoute"
      >
        Back to feed
      </v-btn>
      <v-btn
        variant="text"
        icon
        :disabled="!prevId"
        aria-label="Previous article"
        @click="prevId && router.push(articleRoute(prevId))"
      >
        <v-icon>mdi-chevron-up</v-icon>
      </v-btn>
      <v-btn
        variant="text"
        icon
        :disabled="!nextId"
        aria-label="Next article"
        @click="nextId && router.push(articleRoute(nextId))"
      >
        <v-icon>mdi-chevron-down</v-icon>
      </v-btn>
      <v-spacer />
      <v-btn
        v-if="article"
        variant="text"
        prepend-icon="mdi-link-variant"
        @click="copyInAppLink"
      >
        Copy link
      </v-btn>
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
      <p class="text-overline text-medium-emphasis mb-1">
        Flayrah
        <template v-if="article.fromArchive"> · Archive</template>
      </p>
      <h1 class="text-h4 mb-2">{{ article.title }}</h1>
      <p class="text-body-2 text-medium-emphasis mb-3">
        By
        <router-link class="flayrah-inline-link" :to="authorFilterRoute">
          {{ article.author }}
        </router-link>
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
          :to="tagFilterRoute(tag)"
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
  resolveFlayrahArticle,
  type FlayrahArticle,
} from "@/worker/flayrah/api";
import { normalizeFlayrahFeedId } from "@/worker/flayrah/feeds";
import {
  articleMatchesQuery,
  parseFlayrahQueryTerms,
} from "@/worker/flayrah/parseRss";
import { sanitizeFlayrahHtml } from "@/misc/util/flayrahHtml";
import { useSnackbarStore } from "@/services/SnackbarStore";

const route = useRoute();
const router = useRouter();
const snackbar = useSnackbarStore();

const article = ref<FlayrahArticle | null>(null);
const siblings = ref<FlayrahArticle[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const articleId = computed(() => {
  const raw = route.params.id;
  const n = parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
  return Number.isFinite(n) ? n : 0;
});

const feedId = computed(() => normalizeFlayrahFeedId(route.query.feed));
const tagsQuery = computed(() => {
  const raw = route.query.tags;
  return typeof raw === "string" ? raw : "";
});

const feedQuery = computed(() => {
  const q: Record<string, string> = {};
  if (feedId.value !== "full") q.feed = feedId.value;
  if (tagsQuery.value.trim()) q.tags = tagsQuery.value.trim();
  return q;
});

const feedRoute = computed(() => ({
  name: "FlayrahFeed" as const,
  query: feedQuery.value,
}));

const authorFilterRoute = computed(() => ({
  name: "FlayrahFeed" as const,
  query: {
    ...feedQuery.value,
    tags: article.value?.author || "",
  },
}));

function tagFilterRoute(tag: string) {
  return {
    name: "FlayrahFeed" as const,
    query: { ...feedQuery.value, tags: tag },
  };
}

function articleRoute(id: number) {
  return {
    name: "FlayrahArticle" as const,
    params: { id: String(id) },
    query: feedQuery.value,
  };
}

const filteredSiblings = computed(() => {
  const terms = parseFlayrahQueryTerms(tagsQuery.value);
  return siblings.value.filter((a) => articleMatchesQuery(a, terms));
});

const siblingIndex = computed(() =>
  filteredSiblings.value.findIndex((a) => a.id === articleId.value),
);

const prevId = computed(() => {
  const i = siblingIndex.value;
  if (i <= 0) return null;
  return filteredSiblings.value[i - 1]?.id ?? null;
});

const nextId = computed(() => {
  const i = siblingIndex.value;
  if (i < 0 || i >= filteredSiblings.value.length - 1) return null;
  return filteredSiblings.value[i + 1]?.id ?? null;
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

async function copyInAppLink() {
  if (!article.value) return;
  const origin = `${location.origin}${location.pathname}${location.search}`;
  const link = `${origin}#/flayrah/${article.value.id}`;
  try {
    await navigator.clipboard.writeText(link);
    snackbar.addMessage("Copied in-app link");
  } catch {
    snackbar.addMessage("Could not copy link");
  }
}

async function load() {
  const id = articleId.value;
  if (!id) {
    snackbar.addMessage("Unknown Flayrah article");
    await router.replace(feedRoute.value);
    return;
  }
  loading.value = true;
  error.value = null;
  article.value = null;
  try {
    const [hit, list] = await Promise.all([
      resolveFlayrahArticle(id, { feed: feedId.value }),
      fetchFlayrahArticles({ feed: feedId.value }).catch(() => [] as FlayrahArticle[]),
    ]);
    siblings.value = list;
    if (!hit) {
      snackbar.addMessage("Could not load Flayrah article");
      await router.replace(feedRoute.value);
      return;
    }
    article.value = hit;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load article.";
  } finally {
    loading.value = false;
  }
}

watch(
  () => [articleId.value, feedId.value] as const,
  () => {
    void load();
  },
  { immediate: true },
);
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
.flayrah-inline-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
