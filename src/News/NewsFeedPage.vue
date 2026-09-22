<template>
  <div class="news-feed-page" tabindex="-1" ref="pageEl">
    <div class="news-feed-header">
      <div class="news-header-inner">
        <div class="news-header-left">
          <span class="text-overline text-medium-emphasis">News</span>
          <h1 class="text-h6 font-weight-bold">Furry headlines</h1>
          <p class="text-caption text-medium-emphasis mb-0">
            {{ feedBlurb }}
            <template v-if="updatedLabel"> · {{ updatedLabel }}</template>
            <template v-if="fromOffline"> · Offline cache</template>
          </p>
        </div>
        <div class="news-header-right">
          <v-text-field
            ref="searchField"
            v-model="searchInput"
            label="Filter title, author, tags, body"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            class="news-search"
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
            v-if="externalHome"
            :href="externalHome.href"
            target="_blank"
            rel="noopener"
            variant="text"
            size="small"
            append-icon="mdi-open-in-new"
          >
            {{ externalHome.label }}
          </v-btn>
        </div>
      </div>
      <div class="news-source-chips d-flex flex-wrap ga-1 mt-3 align-center">
        <v-chip
          v-for="opt in sourceOptions"
          :key="opt.id"
          size="small"
          :variant="sourceFilter === opt.id ? 'flat' : 'tonal'"
          :color="sourceFilter === opt.id ? 'primary' : undefined"
          @click="setSource(opt.id)"
        >
          {{ opt.label }}
        </v-chip>
        <v-chip
          v-for="feed in newsStore.customFeeds"
          :key="feed.id"
          size="small"
          :variant="sourceFilter === `custom:${feed.id}` ? 'flat' : 'tonal'"
          :color="sourceFilter === `custom:${feed.id}` ? 'primary' : undefined"
          closable
          @click="setSource(`custom:${feed.id}`)"
          @click:close.stop="confirmRemoveFeed(feed.id)"
        >
          {{ feed.label }}
        </v-chip>
        <v-btn
          size="x-small"
          variant="tonal"
          prepend-icon="mdi-plus"
          :disabled="newsStore.customFeeds.length >= customFeedCap"
          @click="addFeedOpen = true"
        >
          Add feed
        </v-btn>
      </div>
      <v-dialog v-model="addFeedOpen" max-width="480" scrim>
        <v-card>
          <v-card-title>Add RSS / Atom feed</v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis mb-3">
              Paste a public https feed URL. PawDeck’s server fetches it for you
              (up to {{ customFeedCap }} feeds). Items open in the in-app reader.
            </p>
            <v-text-field
              v-model="addFeedUrl"
              label="Feed URL"
              placeholder="https://example.com/feed/"
              variant="outlined"
              density="compact"
              hide-details="auto"
              :error-messages="addFeedError ? [addFeedError] : []"
              class="mb-3"
            />
            <v-text-field
              v-model="addFeedLabel"
              label="Label (optional)"
              variant="outlined"
              density="compact"
              hide-details
              hint="Defaults to the feed title"
              persistent-hint
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="addFeedOpen = false">Cancel</v-btn>
            <v-btn
              color="primary"
              :loading="addFeedLoading"
              :disabled="!addFeedUrl.trim()"
              @click="submitAddFeed"
            >
              Add
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <div
        v-if="showTaxonomyChips"
        class="news-feed-chips d-flex flex-wrap ga-1 mt-2"
      >
        <v-chip
          v-for="opt in feedOptions"
          :key="opt.id"
          size="small"
          :variant="feedId === opt.id ? 'flat' : 'tonal'"
          :color="feedId === opt.id ? 'secondary' : undefined"
          @click="setFeed(opt.id)"
        >
          {{ opt.label }}
        </v-chip>
      </div>
      <div class="news-view-chips d-flex flex-wrap align-center ga-1 mt-2">
        <v-chip
          v-for="opt in viewOptions"
          :key="opt.id"
          size="small"
          :variant="viewFilter === opt.id ? 'flat' : 'tonal'"
          :color="viewFilter === opt.id ? 'secondary' : undefined"
          @click="setView(opt.id)"
        >
          {{ opt.label }}
          <template v-if="opt.id === 'unread' && unreadInFeed > 0">
            · {{ unreadInFeed }}
          </template>
          <template v-else-if="opt.id === 'watched' && newsStore.watchedAuthors.length">
            · {{ newsStore.watchedAuthors.length }}
          </template>
        </v-chip>
        <v-chip
          size="small"
          :variant="newsStore.notifyNew ? 'flat' : 'tonal'"
          :color="newsStore.notifyNew ? 'primary' : undefined"
          @click="toggleNotifyNew"
        >
          Highlight new
          <template v-if="newsStore.notifyNew && newSinceVisit > 0">
            · {{ newSinceVisit }}
          </template>
        </v-chip>
        <v-btn
          v-if="filtered.length && viewFilter !== 'saved'"
          size="x-small"
          variant="text"
          class="ml-1"
          @click="markFilteredRead"
        >
          Mark filtered read
        </v-btn>
      </div>
      <div v-if="popularTags.length" class="news-tag-cloud d-flex flex-wrap ga-1 mt-2">
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
      v-else-if="partialWarning"
      type="warning"
      variant="tonal"
      class="ma-4"
      density="compact"
    >
      {{ partialWarning }}
    </v-alert>
    <v-alert
      v-else-if="fromOffline"
      type="info"
      variant="tonal"
      class="ma-4"
      density="compact"
    >
      Showing last saved News feed (offline or RSS unavailable).
    </v-alert>

    <TipDialog
      :tip-id="TIP_IDS.newsOffline"
      title="News offline cache"
      v-model="newsOfflineTipOpen"
    >
      <p class="mb-0">
        When RSS is unreachable, News shows the last successfully saved feed.
        Source chips, read/saved state, and article links still work on that
        cached snapshot until a refresh succeeds.
      </p>
    </TipDialog>
    <TipDialog
      :tip-id="TIP_IDS.newsIntro"
      title="Furry news"
      v-model="newsIntroTipOpen"
    >
      <p class="mb-2">
        News merges public RSS from Flayrah, Dogpatch Press, InFurNation, and
        Furry Writers’ Guild. Section chips only appear when a source that has
        them is selected. Star an author to watch them; turn on Highlight new
        for headlines since your last visit.
      </p>
      <p class="mb-0">
        Dogpatch can include adult or investigative topics. Articles stay
        attributed, with a link back to the original.
      </p>
    </TipDialog>

    <div v-if="loading && !articles.length" class="pa-4">
      <v-skeleton-loader v-for="n in 8" :key="n" type="article" class="mb-3" />
    </div>

    <div v-else-if="!filtered.length" class="pa-6 text-center text-medium-emphasis">
      {{ emptyMessage }}
    </div>

    <div v-else-if="layout === 'magazine'" class="news-magazine pa-3">
      <template v-for="group in dayGroups" :key="group.key">
        <h2 class="news-day-heading news-day-heading--magazine">
          {{ group.label }}
        </h2>
        <router-link
          v-for="(article, localIdx) in group.articles"
          :key="article.id"
          class="news-card"
          :class="{
            'news-unread': !newsStore.isRead(article.id),
            'news-focused': group.startIndex + localIdx === focusIndex,
          }"
          :to="articleRoute(article)"
        >
          <img
            v-if="article.thumbUrl"
            class="news-card-thumb"
            :src="thumbSrc(article)"
            :alt="article.title"
            loading="lazy"
          />
          <div class="news-card-body">
            <div class="mb-1 d-flex flex-wrap ga-1">
              <v-chip size="x-small" variant="tonal" label>
                {{ sourceLabel(article.source) }}
              </v-chip>
              <v-chip
                v-if="newsStore.isNewerThanSeen(article.publishedMs)"
                size="x-small"
                color="primary"
                variant="flat"
                label
              >
                New
              </v-chip>
              <v-chip
                v-for="rel in article.related || []"
                :key="rel.id"
                size="x-small"
                variant="outlined"
                :to="relatedRoute(rel)"
                @click.stop
              >
                also {{ rel.label }}
              </v-chip>
            </div>
            <div class="news-card-title">{{ article.title }}</div>
            <div class="text-caption text-medium-emphasis d-flex align-center flex-wrap ga-1">
              <a
                class="news-author-link"
                href="#"
                @click.prevent.stop="filterAuthor(article.author)"
              >{{ article.author }}</a>
              <v-btn
                icon
                size="x-small"
                variant="text"
                :aria-label="
                  newsStore.isWatchedAuthor(article.author)
                    ? 'Unwatch author'
                    : 'Watch author'
                "
                @click.prevent.stop="toggleWatchAuthor(article.author)"
              >
                <v-icon size="x-small">
                  {{
                    newsStore.isWatchedAuthor(article.author)
                      ? "mdi-star"
                      : "mdi-star-outline"
                  }}
                </v-icon>
              </v-btn>
              <template v-if="formatDate(article)"> · {{ formatDate(article) }}</template>
            </div>
            <p class="text-body-2 mt-1 mb-0">{{ article.excerpt }}</p>
            <div v-if="article.tags.length" class="d-flex flex-wrap ga-1 mt-2">
              <v-chip
                v-for="tag in article.tags.slice(0, 4)"
                :key="tag"
                size="x-small"
                variant="tonal"
                @click.prevent.stop="filterTag(tag)"
              >
                {{ tag }}
              </v-chip>
            </div>
            <div class="d-flex align-center ga-1 mt-2">
              <v-btn
                icon
                size="x-small"
                variant="text"
                :aria-label="newsStore.isSaved(article.id) ? 'Unsave' : 'Save'"
                @click.prevent.stop="toggleSave(article)"
              >
                <v-icon size="small">
                  {{ newsStore.isSaved(article.id) ? "mdi-bookmark" : "mdi-bookmark-outline" }}
                </v-icon>
              </v-btn>
            </div>
          </div>
        </router-link>
      </template>
    </div>

    <div v-else class="news-list-wrap">
      <template v-for="group in dayGroups" :key="group.key">
        <h2 class="news-day-heading px-4 pt-3 pb-1">{{ group.label }}</h2>
        <v-list class="news-list pa-0" lines="three">
          <v-list-item
            v-for="(article, localIdx) in group.articles"
            :key="article.id"
            class="news-item"
            :class="{
              'news-unread': !newsStore.isRead(article.id),
              'news-focused': group.startIndex + localIdx === focusIndex,
            }"
            :to="articleRoute(article)"
          >
            <template v-if="article.thumbUrl" #prepend>
              <img
                class="news-thumb"
                :src="thumbSrc(article)"
                :alt="article.title"
                loading="lazy"
              />
            </template>
            <v-list-item-title
              class="text-wrap"
              :class="newsStore.isRead(article.id) ? '' : 'font-weight-bold'"
            >
              <v-chip size="x-small" variant="tonal" class="mr-2" label>
                {{ sourceLabel(article.source) }}
              </v-chip>
              <v-chip
                v-if="newsStore.isNewerThanSeen(article.publishedMs)"
                size="x-small"
                color="primary"
                variant="flat"
                class="mr-2"
                label
              >
                New
              </v-chip>
              {{ article.title }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-wrap">
              <a
                class="news-author-link"
                href="#"
                @click.prevent.stop="filterAuthor(article.author)"
              >{{ article.author }}</a>
              <v-btn
                icon
                size="x-small"
                variant="text"
                class="ml-n1"
                :aria-label="
                  newsStore.isWatchedAuthor(article.author)
                    ? 'Unwatch author'
                    : 'Watch author'
                "
                @click.prevent.stop="toggleWatchAuthor(article.author)"
              >
                <v-icon size="x-small">
                  {{
                    newsStore.isWatchedAuthor(article.author)
                      ? "mdi-star"
                      : "mdi-star-outline"
                  }}
                </v-icon>
              </v-btn>
              <template v-if="formatDate(article)"> · {{ formatDate(article) }}</template>
            </v-list-item-subtitle>
            <div
              v-if="article.related?.length"
              class="d-flex flex-wrap ga-1 mt-1"
            >
              <v-chip
                v-for="rel in article.related"
                :key="rel.id"
                size="x-small"
                variant="outlined"
                :to="relatedRoute(rel)"
                @click.stop
              >
                also {{ rel.label }}
              </v-chip>
            </div>
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
                :aria-label="newsStore.isRead(article.id) ? 'Mark unread' : 'Mark read'"
                @click.prevent.stop="toggleRead(article)"
              >
                <v-icon>
                  {{
                    newsStore.isRead(article.id)
                      ? "mdi-email-open-outline"
                      : "mdi-email-outline"
                  }}
                </v-icon>
              </v-btn>
              <v-btn
                icon
                size="small"
                variant="text"
                :aria-label="newsStore.isSaved(article.id) ? 'Unsave' : 'Save'"
                @click.prevent.stop="toggleSave(article)"
              >
                <v-icon>
                  {{ newsStore.isSaved(article.id) ? "mdi-bookmark" : "mdi-bookmark-outline" }}
                </v-icon>
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </template>
    </div>
    <div
      v-if="canLoadOlder"
      class="d-flex justify-center pa-4"
    >
      <v-btn
        variant="tonal"
        :loading="loadingMore"
        @click="loadOlder"
      >
        {{
          sourceFilter === "all"
            ? "Load older pages"
            : "Load older"
        }}
      </v-btn>
    </div>
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import {
  fetchNewsArticles,
  getNewsCacheAgeMs,
  getNewsLastFetchSource,
  getNewsPartialWarning,
  probeCustomNewsFeed,
  type NewsArticle,
} from "@/worker/news/api";
import {
  CUSTOM_NEWS_FEED_CAP,
} from "@/worker/news/customUrl";
import {
  NEWS_RSS_PAGE_MAX,
  NEWS_SOURCE_OPTIONS,
  isCustomSourceFilter,
  normalizeNewsFeedId,
  normalizeNewsSourceFilter,
  sectionFeedOptions,
  type NewsSourceFilter,
} from "@/worker/news/feeds";
import {
  newsSourceHomeUrl,
  newsSourceLabel,
  parseNewsId,
} from "@/worker/news/ids";
import {
  isNewsSource,
  newsSourceSupportsPaging,
} from "@/worker/news/registry";
import {
  parseCustomNewsId,
} from "@/worker/news/customIds";
import {
  articleMatchesQuery,
  parseNewsQueryTerms,
} from "@/worker/news/parseRss";
import {
  proxyCustomMediaUrl,
  proxyDownloadUrl,
} from "@/misc/util/newsHtml";
import { groupNewsByDay } from "@/misc/util/newsDayGroups";
import {
  clusterNewsArticles,
  type NewsClusterArticle,
} from "@/misc/util/newsClusters";
import { prefersReducedMotion } from "@/misc/util/reducedMotion";
import { useGoToTop } from "@/misc/useGoToTop";
import { useNewsStore, useShortcutService } from "@/services";

type ViewFilter = "all" | "unread" | "saved" | "watched";

const route = useRoute();
const router = useRouter();
const newsStore = useNewsStore();
const shortcutService = useShortcutService();

const articles = ref<NewsArticle[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const noMore = ref(false);
const error = ref<string | null>(null);
const fromOffline = ref(false);
const partialWarning = ref<string | null>(null);
const newSinceVisit = ref(0);
const addFeedOpen = ref(false);
const addFeedUrl = ref("");
const addFeedLabel = ref("");
const addFeedError = ref("");
const addFeedLoading = ref(false);
const customFeedCap = CUSTOM_NEWS_FEED_CAP;
const { open: newsOfflineTipOpen, tryOpenOnEdge: tryNewsOfflineTip } =
  useTipOpen(TIP_IDS.newsOffline);
watch(fromOffline, tryNewsOfflineTip);
const { open: newsIntroTipOpen, tryOpen: tryNewsIntroTip } = useTipOpen(
  TIP_IDS.newsIntro,
);
const {
  visible: goToTopVisible,
  narrow: goToTopNarrow,
  style: goToTopStyle,
  scrollToTop,
} = useGoToTop();
const cacheAgeTick = ref(0);
const focusIndex = ref(0);
const searchField = ref<{ focus?: () => void } | null>(null);
const pageEl = ref<HTMLElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let ageTimer: ReturnType<typeof setInterval> | null = null;

const sourceOptions = NEWS_SOURCE_OPTIONS;
const feedOptions = computed(() => {
  if (!isNewsSource(sourceFilter.value)) return [];
  return sectionFeedOptions(sourceFilter.value);
});
const viewOptions: { id: ViewFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "watched", label: "Watched" },
  { id: "saved", label: "Saved" },
];

const layout = computed({
  get: () => newsStore.layout,
  set: (v) => {
    newsStore.layout = v;
  },
});

const sourceFilter = computed(() =>
  normalizeNewsSourceFilter(route.query.source),
);
const feedId = computed(() =>
  normalizeNewsFeedId(sourceFilter.value, route.query.feed),
);
const showTaxonomyChips = computed(
  () =>
    isNewsSource(sourceFilter.value) &&
    sectionFeedOptions(sourceFilter.value).length > 1,
);
const viewFilter = computed((): ViewFilter => {
  const raw = route.query.view;
  if (raw === "unread" || raw === "saved" || raw === "watched") return raw;
  return "all";
});
const tagsQuery = computed(() => {
  const raw = route.query.tags;
  return typeof raw === "string" ? raw : "";
});
const queryTerms = computed(() => parseNewsQueryTerms(tagsQuery.value));
const searchInput = ref(tagsQuery.value);

watch(tagsQuery, (v) => {
  if (searchInput.value !== v) searchInput.value = v;
});

const filtered = computed((): NewsClusterArticle[] => {
  const terms = queryTerms.value;
  let list: NewsArticle[];
  if (viewFilter.value === "saved") {
    const byId = new Map(articles.value.map((a) => [a.id, a]));
    list = newsStore.saved
      .map((s) => {
        const live = byId.get(s.id);
        if (live) return live;
        return newsStore.articleFromSaved(s);
      })
      .filter((a) => articleMatchesQuery(a, terms));
  } else {
    list = articles.value.filter((a) => articleMatchesQuery(a, terms));
    if (viewFilter.value === "unread") {
      list = list.filter((a) => !newsStore.isRead(a.id));
    } else if (viewFilter.value === "watched") {
      list = list.filter((a) => newsStore.isWatchedAuthor(a.author));
    }
  }
  // Cluster only on the merged All-sources feed (cross-outlet duplicates).
  if (sourceFilter.value === "all" && viewFilter.value !== "saved") {
    return clusterNewsArticles(list);
  }
  return list.map((a) => ({ ...a }));
});

const unreadInFeed = computed(
  () => articles.value.filter((a) => !newsStore.isRead(a.id)).length,
);

const dayGroups = computed(() => groupNewsByDay(filtered.value));

const emptyMessage = computed(() => {
  if (viewFilter.value === "saved") {
    return newsStore.savedCount
      ? "No saved articles match this filter."
      : "No saved articles yet.";
  }
  if (viewFilter.value === "watched") {
    return newsStore.watchedAuthors.length
      ? "No articles from watched authors in this feed."
      : "Watch an author (star next to their name) to filter here.";
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
  if (sourceFilter.value === "all") {
    const n = newsStore.customFeeds.length;
    const customBit = n
      ? ` plus ${n} custom feed${n === 1 ? "" : "s"}`
      : "";
    return `Merged RSS from Flayrah, Dogpatch Press, InFurNation, and Furry Writers’ Guild${customBit}.`;
  }
  if (isCustomSourceFilter(sourceFilter.value)) {
    const id = String(sourceFilter.value).slice("custom:".length);
    const feed = newsStore.getCustomFeed(id);
    return feed
      ? `Custom feed: ${feed.label}.`
      : "Custom RSS feed.";
  }
  if (!isNewsSource(sourceFilter.value)) return "Recent news RSS.";
  const label = newsSourceLabel(sourceFilter.value);
  const opts = sectionFeedOptions(sourceFilter.value);
  const opt = opts.find((f) => f.id === feedId.value);
  if (!opt || opt.id === "full") return `Recent RSS feed from ${label}.`;
  const kind = sourceFilter.value === "flayrah" ? "taxonomy" : "category";
  return `${opt.label} ${kind} feed from ${label}.`;
});

const externalHome = computed(() => {
  if (isCustomSourceFilter(sourceFilter.value)) {
    const id = String(sourceFilter.value).slice("custom:".length);
    const feed = newsStore.getCustomFeed(id);
    if (!feed) return null;
    try {
      return {
        href: new URL(feed.url).origin + "/",
        label: `Open ${feed.label}`,
      };
    } catch {
      return { href: feed.url, label: `Open ${feed.label}` };
    }
  }
  if (!isNewsSource(sourceFilter.value)) return null;
  const src = sourceFilter.value;
  return {
    href: newsSourceHomeUrl(src),
    label: `Open ${newsSourceLabel(src)}`,
  };
});

function customFeedRefs() {
  return newsStore.customFeeds.map((f) => ({
    id: f.id,
    url: f.url,
    label: f.label,
  }));
}

function sourceLabel(source: string) {
  if (isNewsSource(source)) return newsSourceLabel(source);
  if (source.startsWith("custom:")) {
    const id = source.slice("custom:".length);
    return newsStore.customFeedLabel(id);
  }
  return source;
}

function listQuery(extra?: Record<string, string>) {
  const q: Record<string, string> = { ...extra };
  if (sourceFilter.value !== "all") q.source = sourceFilter.value;
  if (showTaxonomyChips.value && feedId.value !== "full") {
    q.feed = feedId.value;
  }
  if (tagsQuery.value.trim()) q.tags = tagsQuery.value.trim();
  if (viewFilter.value !== "all") q.view = viewFilter.value;
  return q;
}

function articleRoute(article: NewsArticle) {
  const custom = parseCustomNewsId(article.id);
  if (custom) {
    return {
      name: "NewsCustomArticle" as const,
      params: {
        feedId: custom.feedId,
        itemKey: custom.itemKey,
      },
      query: listQuery(),
    };
  }
  const parsed = parseNewsId(article.id);
  return {
    name: "NewsArticle" as const,
    params: {
      source: parsed?.source || article.source,
      id: String(parsed?.numericId || ""),
    },
    query: listQuery(),
  };
}

const updatedLabel = computed(() => {
  void cacheAgeTick.value;
  const age = getNewsCacheAgeMs(sourceFilter.value, feedId.value);
  if (age == null) return "";
  const mins = Math.floor(age / 60000);
  if (mins < 1) return "Updated just now";
  if (mins === 1) return "Updated 1 min ago";
  return `Updated ${mins} min ago`;
});

function replaceListQuery(partial: {
  tags?: string;
  feed?: string;
  view?: ViewFilter;
  source?: NewsSourceFilter;
}) {
  const q: Record<string, string> = {};
  const source = partial.source ?? sourceFilter.value;
  const feed = partial.feed ?? feedId.value;
  const tags = partial.tags !== undefined ? partial.tags : tagsQuery.value;
  const view = partial.view ?? viewFilter.value;
  if (source && source !== "all") q.source = source;
  if (
    isNewsSource(source) &&
    sectionFeedOptions(source).length > 1 &&
    feed &&
    feed !== "full"
  ) {
    q.feed = feed;
  }
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
  void replaceListQuery({
    feed: normalizeNewsFeedId(sourceFilter.value, id),
  });
}

function setSource(id: NewsSourceFilter) {
  const next = normalizeNewsSourceFilter(id);
  void replaceListQuery({
    source: next,
    feed: normalizeNewsFeedId(next, feedId.value),
  });
}

function setView(id: ViewFilter) {
  void replaceListQuery({ view: id });
}

function toggleLayout() {
  layout.value = layout.value === "magazine" ? "list" : "magazine";
}

function toggleSave(article: NewsArticle) {
  newsStore.toggleSaved(article);
}

function toggleRead(article: NewsArticle) {
  if (newsStore.isRead(article.id)) newsStore.markUnread(article.id);
  else newsStore.markRead(article.id);
}

function toggleWatchAuthor(author: string) {
  newsStore.toggleWatchAuthor(author);
}

function toggleNotifyNew() {
  const next = !newsStore.notifyNew;
  newsStore.notifyNew = next;
  if (next) {
    const maxMs = Math.max(0, ...articles.value.map((a) => a.publishedMs || 0));
    newsStore.ensureFeedSeenBaseline(maxMs);
    newSinceVisit.value = newsStore.countNewerThanSeen(
      articles.value.map((a) => a.publishedMs || 0),
    );
  } else {
    newSinceVisit.value = 0;
  }
}

function relatedRoute(rel: { id: string; source: string }) {
  const custom = parseCustomNewsId(rel.id);
  if (custom) {
    return {
      name: "NewsCustomArticle" as const,
      params: {
        feedId: custom.feedId,
        itemKey: custom.itemKey,
      },
      query: listQuery(),
    };
  }
  const parsed = parseNewsId(rel.id);
  return {
    name: "NewsArticle" as const,
    params: {
      source: parsed?.source || rel.source,
      id: String(parsed?.numericId || ""),
    },
    query: listQuery(),
  };
}

async function submitAddFeed() {
  addFeedError.value = "";
  addFeedLoading.value = true;
  try {
    const probed = await probeCustomNewsFeed(addFeedUrl.value);
    const label = addFeedLabel.value.trim() || probed.title;
    newsStore.addCustomFeed({ url: probed.href, label });
    addFeedOpen.value = false;
    addFeedUrl.value = "";
    addFeedLabel.value = "";
    const created = newsStore.customFeeds[newsStore.customFeeds.length - 1];
    if (created) {
      void replaceListQuery({ source: `custom:${created.id}`, feed: "full" });
    }
    void load(true);
  } catch (e: unknown) {
    addFeedError.value =
      e instanceof Error ? e.message : "Could not add feed.";
  } finally {
    addFeedLoading.value = false;
  }
}

function confirmRemoveFeed(feedId: string) {
  const feed = newsStore.getCustomFeed(feedId);
  if (!feed) return;
  if (
    typeof window !== "undefined" &&
    !window.confirm(`Remove “${feed.label}” from News?`)
  ) {
    return;
  }
  newsStore.removeCustomFeed(feedId);
  if (sourceFilter.value === `custom:${feedId}`) {
    void replaceListQuery({ source: "all", feed: "full" });
  }
  void load(true);
}

function markFilteredRead() {
  newsStore.markAllRead(filtered.value.map((a) => a.id));
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

watch(focusIndex, () => {
  void nextTick(() => {
    const el = pageEl.value?.querySelector(".news-focused");
    el?.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  });
});

function formatDate(article: NewsArticle): string {
  if (!article.publishedMs) return "";
  const delta = Date.now() - article.publishedMs;
  if (delta >= 0) {
    const mins = Math.floor(delta / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins === 1 ? "1 min ago" : `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;
  }
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

function thumbSrc(article: NewsArticle): string {
  const url = article.thumbUrl || "";
  if (!url) return "";
  if (
    /flayrah\.com|dogpatch\.press|infurnation\.com|furrywritersguild\.com|\.wp\.com/i.test(
      url,
    )
  ) {
    return proxyDownloadUrl(url);
  }
  if (article.customFeedId) {
    const feed = newsStore.getCustomFeed(article.customFeedId);
    const hosts: string[] = [];
    for (const raw of [article.link, feed?.url]) {
      if (!raw) continue;
      try {
        hosts.push(new URL(raw).hostname.toLowerCase());
      } catch {
        /* skip */
      }
    }
    try {
      const h = new URL(url).hostname.toLowerCase();
      if (hosts.includes(h)) return proxyCustomMediaUrl(url, hosts);
    } catch {
      /* fall through */
    }
  }
  return url;
}

async function load(force = false) {
  loading.value = true;
  error.value = null;
  fromOffline.value = false;
  partialWarning.value = null;
  noMore.value = false;
  try {
    articles.value = await fetchNewsArticles({
      force,
      source: sourceFilter.value,
      feed: feedId.value,
      customFeeds: customFeedRefs(),
    });
    fromOffline.value = getNewsLastFetchSource() === "offline";
    partialWarning.value = getNewsPartialWarning();
    cacheAgeTick.value += 1;
    const maxMs = Math.max(0, ...articles.value.map((a) => a.publishedMs || 0));
    if (newsStore.notifyNew) {
      newsStore.ensureFeedSeenBaseline(maxMs);
      newSinceVisit.value = newsStore.countNewerThanSeen(
        articles.value.map((a) => a.publishedMs || 0),
      );
    } else {
      newSinceVisit.value = 0;
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load News RSS.";
  } finally {
    loading.value = false;
  }
}

function refresh() {
  void load(true);
}

const canLoadOlder = computed(() => {
  if (
    noMore.value ||
    loading.value ||
    viewFilter.value === "saved" ||
    !articles.value.length
  ) {
    return false;
  }
  if (sourceFilter.value === "all") return true;
  if (isCustomSourceFilter(sourceFilter.value)) return false;
  return (
    isNewsSource(sourceFilter.value) &&
    newsSourceSupportsPaging(sourceFilter.value)
  );
});

async function loadOlder() {
  if (!canLoadOlder.value || loadingMore.value) return;
  loadingMore.value = true;
  error.value = null;
  try {
    const seen = new Set(articles.value.map((a) => a.id));
    let page = 2;
    let fresh: NewsArticle[] = [];
    const olderSource =
      sourceFilter.value === "all" ? "all" : sourceFilter.value;
    // Walk pages until something new appears or the window is exhausted.
    while (page <= NEWS_RSS_PAGE_MAX && !fresh.length) {
      const more = await fetchNewsArticles({
        source: olderSource,
        feed: sourceFilter.value === "all" ? "full" : feedId.value,
        page,
        customFeeds: customFeedRefs(),
      });
      fresh = more.filter((a) => !seen.has(a.id));
      if (!more.length) break;
      if (!fresh.length) page += 1;
    }
    if (!fresh.length) {
      noMore.value = true;
      return;
    }
    articles.value = [...articles.value, ...fresh].sort(
      (a, b) => b.publishedMs - a.publishedMs,
    );
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load older articles.";
  } finally {
    loadingMore.value = false;
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
    void router.push(articleRoute(hit));
    return;
  }
  if (key === "u") {
    const hit = filtered.value[focusIndex.value];
    if (!hit) return;
    e.preventDefault();
    toggleRead(hit);
    return;
  }
  if (key === "s") {
    const hit = filtered.value[focusIndex.value];
    if (!hit) return;
    e.preventDefault();
    toggleSave(hit);
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

watch([sourceFilter, feedId], () => {
  void load();
});

onMounted(() => {
  void load();
  tryNewsIntroTip();
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
  const maxMs = Math.max(0, ...articles.value.map((a) => a.publishedMs || 0));
  if (maxMs > 0) newsStore.markFeedSeen(maxMs);
});
</script>

<style scoped>
.news-feed-header {
  padding: 16px 16px 8px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.news-header-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}
.news-header-right {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.news-search {
  min-width: 220px;
  max-width: 360px;
}
.news-item {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  min-height: 96px;
}
.news-thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  margin-inline-end: 12px;
}
.news-day-heading {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.news-day-heading--magazine {
  grid-column: 1 / -1;
  margin: 4px 0 0;
  padding: 4px 2px;
}
.news-author-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.news-unread :deep(.v-list-item-title),
.news-card.news-unread .news-card-title {
  font-weight: 700;
}
.news-focused {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
.news-magazine {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.news-card {
  display: flex;
  flex-direction: column;
  color: inherit;
  text-decoration: none;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
  overflow: hidden;
  background: rgba(var(--v-theme-surface), 1);
}
.news-card-thumb {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  background: rgba(var(--v-border-color), 0.12);
}
.news-card-body {
  padding: 12px;
}
.news-card-title {
  font-weight: 600;
  line-height: 1.3;
}
.news-go-to-top {
  position: fixed;
  z-index: 2300;
  min-width: 44px;
  min-height: 44px;
}
</style>
