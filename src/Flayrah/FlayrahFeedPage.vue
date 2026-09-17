<template>
  <div class="flayrah-feed-page" tabindex="-1" ref="pageEl">
    <div class="flayrah-feed-header">
      <div class="flayrah-header-inner">
        <div class="flayrah-header-left">
          <span class="text-overline text-medium-emphasis">Flayrah</span>
          <h1 class="text-h6 font-weight-bold">News</h1>
          <p class="text-caption text-medium-emphasis mb-0">
            {{ feedBlurb }}
            <template v-if="updatedLabel"> · {{ updatedLabel }}</template>
            <template v-if="fromOffline"> · Offline cache</template>
          </p>
        </div>
        <div class="flayrah-header-right">
          <v-text-field
            ref="searchField"
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
            :aria-label="layout === 'magazine' ? 'List layout' : 'Magazine layout'"
            @click="toggleLayout"
          >
            <v-icon>{{ layout === "magazine" ? "mdi-view-list" : "mdi-view-grid" }}</v-icon>
          </v-btn>
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
      <div class="flayrah-view-chips d-flex flex-wrap ga-1 mt-2">
        <v-chip
          v-for="opt in viewOptions"
          :key="opt.id"
          size="small"
          :variant="viewFilter === opt.id ? 'flat' : 'tonal'"
          :color="viewFilter === opt.id ? 'secondary' : undefined"
          @click="setView(opt.id)"
        >
          {{ opt.label }}
        </v-chip>
      </div>
      <div v-if="popularTags.length" class="flayrah-tag-cloud d-flex flex-wrap ga-1 mt-2">
        <span class="text-caption text-medium-emphasis align-self-center mr-1">Tags</span>
        <v-chip
          v-for="tag in popularTags"
          :key="tag"
          size="x-small"
          variant="outlined"
          @click="filterTag(tag)"
        >
          {{ tag }}
        </v-chip>
      </div>
    </div>

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>
    <v-alert
      v-else-if="fromOffline"
      type="info"
      variant="tonal"
      class="ma-4"
      density="compact"
    >
      Showing last saved Flayrah feed (offline or RSS unavailable).
    </v-alert>

    <TipDialog
      :tip-id="TIP_IDS.flayrahOffline"
      title="Flayrah offline cache"
      v-model="flayrahOfflineTipOpen"
    >
      <p class="mb-0">
        When RSS is unreachable, Flayrah shows the last successfully saved feed.
        Taxonomy chips, read/saved state, and article links still work on that
        cached snapshot until a refresh succeeds.
      </p>
    </TipDialog>

    <div v-if="loading && !articles.length" class="pa-4">
      <v-skeleton-loader v-for="n in 8" :key="n" type="article" class="mb-3" />
    </div>

    <div v-else-if="!filtered.length" class="pa-6 text-center text-medium-emphasis">
      {{ emptyMessage }}
    </div>

    <div
      v-else-if="layout === 'magazine'"
      class="flayrah-magazine pa-3"
    >
      <router-link
        v-for="(article, idx) in filtered"
        :key="article.id"
        class="flayrah-card"
        :class="{
          'flayrah-unread': !flayrahNews.isRead(article.id),
          'flayrah-focused': idx === focusIndex,
        }"
        :to="articleRoute(article.id)"
      >
        <img
          v-if="article.thumbUrl"
          class="flayrah-card-thumb"
          :src="thumbSrc(article.thumbUrl)"
          :alt="article.title"
          loading="lazy"
        />
        <div class="flayrah-card-body">
          <div class="flayrah-card-title">{{ article.title }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ article.author }}
            <template v-if="formatDate(article)"> · {{ formatDate(article) }}</template>
          </div>
          <p class="text-body-2 mt-1 mb-0">{{ article.excerpt }}</p>
          <div class="d-flex align-center ga-1 mt-2">
            <v-btn
              icon
              size="x-small"
              variant="text"
              :aria-label="flayrahNews.isSaved(article.id) ? 'Unsave' : 'Save'"
              @click.prevent.stop="toggleSave(article)"
            >
              <v-icon size="small">
                {{ flayrahNews.isSaved(article.id) ? "mdi-bookmark" : "mdi-bookmark-outline" }}
              </v-icon>
            </v-btn>
          </div>
        </div>
      </router-link>
    </div>

    <v-list v-else class="flayrah-list pa-0" lines="three">
      <v-list-item
        v-for="(article, idx) in filtered"
        :key="article.id"
        class="flayrah-item"
        :class="{
          'flayrah-unread': !flayrahNews.isRead(article.id),
          'flayrah-focused': idx === focusIndex,
        }"
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
        <v-list-item-title
          class="text-wrap"
          :class="flayrahNews.isRead(article.id) ? '' : 'font-weight-bold'"
        >
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
        <template #append>
          <v-btn
            icon
            size="small"
            variant="text"
            :aria-label="flayrahNews.isSaved(article.id) ? 'Unsave' : 'Save'"
            @click.prevent.stop="toggleSave(article)"
          >
            <v-icon>
              {{ flayrahNews.isSaved(article.id) ? "mdi-bookmark" : "mdi-bookmark-outline" }}
            </v-icon>
          </v-btn>
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import {
  fetchFlayrahArticles,
  getFlayrahCacheAgeMs,
  getFlayrahLastFetchSource,
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
import { useFlayrahNewsStore, useShortcutService } from "@/services";

type ViewFilter = "all" | "unread" | "saved";

const route = useRoute();
const router = useRouter();
const flayrahNews = useFlayrahNewsStore();
const shortcutService = useShortcutService();

const articles = ref<FlayrahArticle[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const fromOffline = ref(false);
const { open: flayrahOfflineTipOpen, tryOpenOnEdge: tryFlayrahOfflineTip } =
  useTipOpen(TIP_IDS.flayrahOffline);
watch(fromOffline, tryFlayrahOfflineTip);
const cacheAgeTick = ref(0);
const focusIndex = ref(0);
const searchField = ref<{ focus?: () => void } | null>(null);
const pageEl = ref<HTMLElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let ageTimer: ReturnType<typeof setInterval> | null = null;

const feedOptions = FLAYRAH_FEED_OPTIONS;
const viewOptions: { id: ViewFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "saved", label: "Saved" },
];

const layout = computed({
  get: () => flayrahNews.layout,
  set: (v) => {
    flayrahNews.layout = v;
  },
});

const feedId = computed(() => normalizeFlayrahFeedId(route.query.feed));
const viewFilter = computed((): ViewFilter => {
  const raw = route.query.view;
  if (raw === "unread" || raw === "saved") return raw;
  return "all";
});
const tagsQuery = computed(() => {
  const raw = route.query.tags;
  return typeof raw === "string" ? raw : "";
});
const queryTerms = computed(() => parseFlayrahQueryTerms(tagsQuery.value));
const searchInput = ref(tagsQuery.value);

watch(tagsQuery, (v) => {
  if (searchInput.value !== v) searchInput.value = v;
});

const filtered = computed(() => {
  const terms = queryTerms.value;
  if (viewFilter.value === "saved") {
    // Prefer live RSS rows when present; otherwise synthesize from persisted saves
    // so articles that aged off the feed still appear in Saved.
    const byId = new Map(articles.value.map((a) => [a.id, a]));
    return flayrahNews.saved
      .map(
        (s) =>
          byId.get(s.id) ??
          ({
            id: s.id,
            title: s.title,
            link: s.link,
            author: s.author,
            publishedAt: "",
            publishedMs: s.savedAt,
            tags: [],
            descriptionHtml: "",
            excerpt: "Saved article — open to read full text.",
            thumbUrl: s.thumbUrl,
          } satisfies FlayrahArticle),
      )
      .filter((a) => articleMatchesQuery(a, terms));
  }
  let list = articles.value.filter((a) => articleMatchesQuery(a, terms));
  if (viewFilter.value === "unread") {
    list = list.filter((a) => !flayrahNews.isRead(a.id));
  }
  return list;
});

const emptyMessage = computed(() => {
  if (viewFilter.value === "saved") {
    return flayrahNews.savedCount
      ? "No saved articles match this filter."
      : "No saved articles yet.";
  }
  if (!articles.value.length) return "No articles in the RSS feed.";
  if (viewFilter.value === "unread") return "No unread articles.";
  return "No articles match this filter.";
});

const popularTags = computed(() => {
  const counts = new Map<string, number>();
  for (const a of articles.value) {
    for (const tag of a.tags) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([key]) => {
      const sample = articles.value
        .flatMap((a) => a.tags)
        .find((t) => t.toLowerCase() === key);
      return sample || key;
    });
});

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
  if (viewFilter.value !== "all") q.view = viewFilter.value;
  return q;
}

