<template>
  <div class="news-article-page">
    <div class="news-article-toolbar d-flex flex-wrap align-center ga-2 pa-4">
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
        @click="goPrev"
      >
        <v-icon>mdi-chevron-up</v-icon>
      </v-btn>
      <v-btn
        variant="text"
        icon
        :disabled="!nextId"
        aria-label="Next article"
        @click="goNext"
      >
        <v-icon>mdi-chevron-down</v-icon>
      </v-btn>
      <v-spacer />
      <v-btn
        v-if="article"
        variant="text"
        :prepend-icon="
          newsStore.isRead(article.id)
            ? 'mdi-email-open-outline'
            : 'mdi-email-outline'
        "
        @click="toggleRead"
      >
        {{ newsStore.isRead(article.id) ? "Mark unread" : "Mark read" }}
      </v-btn>
      <v-btn
        v-if="article"
        variant="text"
        :prepend-icon="saved ? 'mdi-bookmark' : 'mdi-bookmark-outline'"
        @click="toggleSave"
      >
        {{ saved ? "Saved" : "Save" }}
      </v-btn>
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
        Open on {{ sourceLabel }}
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <div v-if="loading" class="pa-4">
      <v-skeleton-loader type="article" />
    </div>

    <article v-else-if="article" class="news-article pa-4">
      <p class="text-overline text-medium-emphasis mb-1">
        {{ sourceLabel }}
        <template v-if="article.fromArchive"> · Archive</template>
      </p>
      <h1 class="text-h4 mb-2">{{ article.title }}</h1>
      <p class="text-body-2 text-medium-emphasis mb-3">
        By
        <router-link class="news-inline-link" :to="authorFilterRoute">
          {{ article.author }}
        </router-link>
        <template v-if="dateLabel"> · {{ dateLabel }}</template>
        ·
        <a :href="article.link" target="_blank" rel="noopener">
          Original on {{ sourceLabel }}
        </a>
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
      <!-- Sanitized in sanitizeNewsHtml before bind. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="news-body text-body-1" v-html="bodyHtml" />
      <p class="text-caption text-medium-emphasis mt-6 mb-0">
        <template v-if="article.source === 'flayrah'">
          Content © Flayrah staff and contributors — some rights reserved. Default license is
          Creative Commons Attribution-ShareAlike. Attribution: {{ article.author }} /
          <a :href="article.link" target="_blank" rel="noopener">flayrah.com</a>.
        </template>
        <template v-else>
          Content © Dogpatch Press and contributors. Attribution: {{ article.author }} /
          <a :href="article.link" target="_blank" rel="noopener">dogpatch.press</a>.
          PawFeed shows the public RSS for reading with a link back to the original.
        </template>
      </p>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  fetchNewsArticles,
  resolveNewsArticle,
  type NewsArticle,
} from "@/worker/news/api";
import { normalizeFlayrahFeedId, normalizeNewsSourceFilter } from "@/worker/news/feeds";
import {
  isNewsSource,
  makeNewsId,
  newsSourceLabel,
  parseNewsId,
} from "@/worker/news/ids";
import { saveNewsArticleOffline } from "@/worker/news/offlineCache";
import {
  articleMatchesQuery,
  parseNewsQueryTerms,
} from "@/worker/news/parseRss";
import { sanitizeNewsHtml } from "@/misc/util/newsHtml";
import { useNewsStore, useSnackbarStore } from "@/services";

const route = useRoute();
const router = useRouter();
const snackbar = useSnackbarStore();
const newsStore = useNewsStore();

