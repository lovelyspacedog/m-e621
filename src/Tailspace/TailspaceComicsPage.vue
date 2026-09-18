<template>
  <div class="ts-comics-page">
    <!-- Header + filters -->
    <div class="ts-comics-header">
      <div class="ts-header-inner">
        <div class="ts-header-left">
          <span class="text-overline text-medium-emphasis">Tailspace</span>
          <h1 class="text-h6 font-weight-bold">Comics</h1>
        </div>
        <v-btn
          :href="`https://tailspace.com/browse`"
          target="_blank"
          rel="noopener"
          variant="text"
          size="small"
          append-icon="mdi-open-in-new"
        >
          Open on Tailspace
        </v-btn>
      </div>

      <!-- Filter row -->
      <div class="ts-filter-row">
        <!-- Search -->
        <v-text-field
          v-model="searchInput"
          label="Search comics or artists"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          class="ts-search"
          @keydown.enter="applySearch"
          @click:clear="clearSearch"
        />

        <!-- Category chips -->
        <div class="ts-category-chips">
          <v-chip
            v-for="cat in CATEGORIES"
            :key="cat"
            :color="selectedCategories.includes(cat) ? 'primary' : undefined"
            :variant="selectedCategories.includes(cat) ? 'flat' : 'outlined'"
            size="small"
            class="mr-1"
            @click="toggleCategory(cat)"
          >
            {{ cat }}
          </v-chip>
        </div>

        <!-- Sort -->
        <v-select
          v-model="sort"
          :items="SORT_OPTIONS"
          label="Sort"
          variant="outlined"
          density="compact"
          hide-details
          class="ts-sort"
          @update:model-value="onFilterChange"
        />

        <!-- Finished only toggle -->
        <v-checkbox
          v-model="finishedOnly"
          label="Finished only"
          density="compact"
          hide-details
          class="ts-finished"
          @update:model-value="onFilterChange"
        />
      </div>

      <!-- Active filter summary -->
      <div v-if="totalNumComics > 0" class="ts-summary">
        {{ totalNumComics.toLocaleString() }} comics · Page {{ page }} of {{ numberOfPages }}
      </div>
    </div>

    <!-- Watched Comics -->
    <section class="ts-watched-section">
      <div class="ts-watched-heading">
        <v-icon color="accent">mdi-eye</v-icon>
        <h2 class="text-h6">Watched Comics</h2>
        <v-progress-circular v-if="watchedLoading" indeterminate size="18" width="2" />
      </div>
      <div
        v-if="!watchedLoading && !watchedEntries.length"
        class="text-body-2 text-medium-emphasis px-3"
      >
        No watched comics yet. Use the eye button on a comic to watch it.
      </div>
      <div v-else-if="watchedResults.length" class="ts-grid ts-watched-grid">
        <div v-for="comic in watchedResults" :key="`watched-${comic.id}`" class="ts-comic-wrap">
          <router-link
            class="ts-comic-card"
            :to="{ name: 'TailspaceComic', params: { name: comic.name } }"
            :title="comic.name"
          >
            <div class="ts-comic-thumb">
              <img
                class="ts-comic-img"
                :src="comicThumb(comic.id, comic.thumbnailVersion)"
                loading="lazy"
                :alt="comic.name"
              />
              <div class="ts-badge ts-badge--pages">
                <v-icon size="12">mdi-book-open-page-variant</v-icon>
                {{ comic.numberOfPages }}
              </div>
              <div v-if="comic.state === 'wip'" class="ts-badge ts-badge--wip">WIP</div>
              <div v-else-if="comic.state === 'cancelled'" class="ts-badge ts-badge--cancelled">
                Cancelled
              </div>
              <div v-if="comic.category" class="ts-badge ts-badge--cat">{{ comic.category }}</div>
              <div v-if="newCountFor(comic) > 0" class="ts-badge ts-badge--new">
                +{{ newCountFor(comic) }}
              </div>
            </div>
            <div class="ts-comic-info">
              <div class="ts-comic-title">{{ comic.name }}</div>
              <div class="ts-comic-artist">{{ comic.displayName || comic.artistName }}</div>
            </div>
          </router-link>
          <v-btn
            class="ts-watch-btn"
            icon
            size="x-small"
            variant="tonal"
            color="accent"
            title="Unwatch comic"
            aria-label="Unwatch comic"
            @click="toggleWatch(comic)"
          >
            <v-icon size="18">mdi-eye</v-icon>
          </v-btn>
        </div>
      </div>
      <v-list v-if="unavailableWatched.length" class="mt-2 mx-2" bg-color="transparent" density="compact">
        <v-list-item
          v-for="entry in unavailableWatched"
          :key="`missing-${entry.id}`"
          :title="entry.name || `Comic ${entry.id}`"
          subtitle="Unavailable or failed to load"
        >
          <template #append>
            <v-btn
              icon
              size="small"
              variant="text"
              title="Unwatch comic"
              aria-label="Unwatch comic"
              @click="watchedStore.remove(entry.id)"
            >
              <v-icon>mdi-eye-off-outline</v-icon>
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
    </section>

    <v-divider class="mb-4 mx-3" />

    <!-- Error -->
    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <!-- Loading skeleton -->
    <div v-if="loading && comics.length === 0" class="ts-grid">
      <div v-for="n in 30" :key="n" class="ts-comic-skeleton">
        <v-skeleton-loader type="image" class="ts-skeleton-img" />
        <v-skeleton-loader type="text" class="mt-1 mx-1" />
      </div>
    </div>

    <!-- Comics grid -->
    <div v-else-if="comics.length > 0" class="ts-grid">
      <div v-for="comic in comics" :key="comic.id" class="ts-comic-wrap">
        <router-link
          class="ts-comic-card"
          :to="{ name: 'TailspaceComic', params: { name: comic.name } }"
          :title="comic.name"
        >
          <div class="ts-comic-thumb">
            <img
              class="ts-comic-img"
              :src="comicThumb(comic.id, comic.thumbnailVersion)"
              loading="lazy"
              :alt="comic.name"
            />
            <div class="ts-badge ts-badge--pages">
              <v-icon size="12">mdi-book-open-page-variant</v-icon>
              {{ comic.numberOfPages }}
            </div>
            <div v-if="comic.state === 'wip'" class="ts-badge ts-badge--wip">WIP</div>
            <div v-else-if="comic.state === 'cancelled'" class="ts-badge ts-badge--cancelled">
              Cancelled
            </div>
            <div class="ts-badge ts-badge--cat">{{ comic.category }}</div>
            <div v-if="newCountFor(comic) > 0" class="ts-badge ts-badge--new">
              +{{ newCountFor(comic) }}
            </div>
          </div>
          <div class="ts-comic-info">
            <div class="ts-comic-title">{{ comic.name }}</div>
            <div class="ts-comic-artist">{{ comic.displayName || comic.artistName }}</div>
            <div class="ts-comic-stats">
              <span title="Rating">
                <v-icon size="12">mdi-star</v-icon>
                {{ Number(comic.avgStars ?? 0).toFixed(1) }}
              </span>
              <span title="Comments">
                <v-icon size="12">mdi-comment-outline</v-icon>
                {{ comic.commentCount }}
              </span>
            </div>
          </div>
        </router-link>
        <v-btn
          class="ts-watch-btn"
          icon
          size="x-small"
          variant="tonal"
          :color="watchedStore.isWatched(comic.id) ? 'accent' : undefined"
          :title="watchedStore.isWatched(comic.id) ? 'Unwatch comic' : 'Watch comic'"
          :aria-label="watchedStore.isWatched(comic.id) ? 'Unwatch comic' : 'Watch comic'"
          @click="toggleWatch(comic)"
        >
          <v-icon size="18">
            {{ watchedStore.isWatched(comic.id) ? "mdi-eye" : "mdi-eye-outline" }}
          </v-icon>
        </v-btn>
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="!loading" class="ts-empty">
      <v-icon size="64" color="medium-emphasis">mdi-bookshelf</v-icon>
      <p class="mt-3 text-medium-emphasis">No comics match your filters.</p>
      <v-btn variant="text" size="small" class="mt-2" @click="clearFilters">
        Clear filters
      </v-btn>
    </div>

    <!-- Pagination -->
    <div v-if="numberOfPages > 1" class="ts-pagination">
      <v-btn
        :disabled="page <= 1 || loading"
        variant="outlined"
        size="small"
        icon="mdi-chevron-left"
        @click="changePage(page - 1)"
      />

      <template v-for="(p, i) in pageButtons" :key="`${p}-${i}`">
        <v-btn
          v-if="p !== '...'"
          :variant="p === page ? 'flat' : 'text'"
          :color="p === page ? 'primary' : undefined"
          size="small"
          min-width="36"
          @click="changePage(Number(p))"
        >
          {{ p }}
        </v-btn>
        <span v-else class="ts-ellipsis">…</span>
      </template>

      <v-btn
        :disabled="page >= numberOfPages || loading"
        variant="outlined"
        size="small"
        icon="mdi-chevron-right"
        @click="changePage(page + 1)"
      />
    </div>

    <TipDialog
      :tip-id="TIP_IDS.watchedComics"
      title="Watched comic badges"
      v-model="watchedComicsTipOpen"
    >
      <p class="mb-0">
        A +N badge on a watched comic means new pages since you last checked.
        Watch comics with the eye button; open Watched Comics at the top of this
        page to catch up.
      </p>
    </TipDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getComics,
  getComic,
  comicThumb,
  type TailspaceComic,
} from "@/worker/tailspace/api";
import type { TailspaceComicDetail } from "@/worker/tailspace/types";
import type { WatchedComicEntry } from "@/services/types";
import { useWatchedComicsStore } from "@/services/WatchedComicsStore";
import { coerceTailspaceTimestamp } from "@/misc/util/tailspacePoolBrowse";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import TipDialog from "@/misc/TipDialog.vue";
import { useTailspaceSession } from "./useTailspaceSession";

