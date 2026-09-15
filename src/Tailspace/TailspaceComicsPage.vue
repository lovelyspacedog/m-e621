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
      <router-link
        v-for="comic in comics"
        :key="comic.id"
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
          <!-- Page count badge -->
          <div class="ts-badge ts-badge--pages">
            <v-icon size="12">mdi-book-open-page-variant</v-icon>
            {{ comic.numberOfPages }}
          </div>
          <!-- WIP badge -->
          <div v-if="comic.state === 'wip'" class="ts-badge ts-badge--wip">WIP</div>
          <div v-else-if="comic.state === 'cancelled'" class="ts-badge ts-badge--cancelled">
            Cancelled
          </div>
          <!-- Category badge -->
          <div class="ts-badge ts-badge--cat">{{ comic.category }}</div>
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

      <!-- Page number buttons (show up to 7) -->
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getComics,
  comicThumb,
  type TailspaceComic,
} from "@/worker/tailspace/api";

const CATEGORIES = ["Male", "Female", "Mix", "Intersex"];
const SORT_OPTIONS = ["Updated", "Newest", "Rating", "Alphabetical"];

const route = useRoute();
const router = useRouter();

// State
const comics = ref<TailspaceComic[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const numberOfPages = ref(1);
const totalNumComics = ref(0);

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

onMounted(() => loadPage(page.value));
watch(page, (p) => loadPage(p));
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
  top: 5px;
  left: 5px;
  background: rgba(255, 165, 0, 0.8);
  color: #000;
}
.ts-badge--cancelled {
  top: 5px;
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
