<template>
  <div class="flayrah-feed-page">
    <div class="flayrah-feed-header">
      <div class="flayrah-header-inner">
        <div class="flayrah-header-left">
          <span class="text-overline text-medium-emphasis">Flayrah</span>
          <h1 class="text-h6 font-weight-bold">News</h1>
          <p class="text-caption text-medium-emphasis mb-0">
            {{ feedBlurb }}
            <template v-if="updatedLabel"> · {{ updatedLabel }}</template>
          </p>
        </div>
        <div class="flayrah-header-right">
          <v-text-field
            v-model="searchInput"
            label="Filter title, author, tags, body"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            class="flayrah-search"
            @keydown.enter="applySearch"
            @click:clear="clearSearch"
          />
          <v-btn
            icon
            variant="text"
            :loading="loading"
            aria-label="Refresh feed"
            @click="refresh"
          >
            <v-icon>mdi-refresh</v-icon>
          </v-btn>
          <v-btn
            href="https://www.flayrah.com/"
            target="_blank"
            rel="noopener"
            variant="text"
            size="small"
            append-icon="mdi-open-in-new"
          >
            Open on Flayrah
          </v-btn>
        </div>
      </div>
      <div class="flayrah-feed-chips d-flex flex-wrap ga-1 mt-3">
        <v-chip
          v-for="opt in feedOptions"
          :key="opt.id"
          size="small"
          :variant="feedId === opt.id ? 'flat' : 'tonal'"
          :color="feedId === opt.id ? 'primary' : undefined"
          @click="setFeed(opt.id)"
        >
          {{ opt.label }}
        </v-chip>
      </div>
    </div>

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <div v-if="loading && !articles.length" class="pa-4">
      <v-skeleton-loader v-for="n in 8" :key="n" type="article" class="mb-3" />
    </div>

    <div v-else-if="!filtered.length" class="pa-6 text-center text-medium-emphasis">
      {{ articles.length ? "No articles match this filter." : "No articles in the RSS feed." }}
    </div>

    <v-list v-else class="flayrah-list pa-0" lines="three">
      <v-list-item
        v-for="article in filtered"
        :key="article.id"
        class="flayrah-item"
        :to="articleRoute(article.id)"
      >
        <template v-if="article.thumbUrl" #prepend>
          <img
            class="flayrah-thumb"
            :src="thumbSrc(article.thumbUrl)"
            :alt="article.title"
            loading="lazy"
          />
        </template>
        <v-list-item-title class="text-wrap font-weight-medium">
          {{ article.title }}
        </v-list-item-title>
        <v-list-item-subtitle class="text-wrap">
          <a
            class="flayrah-author-link"
            href="#"
            @click.prevent.stop="filterAuthor(article.author)"
          >{{ article.author }}</a>
          <template v-if="formatDate(article)"> · {{ formatDate(article) }}</template>
        </v-list-item-subtitle>
        <v-list-item-subtitle class="text-wrap mt-1">
          {{ article.excerpt }}
        </v-list-item-subtitle>
        <div v-if="article.tags.length" class="d-flex flex-wrap ga-1 mt-2">
          <v-chip
            v-for="tag in article.tags.slice(0, 6)"
            :key="tag"
            size="x-small"
            variant="tonal"
            @click.prevent.stop="filterTag(tag)"
          >
            {{ tag }}
          </v-chip>
        </div>
      </v-list-item>
    </v-list>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  fetchFlayrahArticles,
  getFlayrahCacheAgeMs,
  type FlayrahArticle,
} from "@/worker/flayrah/api";
import {
  FLAYRAH_FEED_OPTIONS,
  normalizeFlayrahFeedId,
} from "@/worker/flayrah/feeds";
import {
  articleMatchesQuery,
  parseFlayrahQueryTerms,
} from "@/worker/flayrah/parseRss";
import { proxyDownloadUrl } from "@/misc/util/flayrahHtml";

const route = useRoute();
const router = useRouter();