useTailspaceSession();

type ComicCard = Pick<
  TailspaceComic,
  | "id"
  | "name"
  | "numberOfPages"
  | "thumbnailVersion"
  | "displayName"
  | "artistName"
  | "category"
  | "state"
> & {
  updated?: TailspaceComic["updated"];
  avgStars?: number | null;
  commentCount?: number;
};

const CATEGORIES = ["Male", "Female", "Mix", "Intersex"];
const SORT_OPTIONS = ["Updated", "Newest", "Rating", "Alphabetical"];

const route = useRoute();
const router = useRouter();
const watchedStore = useWatchedComicsStore();

// State
const comics = ref<TailspaceComic[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const numberOfPages = ref(1);
const totalNumComics = ref(0);

const watchedLoading = ref(false);
const watchedResults = ref<ComicCard[]>([]);
const unavailableWatched = ref<WatchedComicEntry[]>([]);

const watchedEntries = computed(() => watchedStore.entries);

const { open: watchedComicsTipOpen, tryOpenOnEdge: tryWatchedComicsTip } =
  useTipOpen(TIP_IDS.watchedComics);

const comicSnapshot = (comic: {
  numberOfPages: number;
  updated?: TailspaceComic["updated"] | null;
}) => {
  const updated =
    comic.updated != null ? coerceTailspaceTimestamp(comic.updated) : undefined;
  return {
    pageCount: comic.numberOfPages || 0,
    updatedAt:
      updated && Number.isFinite(updated.getTime()) && updated.getTime() > 0
        ? updated
        : undefined,
  };
};

const newCountFor = (comic: { id: number; numberOfPages: number; updated?: unknown }) => {
  const snap = comicSnapshot(comic as ComicCard);
  return watchedStore.newCount(comic.id, snap.pageCount, snap.updatedAt);
};

const hasWatchedNewBadge = computed(() =>
  watchedResults.value.some((comic) => newCountFor(comic) > 0),
);
watch(hasWatchedNewBadge, tryWatchedComicsTip);

const detailToCard = (detail: TailspaceComicDetail): ComicCard => ({
  id: detail.id,
  name: detail.name,
  numberOfPages: detail.numberOfPages,
  thumbnailVersion: detail.thumbnailVersion,
  displayName: detail.artistDisplayName || null,
  artistName: detail.artistName,
  category: detail.category || "",
  state: (detail.state as TailspaceComic["state"]) || "complete",
  avgStars: detail.avgStars,
  commentCount: detail.commentCount,
});

const loadWatchedComics = async () => {
  watchedLoading.value = true;
  try {
    const entries = watchedEntries.value;
    if (!entries.length) {
      watchedResults.value = [];
      unavailableWatched.value = [];
      return;
    }
    const hydrated: ComicCard[] = [];
    const missing: WatchedComicEntry[] = [];
    await Promise.all(
      entries.map(async (entry) => {
        try {
          const detail = await getComic(entry.name);
          if (!detail?.id || !detail.name) {
            missing.push(entry);
            return;
          }
          hydrated.push(detailToCard(detail));
        } catch {
          missing.push(entry);
        }
      }),
    );
    for (const comic of hydrated) {
      watchedStore.ensureBaseline(comic.id, comicSnapshot(comic));
    }
    watchedResults.value = [...hydrated].sort((a, b) => {
      const delta = newCountFor(b) - newCountFor(a);
      if (delta) return delta;
      return 0;
    });
    unavailableWatched.value = missing;
  } finally {
    watchedLoading.value = false;
  }
};

const toggleWatch = (comic: ComicCard) => {
  const watched = watchedStore.toggle(comic.id, comic.name, comicSnapshot(comic));
  if (watched) {
    watchedResults.value = [
      comic,
      ...watchedResults.value.filter((item) => item.id !== comic.id),
    ];
    unavailableWatched.value = unavailableWatched.value.filter(
      (entry) => entry.id !== comic.id,
    );
  } else {
    watchedResults.value = watchedResults.value.filter((item) => item.id !== comic.id);
  }
};

// Filter state
const page = ref(Number(route.query.page) || 1);
const searchInput = ref((route.query.search as string) || "");
const activeSearch = ref((route.query.search as string) || "");
const selectedCategories = ref<string[]>(
  typeof route.query.categories === "string" && route.query.categories
    ? route.query.categories.split(",").filter(Boolean)
    : [],
);
const sort = ref(
  typeof route.query.sort === "string" && route.query.sort
    ? route.query.sort
    : "Updated",
);
const finishedOnly = ref(route.query.finished === "1");

async function loadPage(p: number) {
  loading.value = true;
  error.value = null;
  try {
    const res = await getComics({
      page: p,
      search: activeSearch.value || undefined,
      categories: selectedCategories.value.length ? selectedCategories.value : undefined,
      sort: sort.value !== "Updated" ? sort.value : undefined,
      finishedOnly: finishedOnly.value || undefined,
    });
    comics.value = (res.comics || []).filter(
      (c) => typeof c.id === "number" && !!c.name && !!c.artistName,
    );
    numberOfPages.value = res.numberOfPages;
    totalNumComics.value = res.totalNumComics;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load comics.";
  } finally {
    loading.value = false;
  }
}

function applySearch() {
  activeSearch.value = searchInput.value;
  changePage(1);
}

function clearSearch() {
  searchInput.value = "";
  activeSearch.value = "";
  changePage(1);
}

function toggleCategory(cat: string) {
  const idx = selectedCategories.value.indexOf(cat);
  if (idx >= 0) {
    selectedCategories.value.splice(idx, 1);
  } else {
    selectedCategories.value.push(cat);
  }
  changePage(1);
}

function onFilterChange() {
  changePage(1);
}

function clearFilters() {
  searchInput.value = "";
  activeSearch.value = "";
  selectedCategories.value = [];
  sort.value = "Updated";
  finishedOnly.value = false;
  changePage(1);
}

function changePage(p: number) {
  const next = Math.max(1, p);
  const samePage = page.value === next;
  page.value = next;
  const q: Record<string, string> = {};
  if (next > 1) q.page = String(next);
  if (activeSearch.value) q.search = activeSearch.value;
  if (selectedCategories.value.length) {
    q.categories = selectedCategories.value.join(",");
  }
  if (sort.value && sort.value !== "Updated") q.sort = sort.value;
  if (finishedOnly.value) q.finished = "1";
  router.replace({ query: q });
  window.scrollTo({ top: 0, behavior: "smooth" });
  // watch(page) only fires on value change — reload explicitly when
  // filters/search re-request the same page.
  if (samePage) void loadPage(next);
}

/** Generate the visible page buttons with ellipsis. */
const pageButtons = computed((): (number | "...")[] => {
  const n = numberOfPages.value;
  const cur = page.value;
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
  const pages: (number | "...")[] = [];
  const addPage = (p: number) => {
    if (!pages.includes(p)) pages.push(p);
  };
  addPage(1);
  if (cur > 3) pages.push("...");
  for (let i = Math.max(2, cur - 1); i <= Math.min(n - 1, cur + 1); i++) addPage(i);
  if (cur < n - 2) pages.push("...");
  addPage(n);
  return pages;
});

onMounted(() => {
  void loadPage(page.value);
  void loadWatchedComics();
});
watch(page, (p) => loadPage(p));
watch(
  () => watchedStore.entries.map((e) => `${e.id}:${e.name}`).join(","),
  () => {
    void loadWatchedComics();
  },
);
// Sync from browser history (M24/M25).
watch(
  () => ({
    page: Number(route.query.page) || 1,
    search: typeof route.query.search === "string" ? route.query.search : "",
    categories:
      typeof route.query.categories === "string" ? route.query.categories : "",
    sort: typeof route.query.sort === "string" ? route.query.sort : "Updated",
    finished: route.query.finished === "1",
  }),
  (q) => {
    let dirty = false;
    if (q.page !== page.value) {
      page.value = q.page;
      dirty = true;
    }
    if (q.search !== activeSearch.value) {
      searchInput.value = q.search;
      activeSearch.value = q.search;
      dirty = true;
    }
    const cats = q.categories ? q.categories.split(",").filter(Boolean) : [];
    if (cats.join(",") !== selectedCategories.value.join(",")) {
      selectedCategories.value = cats;
      dirty = true;
    }
    if (q.sort !== sort.value) {
      sort.value = q.sort || "Updated";
      dirty = true;
    }
    if (q.finished !== finishedOnly.value) {
      finishedOnly.value = q.finished;
      dirty = true;
    }
    // page watch loads on page change; reload when only filters changed.
    if (dirty && q.page === page.value) void loadPage(page.value);
  },
);
</script>

<style scoped>
.ts-comics-page {
  min-height: 100%;
  padding-bottom: 2rem;
}

/* ── Header ── */
.ts-comics-header {
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  margin-bottom: 0.75rem;
}
.ts-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1800px;
  margin: 0 auto 0.75rem;
}
.ts-header-left {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

/* ── Filters ── */
.ts-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  max-width: 1800px;
  margin: 0 auto;
}
.ts-search {
  min-width: 200px;
  max-width: 320px;
}
.ts-sort {
  min-width: 130px;
  max-width: 160px;
}
.ts-category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.ts-finished {
  margin-top: 0 !important;
}
.ts-summary {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-top: 6px;
  max-width: 1800px;
}