const article = ref<NewsArticle | null>(null);
const siblings = ref<NewsArticle[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const articleId = computed(() => {
  const rawSource = route.params.source;
  const rawId = route.params.id;
  const sourceStr = String(Array.isArray(rawSource) ? rawSource[0] : rawSource);
  const idStr = String(Array.isArray(rawId) ? rawId[0] : rawId);
  if (!isNewsSource(sourceStr)) return "";
  const n = parseInt(idStr, 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  return makeNewsId(sourceStr, n);
});

const parsedRoute = computed(() => parseNewsId(articleId.value));

const sourceFilter = computed(() =>
  normalizeNewsSourceFilter(route.query.source),
);
const feedId = computed(() => normalizeFlayrahFeedId(route.query.feed));
const tagsQuery = computed(() => {
  const raw = route.query.tags;
  return typeof raw === "string" ? raw : "";
});
const viewQuery = computed(() => {
  const raw = route.query.view;
  return raw === "unread" || raw === "saved" ? raw : "";
});

const feedQuery = computed(() => {
  const q: Record<string, string> = {};
  if (sourceFilter.value !== "all") q.source = sourceFilter.value;
  if (sourceFilter.value === "flayrah" && feedId.value !== "full") {
    q.feed = feedId.value;
  }
  if (tagsQuery.value.trim()) q.tags = tagsQuery.value.trim();
  if (viewQuery.value) q.view = viewQuery.value;
  return q;
});

const feedRoute = computed(() => ({
  name: "NewsFeed" as const,
  query: feedQuery.value,
}));

const authorFilterRoute = computed(() => ({
  name: "NewsFeed" as const,
  query: {
    ...feedQuery.value,
    tags: article.value?.author || "",
  },
}));

function tagFilterRoute(tag: string) {
  return {
    name: "NewsFeed" as const,
    query: { ...feedQuery.value, tags: tag },
  };
}

function articleRoute(id: string) {
  const parsed = parseNewsId(id);
  return {
    name: "NewsArticle" as const,
    params: {
      source: parsed?.source || "flayrah",
      id: String(parsed?.numericId || ""),
    },
    query: feedQuery.value,
  };
}

const filteredSiblings = computed(() => {
  const terms = parseNewsQueryTerms(tagsQuery.value);
  let list = siblings.value.filter((a) => articleMatchesQuery(a, terms));
  if (viewQuery.value === "unread") {
    list = list.filter((a) => !newsStore.isRead(a.id) || a.id === articleId.value);
  } else if (viewQuery.value === "saved") {
    list = list.filter((a) => newsStore.isSaved(a.id) || a.id === articleId.value);
  }
  return list;
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

const saved = computed(() =>
  article.value ? newsStore.isSaved(article.value.id) : false,
);

const sourceLabel = computed(() =>
  article.value ? newsSourceLabel(article.value.source) : "News",
);

const bodyHtml = computed(() =>
  article.value
    ? sanitizeNewsHtml(article.value.descriptionHtml, article.value.source)
    : "",
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

function goPrev() {
  if (prevId.value) void router.push(articleRoute(prevId.value));
}

function goNext() {
  if (nextId.value) void router.push(articleRoute(nextId.value));
}

function toggleSave() {
  if (!article.value) return;
  const nowSaved = newsStore.toggleSaved(article.value);
  snackbar.addMessage(nowSaved ? "Saved article" : "Removed from saved");
}

function toggleRead() {
  if (!article.value) return;
  if (newsStore.isRead(article.value.id)) {
    newsStore.markUnread(article.value.id);
    snackbar.addMessage("Marked unread");
  } else {
    newsStore.markRead(article.value.id);
    snackbar.addMessage("Marked read");
  }
}

async function copyInAppLink() {
  if (!article.value || !parsedRoute.value) return;
  const origin = `${location.origin}${location.pathname}${location.search}`;
  const qs = new URLSearchParams(feedQuery.value).toString();
  const link = `${origin}#/news/${parsedRoute.value.source}/${parsedRoute.value.numericId}${qs ? `?${qs}` : ""}`;
  try {
    await navigator.clipboard.writeText(link);
    snackbar.addMessage("Copied in-app link");
  } catch {
    snackbar.addMessage("Could not copy link");
  }
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

function onKeydown(e: KeyboardEvent) {
  if (isTypingTarget(e.target)) return;
  if (e.key === "j" || e.key === "ArrowDown" || e.key === "ArrowRight") {
    if (!nextId.value) return;
    e.preventDefault();
    goNext();
    return;
  }
  if (e.key === "k" || e.key === "ArrowUp" || e.key === "ArrowLeft") {
    if (!prevId.value) return;
    e.preventDefault();
    goPrev();
    return;
  }
  if (e.key === "s") {
    e.preventDefault();
    toggleSave();
    return;
  }
  if (e.key === "u") {
    e.preventDefault();
    toggleRead();
  }
}

async function load() {
  const id = articleId.value;
  if (!id) {
    snackbar.addMessage("Unknown news article");
    await router.replace(feedRoute.value);
    return;
  }
  loading.value = true;
  error.value = null;
  article.value = null;
  try {
    const [hit, list] = await Promise.all([
      resolveNewsArticle(id, {
        source: sourceFilter.value,
        feed: feedId.value,
      }),
      fetchNewsArticles({
        source: sourceFilter.value,
        feed: feedId.value,
      }).catch(() => [] as NewsArticle[]),
    ]);
    siblings.value = list;
    if (!hit) {
      snackbar.addMessage("Could not load news article");
      await router.replace(feedRoute.value);
      return;
    }
    article.value = hit;
    newsStore.markRead(hit.id);
    if (hit.descriptionHtml) void saveNewsArticleOffline(hit);
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load article.";
  } finally {
    loading.value = false;
  }
}

watch(
  () => [articleId.value, sourceFilter.value, feedId.value] as const,
  () => {
    void load();
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<style scoped>
.news-article {
  max-width: 48rem;
  margin-inline: auto;
}
.news-body :deep(img) {
  max-width: 100%;
  height: auto;
}
.news-body :deep(figure) {
  float: right;
  margin: 0 0 1rem 1.25rem;
  max-width: min(45%, 20rem);
  text-align: center;
}
.news-body :deep(figure img) {
  width: 100%;
  height: auto;
}
.news-body :deep(figcaption) {
  font-style: italic;
  font-size: 0.875em;
  opacity: 0.85;
  margin-top: 0.35rem;
}
.news-body :deep(blockquote) {
  border-inline-start: 3px solid rgba(var(--v-theme-primary), 0.5);
  padding-inline-start: 1rem;
  margin: 1rem 0;
  opacity: 0.95;
}
.news-body :deep(a) {
  color: rgb(var(--v-theme-primary));
}
@media (max-width: 600px) {
  .news-body :deep(figure) {
    float: none;
    margin: 1rem 0;
    max-width: 100%;
  }
}
.news-inline-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
