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
      <v-btn-toggle
        v-if="article"
        :model-value="newsStore.readerFontScale"
        density="compact"
        variant="outlined"
        divided
        mandatory
        class="news-reader-toggle"
        @update:model-value="onFontScale"
      >
        <v-btn value="sm" size="small" aria-label="Smaller text">A−</v-btn>
        <v-btn value="md" size="small" aria-label="Default text">A</v-btn>
        <v-btn value="lg" size="small" aria-label="Larger text">A+</v-btn>
      </v-btn-toggle>
      <v-btn-toggle
        v-if="article"
        :model-value="newsStore.readerWidth"
        density="compact"
        variant="outlined"
        divided
        mandatory
        class="news-reader-toggle"
        @update:model-value="onReaderWidth"
      >
        <v-btn value="narrow" size="small" aria-label="Narrow column" icon>
          <v-icon size="small">mdi-arrow-collapse-horizontal</v-icon>
        </v-btn>
        <v-btn value="normal" size="small" aria-label="Normal column" icon>
          <v-icon size="small">mdi-arrow-expand-horizontal</v-icon>
        </v-btn>
        <v-btn value="wide" size="small" aria-label="Wide column" icon>
          <v-icon size="small">mdi-arrow-left-right</v-icon>
        </v-btn>
      </v-btn-toggle>
    </div>

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <div v-if="loading" class="pa-4">
      <v-skeleton-loader type="article" />
    </div>

    <article
      v-else-if="article"
      class="news-article pa-4"
      :class="[
        `news-article--font-${newsStore.readerFontScale}`,
        `news-article--width-${newsStore.readerWidth}`,
        { 'news-article--flayrah': article.source === 'flayrah' },
      ]"
    >
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
      <div
        class="news-body text-body-1"
        v-html="bodyHtml"
        @click="onBodyClick"
      />
      <p class="text-caption text-medium-emphasis mt-6 mb-0">
        <template v-if="article.source === 'flayrah'">
          Content © Flayrah staff and contributors — some rights reserved. Default license is
          Creative Commons Attribution-ShareAlike. Attribution: {{ article.author }} /
          <a :href="article.link" target="_blank" rel="noopener">flayrah.com</a>.
        </template>
        <template v-else>
          Content © {{ attributionSite }} and contributors. Attribution: {{ article.author }} /
          <a :href="article.link" target="_blank" rel="noopener">{{ attributionSite }}</a>.
          PawFeed shows the public RSS for reading with a link back to the original.
        </template>
      </p>
    </article>
    <v-dialog v-model="lightboxOpen" max-width="96vw" scrim>
      <div class="news-lightbox" @click="lightboxOpen = false">
        <img
          v-if="lightboxSrc"
          :src="lightboxSrc"
          :alt="lightboxAlt"
          class="news-lightbox-img"
          @click.stop
        />
      </div>
    </v-dialog>
    <Teleport to="body">
      <v-btn
        v-show="goToTopVisible"
        class="news-go-to-top"
        color="primary"
        elevation="6"
        :icon="goToTopNarrow"
        aria-label="Go to top"
        :style="goToTopStyle"
        @click="scrollToTop"
      >
        <v-icon>mdi-arrow-up</v-icon>
        <span v-if="!goToTopNarrow" class="ml-1">Go to top</span>
      </v-btn>
    </Teleport>
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
import { normalizeNewsFeedId, normalizeNewsSourceFilter } from "@/worker/news/feeds";
import {
  isNewsSource,
  makeNewsId,
  newsSourceLabel,
  parseNewsId,
} from "@/worker/news/ids";
import { getNewsSourceDef } from "@/worker/news/registry";
import { saveNewsArticleOffline } from "@/worker/news/offlineCache";
import {
  articleMatchesQuery,
  parseNewsQueryTerms,
} from "@/worker/news/parseRss";
import { sanitizeNewsHtml } from "@/misc/util/newsHtml";
import { useGoToTop } from "@/misc/useGoToTop";
import {
  useNewsStore,
  useSnackbarStore,
} from "@/services";
import type { NewsReaderFontScale, NewsReaderWidth } from "@/services/types";

const route = useRoute();
const router = useRouter();
const snackbar = useSnackbarStore();
const newsStore = useNewsStore();
const {
  visible: goToTopVisible,
  narrow: goToTopNarrow,
  style: goToTopStyle,
  scrollToTop,
} = useGoToTop();

const article = ref<NewsArticle | null>(null);
const siblings = ref<NewsArticle[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const lightboxOpen = ref(false);
const lightboxSrc = ref("");
const lightboxAlt = ref("");

function onFontScale(value: unknown) {
  if (value === "sm" || value === "md" || value === "lg") {
    newsStore.readerFontScale = value as NewsReaderFontScale;
  }
}

function onReaderWidth(value: unknown) {
  if (value === "narrow" || value === "normal" || value === "wide") {
    newsStore.readerWidth = value as NewsReaderWidth;
  }
}

function onBodyClick(e: MouseEvent) {
  const t = e.target;
  if (!(t instanceof HTMLImageElement)) return;
  const src = t.currentSrc || t.src;
  if (!src) return;
  e.preventDefault();
  lightboxSrc.value = src;
  lightboxAlt.value = t.alt || article.value?.title || "Article image";
  lightboxOpen.value = true;
}

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
const feedId = computed(() =>
  normalizeNewsFeedId(sourceFilter.value, route.query.feed),
);
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
  if (
    isNewsSource(sourceFilter.value) &&
    feedId.value !== "full" &&
    (sourceFilter.value === "flayrah" || sourceFilter.value === "dogpatch")
  ) {
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

const attributionSite = computed(() => {
  if (!article.value) return "";
  return (
    getNewsSourceDef(article.value.source)?.attributionName ||
    article.value.source
  );
});

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
  margin-inline: auto;
}
.news-article--width-narrow {
  max-width: 36rem;
}
.news-article--width-normal {
  max-width: 48rem;
}
.news-article--width-wide {
  max-width: 64rem;
}
.news-article--font-sm .news-body {
  font-size: 0.925rem;
  line-height: 1.55;
}
.news-article--font-md .news-body {
  font-size: 1.05rem;
  line-height: 1.65;
}
.news-article--font-lg .news-body {
  font-size: 1.2rem;
  line-height: 1.7;
}
.news-reader-toggle {
  flex: 0 0 auto;
}
.news-body :deep(img) {
  max-width: 100%;
  height: auto;
  cursor: zoom-in;
}
.news-article--flayrah .news-body :deep(figure) {
  float: right;
  margin: 0 0 1rem 1.25rem;
  max-width: min(45%, 20rem);
  text-align: center;
}
.news-body :deep(figure) {
  margin: 1rem 0;
  max-width: 100%;
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
  .news-article--flayrah .news-body :deep(figure) {
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
.news-go-to-top {
  position: fixed;
  z-index: 2300;
  min-width: 44px;
  min-height: 44px;
}
.news-lightbox {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  padding: 12px;
  cursor: zoom-out;
}
.news-lightbox-img {
  max-width: min(96vw, 1200px);
  max-height: 90vh;
  object-fit: contain;
  border-radius: 4px;
  cursor: default;
}
</style>