/* ── Watched section ── */
.ts-watched-section {
  max-width: 1800px;
  margin: 0 auto 0.5rem;
  padding: 0 0.75rem;
}
@media (min-width: 960px) {
  .ts-watched-section {
    padding: 0 1.25rem;
  }
}
.ts-watched-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0.75rem;
  padding: 0 0.25rem;
}
.ts-watched-grid {
  padding-left: 0;
  padding-right: 0;
}

.ts-comic-wrap {
  position: relative;
}
.ts-watch-btn {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  background: rgba(0, 0, 0, 0.45) !important;
}

/* ── Grid ── */
.ts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  padding: 0 0.75rem;
  max-width: 1800px;
  margin: 0 auto;
}
@media (min-width: 600px) {
  .ts-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
}
@media (min-width: 960px) {
  .ts-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
    padding: 0 1.25rem;
  }
}

/* ── Comic card ── */
.ts-comic-card {
  display: block;
  text-decoration: none;
  color: inherit;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(var(--v-theme-surface-variant), 0.4);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.ts-comic-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}

.ts-comic-thumb {
  position: relative;
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-border-color), 0.15);
  overflow: hidden;
}
.ts-comic-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s ease;
}
.ts-comic-card:hover .ts-comic-img {
  transform: scale(1.04);
}