function articleRoute(id: number) {
  return {
    name: "FlayrahArticle" as const,
    params: { id: String(id) },
    query: listQuery(),
  };
}

function replaceListQuery(partial: {
  tags?: string;
  feed?: string;
  view?: ViewFilter;
}) {
  const q: Record<string, string> = {};
  const feed = partial.feed ?? feedId.value;
  const tags = partial.tags !== undefined ? partial.tags : tagsQuery.value;
  const view = partial.view ?? viewFilter.value;
  if (feed && feed !== "full") q.feed = feed;
  if (tags.trim()) q.tags = tags.trim();
  if (view && view !== "all") q.view = view;
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

function setView(id: ViewFilter) {
  void replaceListQuery({ view: id });
}

function toggleLayout() {
  layout.value = layout.value === "magazine" ? "list" : "magazine";
}

function toggleSave(article: FlayrahArticle) {
  flayrahNews.toggleSaved(article);
}

watch(searchInput, (v) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (v.trim() === tagsQuery.value.trim()) return;
    void replaceListQuery({ tags: v });
  }, 300);
});

watch(filtered, () => {
  if (focusIndex.value >= filtered.value.length) {
    focusIndex.value = Math.max(0, filtered.value.length - 1);
  }
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
  fromOffline.value = false;
  try {
    articles.value = await fetchFlayrahArticles({ force, feed: feedId.value });
    fromOffline.value = getFlayrahLastFetchSource() === "offline";
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
  const key = e.key;
  if (key === "j" || key === "ArrowDown") {
    e.preventDefault();
    if (!filtered.value.length) return;
    focusIndex.value = Math.min(focusIndex.value + 1, filtered.value.length - 1);
    return;
  }
  if (key === "k" || key === "ArrowUp") {
    e.preventDefault();
    if (!filtered.value.length) return;
    focusIndex.value = Math.max(focusIndex.value - 1, 0);
    return;
  }
  if (key === "Enter" || key === "o") {
    const hit = filtered.value[focusIndex.value];
    if (!hit) return;
    e.preventDefault();
    void router.push(articleRoute(hit.id));
  }
}

function focusSearch() {
  void nextTick(() => {
    const field = searchField.value as unknown as {
      focus?: () => void;
      $el?: HTMLElement;
    } | null;
    if (field?.focus) {
      field.focus();
      return;
    }
    const input = pageEl.value?.querySelector("input");
    input?.focus();
  });
}

watch(feedId, () => {
  void load();
});

onMounted(() => {
  void load();
  ageTimer = setInterval(() => {
    cacheAgeTick.value += 1;
  }, 30000);
  window.addEventListener("keydown", onKeydown);
  shortcutService.emitter.on("focusSearch", focusSearch);
});

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer);
  if (ageTimer) clearInterval(ageTimer);
  window.removeEventListener("keydown", onKeydown);
  shortcutService.emitter.off("focusSearch", focusSearch);
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
.flayrah-unread :deep(.v-list-item-title),
.flayrah-card.flayrah-unread .flayrah-card-title {
  font-weight: 700;
}
.flayrah-focused {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
.flayrah-magazine {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.flayrah-card {
  display: flex;
  flex-direction: column;
  color: inherit;
  text-decoration: none;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
  overflow: hidden;
  background: rgba(var(--v-theme-surface), 1);
}
.flayrah-card-thumb {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  background: rgba(var(--v-border-color), 0.12);
}
.flayrah-card-body {
  padding: 12px;
}
.flayrah-card-title {
  font-weight: 600;
  line-height: 1.3;
}
</style>
