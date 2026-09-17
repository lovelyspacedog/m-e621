<template>
  <div class="flayrah-feed-page">
    <div class="flayrah-feed-header">
      <div class="flayrah-header-inner">
        <div class="flayrah-header-left">
          <span class="text-overline text-medium-emphasis">Flayrah</span>
          <h1 class="text-h6 font-weight-bold">News</h1>
          <p class="text-caption text-medium-emphasis mb-0">
            Recent RSS feed from Flayrah.
          </p>
        </div>
        <div class="flayrah-header-right">
          <v-text-field
            v-model="searchInput"
            label="Filter title, author, tags"
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
        :to="{ name: 'FlayrahArticle', params: { id: String(article.id) } }"
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
          {{ article.author }}
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
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { fetchFlayrahArticles, type FlayrahArticle } from "@/worker/flayrah/api";
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

function applySearch() {
  const tags = searchInput.value.trim();
  router.replace({ query: tags ? { tags } : {} });
}

function clearSearch() {
  searchInput.value = "";
  router.replace({ query: {} });
}

function filterTag(tag: string) {
  searchInput.value = tag;
  applySearch();
}

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

async function load() {
  loading.value = true;
  error.value = null;
  try {
    articles.value = await fetchFlayrahArticles();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load Flayrah RSS.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
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
</style>