/* Badges */
.ts-badge {
  position: absolute;
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  display: flex;
  align-items: center;
  gap: 2px;
  backdrop-filter: blur(4px);
}
.ts-badge--pages {
  bottom: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
}
.ts-badge--wip {
  top: 36px;
  left: 5px;
  background: rgba(255, 165, 0, 0.8);
  color: #000;
}
.ts-badge--cancelled {
  top: 36px;
  left: 5px;
  background: rgba(180, 0, 0, 0.75);
  color: #fff;
}
.ts-badge--cat {
  top: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
.ts-badge--new {
  bottom: 5px;
  left: 5px;
  background: rgb(var(--v-theme-accent));
  color: rgb(var(--v-theme-on-accent));
}

.ts-comic-info {
  padding: 6px 8px 8px;
}
.ts-comic-title {
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.ts-comic-artist {
  font-size: 0.72rem;
  opacity: 0.6;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ts-comic-stats {
  display: flex;
  gap: 8px;
  margin-top: 3px;
  font-size: 0.72rem;
  opacity: 0.65;
}
.ts-comic-stats span {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* ── Skeleton ── */
.ts-comic-skeleton {
  border-radius: 8px;
  overflow: hidden;
}
.ts-skeleton-img {
  aspect-ratio: 2 / 3;
}

/* ── Empty ── */
.ts-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5rem 2rem;
}

/* ── Pagination ── */
.ts-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 1.5rem 1rem;
}
.ts-ellipsis {
  display: inline-flex;
  align-items: center;
  padding: 0 4px;
  font-size: 1rem;
  color: rgba(var(--v-theme-on-surface), 0.4);
}
</style>