const articles = ref<FlayrahArticle[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const cacheAgeTick = ref(0);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let ageTimer: ReturnType<typeof setInterval> | null = null;

const feedOptions = FLAYRAH_FEED_OPTIONS;

const feedId = computed(() => normalizeFlayrahFeedId(route.query.feed));
const tagsQuery = computed(() => {
  const raw = route.query.tags;
  return typeof raw === "string" ? raw : "";
});
const queryTerms = computed(() => parseFlayrahQueryTerms(tagsQuery.value));
const searchInput = ref(tagsQuery.value);

watch(tagsQuery, (v) => {
  if (searchInput.value !== v) searchInput.value = v;
});

const filtered = computed(() =>
  articles.value.filter((a) => articleMatchesQuery(a, queryTerms.value)),
);

const feedBlurb = computed(() => {
  const opt = feedOptions.find((f) => f.id === feedId.value);
  if (!opt || opt.id === "full") return "Recent RSS feed from Flayrah.";
  return `${opt.label} taxonomy feed from Flayrah.`;
});

const updatedLabel = computed(() => {
  void cacheAgeTick.value;
  const age = getFlayrahCacheAgeMs(feedId.value);
  if (age == null) return "";
  const mins = Math.floor(age / 60000);
  if (mins < 1) return "Updated just now";
  if (mins === 1) return "Updated 1 min ago";
  return `Updated ${mins} min ago`;
});

function listQuery(extra?: Record<string, string>) {
  const q: Record<string, string> = { ...extra };
  if (feedId.value !== "full") q.feed = feedId.value;
  if (tagsQuery.value.trim()) q.tags = tagsQuery.value.trim();
  return q;
}

function articleRoute(id: number) {
  return { name: "FlayrahArticle" as const, params: { id: String(id) }, query: listQuery() };
}

function replaceListQuery( partial: { tags?: string; feed?: string }) {
  const q: Record<string, string> = {};
  const feed = partial.feed ?? feedId.value;
  const tags = partial.tags !== undefined ? partial.tags : tagsQuery.value;
  if (feed && feed !== "full") q.feed = feed;
  if (tags.trim()) q.tags = tags.trim();
  return router.replace({ query: q });
}

function applySearch() {
  void replaceListQuery({ tags: searchInput.value });
}

function clearSearch() {
  searchInput.value = "";
  void replaceListQuery({ tags: "" });
}

function filterTag(tag: string) {
  searchInput.value = tag;
  applySearch();
}

function filterAuthor(author: string) {
  searchInput.value = author;
  applySearch();
}

function setFeed(id: string) {
  void replaceListQuery({ feed: normalizeFlayrahFeedId(id) });
}

watch(searchInput, (v) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (v.trim() === tagsQuery.value.trim()) return;
    void replaceListQuery({ tags: v });
  }, 300);
});

function formatDate(article: FlayrahArticle): string {
  if (!article.publishedMs) return "";
  try {
    return new Date(article.publishedMs).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return article.publishedAt;
  }
}

function thumbSrc(url: string): string {
  if (/flayrah\.com/i.test(url)) return proxyDownloadUrl(url);
  return url;
}

async function load(force = false) {
  loading.value = true;
  error.value = null;
  try {
    articles.value = await fetchFlayrahArticles({ force, feed: feedId.value });
    cacheAgeTick.value += 1;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load Flayrah RSS.";
  } finally {
    loading.value = false;
  }
}

function refresh() {
  void load(true);
}

watch(feedId, () => {
  void load();
});

onMounted(() => {
  void load();
  ageTimer = setInterval(() => {
    cacheAgeTick.value += 1;
  }, 30000);
});

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer);
  if (ageTimer) clearInterval(ageTimer);
});
</script>

<style scoped>
.flayrah-feed-header {
  padding: 16px 16px 8px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.flayrah-header-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}
.flayrah-header-right {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.flayrah-search {
  min-width: 220px;
  max-width: 360px;
}
.flayrah-item {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  min-height: 96px;
}
.flayrah-thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  margin-inline-end: 12px;
}
.flayrah-author-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
