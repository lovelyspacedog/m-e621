<template>
  <div>
    <portal to="toolbar">
      <div class="pools-toolbar">
        <v-btn-toggle v-model="searchMode" mandatory density="compact" variant="outlined" divided class="pools-mode-toggle">
          <v-btn value="name" size="small">Name</v-btn>
          <v-btn value="tags" size="small">Tags</v-btn>
        </v-btn-toggle>

        <v-text-field
          v-if="searchMode === 'name'"
          v-model="query"
          class="pools-toolbar-search"
          density="compact"
          hide-details
          clearable
          label="Search pools"
          prepend-inner-icon="mdi-magnify"
          variant="solo"
          @keyup.enter="runSearch"
        />
        <tag-search
          v-else
          class="pools-toolbar-search"
          :tags="tags"
          :search-filters="false"
          label="Post tags"
          @add-tag="addTag"
          @remove-tag="removeTag"
          @confirm-search="runTagSearch"
        />

        <v-text-field
          v-model="creator"
          class="pools-toolbar-creator"
          density="compact"
          hide-details
          clearable
          label="Creator"
          variant="solo"
          @keyup.enter="runSearch"
        />

        <v-select
          v-model="order"
          class="pools-toolbar-select"
          density="compact"
          hide-details
          variant="solo"
          :items="orderItems"
          label="Sort"
        />
        <v-select
          v-model="category"
          class="pools-toolbar-select"
          density="compact"
          hide-details
          variant="solo"
          :items="categoryItems"
          label="Category"
        />
        <v-select
          v-model="activeFilter"
          class="pools-toolbar-select"
          density="compact"
          hide-details
          variant="solo"
          :items="activeItems"
          label="Status"
        />

        <v-btn
          v-if="searchMode === 'name'"
          size="small"
          variant="outlined"
          :color="alsoDescriptions ? 'primary' : undefined"
          title="Also match pool descriptions (merged results; pagination is approximate)"
          @click="alsoDescriptions = !alsoDescriptions"
        >
          Desc
        </v-btn>

        <v-btn-toggle v-model="browseLayout" mandatory density="compact" variant="outlined" divided class="pools-layout-toggle">
          <v-btn value="grid" size="small" title="Grid">
            <v-icon size="18">mdi-view-grid</v-icon>
          </v-btn>
          <v-btn value="list" size="small" title="List">
            <v-icon size="18">mdi-view-list</v-icon>
          </v-btn>
        </v-btn-toggle>

        <v-btn icon :loading="loading" @click="runSearch">
          <v-icon>mdi-magnify</v-icon>
        </v-btn>
      </div>
    </portal>

    <v-container>
      <section class="mb-8">
        <div class="d-flex align-center ga-2 mb-3">
          <v-icon color="accent">mdi-eye</v-icon>
          <h2 class="text-h6">Watched Pools</h2>
          <v-progress-circular v-if="watchedLoading" indeterminate size="18" width="2" />
        </div>
        <div v-if="!watchedLoading && !watchedEntries.length" class="text-body-2 text-medium-emphasis">No watched pools for this site.</div>
        <PoolCollection
          v-else-if="watchedPoolResults.length"
          :pools="watchedPoolResults"
          :layout="browseLayout"
          :covers="covers"
          :cover-origin="String(siteMode.activeMode)"
          :watched-ids="watchedIds"
          :new-counts="newCounts"
          @toggle-watch="toggleWatch"
        />
        <v-list v-if="unavailableWatchedIds.length" class="mt-2" bg-color="transparent" density="compact">
          <v-list-item v-for="id in unavailableWatchedIds" :key="id" :title="`Pool ${id}`" subtitle="Pool details are unavailable">
            <template #append>
              <v-btn icon size="small" variant="text" title="Unwatch pool" aria-label="Unwatch pool" @click="removeUnavailableWatch(id)">
                <v-icon>mdi-eye-off-outline</v-icon>
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </section>

      <v-divider class="mb-6" />

      <div v-if="searchMode === 'tags'" class="text-caption text-medium-emphasis mb-3">
        Pools whose posts match your tags (native pool search).
      </div>
      <div v-else-if="alsoDescriptions && queryText()" class="text-caption text-medium-emphasis mb-3">
        Matching names or descriptions (merged; Load more may repeat until both sides exhaust).
      </div>
      <div v-if="error" class="text-medium-emphasis mb-4">{{ error }}</div>
      <div v-else-if="loading && !pools.length" class="text-center py-8">
        <v-progress-circular indeterminate color="accent" />
      </div>
      <div v-else-if="!pools.length && searched && searchMode === 'tags' && !tags.length" class="text-medium-emphasis">
        Add post tags to find pools that contain matching posts.
      </div>
      <div v-else-if="!pools.length && searched" class="text-medium-emphasis">No pools found</div>

      <PoolCollection
        v-else
        :pools="pools"
        :layout="browseLayout"
        :covers="covers"
        :cover-origin="String(siteMode.activeMode)"
        :watched-ids="watchedIds"
        :new-counts="newCounts"
        @toggle-watch="toggleWatch"
      />

      <div v-if="pools.length" class="text-center mt-4">
        <v-btn variant="text" color="accent" :loading="loading" :disabled="!hasMore" @click="loadMore">
          {{ hasMore ? "Load more" : "End of results" }}
        </v-btn>
      </div>
    </v-container>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from "vue";
import { useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import { debounce } from "lodash";
import type { Pool } from "@/worker/api";
import TagSearch from "@/Tag/TagSearch.vue";
import PoolCollection from "@/Pool/PoolCollection.vue";
import { useRouterTagManager } from "@/Post/routerTagManager";
import { useAccountStore, usePostsStore, useSiteModeStore, useUrlStore, useWatchedPoolsStore } from "@/services";
import type { PoolOriginMode } from "@/services/types";
import { BlacklistMode } from "@/services/types";
import { useRouterQueryHelpers } from "@/misc/util/utilities";
import { getApiService } from "@/worker/services";

useHead({ title: "Pools" });

type PoolOrder = "post_count" | "updated_at" | "created_at" | "name";
type PoolCategoryFilter = "all" | "series" | "collection";
type ActiveFilter = "all" | "active" | "inactive";
type SearchMode = "name" | "tags";
type BrowseLayout = "grid" | "list";

const ORDER_VALUES: PoolOrder[] = ["post_count", "updated_at", "created_at", "name"];
const CATEGORY_VALUES: PoolCategoryFilter[] = ["all", "series", "collection"];
const ACTIVE_VALUES: ActiveFilter[] = ["all", "active", "inactive"];
const LAYOUT_KEY = "pools-browse-layout";
const DESC_KEY = "pools-also-descriptions";
const COVER_CANDIDATES = 4;
const ID_BATCH = 40;

const route = useRoute();
const urlStore = useUrlStore();
const siteMode = useSiteModeStore();
const postsStore = usePostsStore();
const account = useAccountStore();
const watchedPoolStore = useWatchedPoolsStore();
const { updateRouterQuery, removeRouterQuery } = useRouterQueryHelpers();
const { tags, addTag, removeTag } = useRouterTagManager();

const orderItems = [
  { title: "Post count", value: "post_count" },
  { title: "Updated", value: "updated_at" },
  { title: "Created", value: "created_at" },
  { title: "Name", value: "name" },
];
const categoryItems = [
  { title: "All", value: "all" },
  { title: "Series", value: "series" },
  { title: "Collection", value: "collection" },
];
const activeItems = [
  { title: "Any status", value: "all" },
  { title: "Active", value: "active" },
  { title: "Inactive", value: "inactive" },
];

const parseOrder = (raw: unknown): PoolOrder => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return ORDER_VALUES.includes(value as PoolOrder) ? (value as PoolOrder) : "post_count";
};
const parseCategory = (raw: unknown): PoolCategoryFilter => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return CATEGORY_VALUES.includes(value as PoolCategoryFilter)
    ? (value as PoolCategoryFilter)
    : "all";
};
const parseActive = (raw: unknown): ActiveFilter => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return ACTIVE_VALUES.includes(value as ActiveFilter) ? (value as ActiveFilter) : "all";
};
const parseQuery = (raw: unknown): string => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : "";
};
const parseMode = (raw: unknown): SearchMode => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "tags" ? "tags" : "name";
};
const parseBoolFlag = (raw: unknown): boolean => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "1" || value === "true";
};
const loadBrowseLayout = (): BrowseLayout => {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    if (v === "list" || v === "grid") return v;
  } catch {
    /* ignore */
  }
  return "grid";
};
const loadAlsoDescriptions = (): boolean => {
  if (route.query.desc != null) return parseBoolFlag(route.query.desc);
  try {
    return localStorage.getItem(DESC_KEY) === "1";
  } catch {
    return false;
  }
};

const query = ref<string | null>(parseQuery(route.query.q));
const creator = ref(parseQuery(route.query.creator));
const order = ref<PoolOrder>(parseOrder(route.query.order));
const category = ref<PoolCategoryFilter>(parseCategory(route.query.category));
const activeFilter = ref<ActiveFilter>(parseActive(route.query.active));
const searchMode = ref<SearchMode>(parseMode(route.query.mode));
const alsoDescriptions = ref(loadAlsoDescriptions());
const browseLayout = ref<BrowseLayout>(loadBrowseLayout());
const pools = ref<Pool[]>([]);
const watchedPoolResults = ref<Pool[]>([]);
const watchedLoading = ref(false);
const covers = ref<Record<string, string>>({});
const loading = ref(false);
const error = ref<string | null>(null);
const searched = ref(false);
const page = ref(1);
const hasMore = ref(true);
const syncingFromRoute = ref(false);
/** Bumps on each tags fetch so overlapping resets cannot wipe results. */
let tagsFetchGeneration = 0;

const poolOrigin = computed(() => siteMode.activeMode as PoolOriginMode);
const watchedEntries = computed(() => watchedPoolStore.entriesFor(poolOrigin.value));
const watchedIds = computed(() => new Set(watchedEntries.value.map((entry) => entry.id)));
const newCounts = computed(() => {
  const out: Record<number, number> = {};
  for (const pool of [...watchedPoolResults.value, ...pools.value]) {
    const n = watchedPoolStore.newCount(poolOrigin.value, pool.id, pool.post_count || 0);
    if (n > 0) out[pool.id] = n;
  }
  return out;
});
const unavailableWatchedIds = computed(() => {
  if (watchedLoading.value) return [];
  const loaded = new Set(watchedPoolResults.value.map((pool) => pool.id));
  return watchedEntries.value.map((entry) => entry.id).filter((id) => !loaded.has(id));
});
const queryText = () => (query.value || "").trim();
const creatorText = () => (creator.value || "").trim();
const browseLimit = () => postsStore.postListFetchLimit || 40;

const mergePools = (lists: Pool[][], existingIds?: Set<number>) => {
  const seen = existingIds ? new Set(existingIds) : new Set<number>();
  const out: Pool[] = [];
  for (const list of lists) {
    for (const pool of list) {
      if (seen.has(pool.id)) continue;
      seen.add(pool.id);
      out.push(pool);
    }
  }
  return out;
};

const sharedPoolArgs = () =>
  ({
    limit: browseLimit(),
    order: order.value,
    category: category.value === "all" ? undefined : category.value,
    isActive:
      activeFilter.value === "all" ? undefined : activeFilter.value === "active",
    creatorName: creatorText() || undefined,
    baseUrl: toRaw(urlStore.e621Url),
    mode: toRaw(siteMode.activeMode),
  }) as const;

const syncQueryToRoute = async () => {
  const next: Record<string, string | undefined> = {};
  const keysToRemove: string[] = [];

  if (searchMode.value === "tags") {
    next.mode = "tags";
    keysToRemove.push("q");
    keysToRemove.push("desc");
  } else {
    keysToRemove.push("mode");
    const q = queryText();
    if (q) next.q = q;
    else keysToRemove.push("q");
    if (alsoDescriptions.value) next.desc = "1";
    else keysToRemove.push("desc");
  }

  if (order.value !== "post_count") next.order = order.value;
  else keysToRemove.push("order");
  if (category.value !== "all") next.category = category.value;
  else keysToRemove.push("category");
  if (activeFilter.value !== "all") next.active = activeFilter.value;
  else keysToRemove.push("active");
  const c = creatorText();
  if (c) next.creator = c;
  else keysToRemove.push("creator");

  if (Object.keys(next).length) await updateRouterQuery(next);
  if (keysToRemove.length) await removeRouterQuery(keysToRemove);
};

const fetchCovers = async (list: Pool[]) => {
  const origin = String(siteMode.activeMode || "e621");
  const coverKey = (id: number) => `${origin}:${id}`;
  const needed = new Set<number>();
  for (const pool of list) {
    const candidates = (pool.post_ids || [])
      .filter((id): id is number => typeof id === "number" && id > 0)
      .slice(0, COVER_CANDIDATES);
    if (!candidates.length) continue;
    if (candidates.some((id) => covers.value[coverKey(id)])) continue;
    for (const id of candidates) needed.add(id);
  }
  const ids = [...needed];
  if (!ids.length) return;

  try {
    const service = await getApiService();
    // id: queries can be long; batch modestly.
    const next = { ...covers.value };
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      const slice = ids.slice(i, i + ID_BATCH);
      const { posts } = await service.getPosts({
        page: 1,
        limit: slice.length,
        tags: [`id:${slice.join(",")}`],
        blacklist: [],
        blacklistMode: BlacklistMode.hide,
        auth: toRaw(account.auth),
        baseUrl: toRaw(urlStore.e621Url),
        mode: toRaw(siteMode.activeMode),
      });
      for (const post of posts) {
        const url = post.preview?.url || post.sample?.url;
        if (url) next[coverKey(post.id)] = url;
      }
    }
    covers.value = next;
  } catch {
    // Soft-fail covers.
  }
};

const hydratePools = async (ids: number[]): Promise<Pool[]> => {
  if (!ids.length) return [];
  const service = await getApiService();
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  const out: Pool[] = [];
  for (let i = 0; i < unique.length; i += ID_BATCH) {
    const slice = unique.slice(i, i + ID_BATCH);
    try {
      const result = await service.getPools({
        ...sharedPoolArgs(),
        limit: Math.max(slice.length, 1),
        page: 1,
        order: "post_count",
        category: undefined,
        isActive: undefined,
        creatorName: undefined,
        ids: slice,
      });
      if (Array.isArray(result)) out.push(...result);
    } catch {
      // Fall through — missing ids show as unavailable watches.
    }
  }
  return out;
};

const poolSnapshot = (pool: Pool) => ({
  postCount: pool.post_count || pool.post_ids?.length || 0,
  updatedAt: pool.updated_at,
});

const loadWatchedPools = async () => {
  watchedLoading.value = true;
  try {
    const hydrated = await hydratePools(watchedEntries.value.map((entry) => entry.id));
    const byId = new Map(hydrated.map((pool) => [pool.id, pool]));
    watchedPoolResults.value = watchedEntries.value
      .map((entry) => byId.get(entry.id))
      .filter((pool): pool is Pool => !!pool);
    for (const pool of watchedPoolResults.value) {
      watchedPoolStore.ensureBaseline(poolOrigin.value, pool.id, poolSnapshot(pool));
    }
    watchedPoolResults.value = [...watchedPoolResults.value].sort((a, b) => {
      const delta =
        watchedPoolStore.newCount(poolOrigin.value, b.id, b.post_count || 0) -
        watchedPoolStore.newCount(poolOrigin.value, a.id, a.post_count || 0);
      if (delta) return delta;
      return 0;
    });
    void fetchCovers(watchedPoolResults.value);
  } finally {
    watchedLoading.value = false;
  }
};

const toggleWatch = (pool: Pool) => {
  const watched = watchedPoolStore.toggle(poolOrigin.value, pool.id, poolSnapshot(pool));
  if (watched) {
    watchedPoolResults.value = [pool, ...watchedPoolResults.value.filter((item) => item.id !== pool.id)];
    void fetchCovers([pool]);
  } else {
    watchedPoolResults.value = watchedPoolResults.value.filter((item) => item.id !== pool.id);
  }
};

const removeUnavailableWatch = (id: number) => {
  watchedPoolStore.remove(poolOrigin.value, id);
};

const fetchPoolsByName = async (pageNumber: number, append: boolean) => {
  loading.value = true;
  error.value = null;
  try {
    const service = await getApiService();
    const q = queryText();
    const limit = browseLimit();
    const shared = {
      ...sharedPoolArgs(),
      limit,
      page: pageNumber,
    };

    let list: Pool[];
    if (q && alsoDescriptions.value) {
      const [byName, byDesc] = await Promise.all([
        service.getPools({ ...shared, query: `*${q}*` }),
        service.getPools({
          ...shared,
          descriptionMatches: `*${q}*`,
        }),
      ]);
      const nameList = Array.isArray(byName) ? byName : [];
      const descList = Array.isArray(byDesc) ? byDesc : [];
      list = mergePools([nameList, descList], append ? new Set(pools.value.map((p) => p.id)) : undefined);
      hasMore.value = nameList.length >= limit || descList.length >= limit;
    } else if (q) {
      const result = await service.getPools({ ...shared, query: `*${q}*` });
      list = Array.isArray(result) ? result : [];
      hasMore.value = list.length >= limit;
    } else {
      const result = await service.getPools(shared);
      list = Array.isArray(result) ? result : [];
      hasMore.value = list.length >= limit;
    }

    pools.value = append ? [...pools.value, ...list] : list;
    if (!append) covers.value = {};
    searched.value = true;
    page.value = pageNumber;
    void fetchCovers(list);
  } catch (err: any) {
    error.value = err?.message || String(err);
    if (!append) pools.value = [];
  } finally {
    loading.value = false;
  }
};

const fetchPoolsByTags = async (pageNumber: number, append: boolean) => {
  const generation = ++tagsFetchGeneration;

  if (!tags.value.length) {
    if (generation !== tagsFetchGeneration) return;
    pools.value = [];
    covers.value = {};
    hasMore.value = false;
    searched.value = true;
    error.value = null;
    page.value = 1;
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    const service = await getApiService();
    const limit = browseLimit();
    const result = await service.getPools({
      ...sharedPoolArgs(),
      limit,
      page: pageNumber,
      postTagsMatch: toRaw(tags.value).join(" "),
    });
    if (generation !== tagsFetchGeneration) return;
    const list = Array.isArray(result) ? result : [];
    pools.value = append ? [...pools.value, ...list] : list;
    if (!append) covers.value = {};
    hasMore.value = list.length >= limit;
    searched.value = true;
    page.value = pageNumber;
    void fetchCovers(list);
  } catch (err: any) {
    if (generation !== tagsFetchGeneration) return;
    error.value = err?.message || String(err);
    if (!append) pools.value = [];
  } finally {
    if (generation === tagsFetchGeneration) loading.value = false;
  }
};

const runSearch = async () => {
  syncingFromRoute.value = true;
  try {
    await syncQueryToRoute();
    if (searchMode.value === "tags") {
      await updateRouterQuery({ tags: tags.value.join(" ") });
    }
  } finally {
    syncingFromRoute.value = false;
  }
  if (searchMode.value === "tags") void fetchPoolsByTags(1, false);
  else void fetchPoolsByName(1, false);
};

const runTagSearch = async () => {
  syncingFromRoute.value = true;
  try {
    await updateRouterQuery({ tags: tags.value.join(" ") });
    await syncQueryToRoute();
  } finally {
    syncingFromRoute.value = false;
  }
  void fetchPoolsByTags(1, false);
};

const loadMore = () => {
  if (!hasMore.value || loading.value) return;
  if (searchMode.value === "tags") {
    void fetchPoolsByTags(page.value + 1, true);
  } else {
    void fetchPoolsByName(page.value + 1, true);
  }
};

const debouncedSearch = debounce(() => {
  runSearch();
}, 400);

watch(query, () => {
  if (syncingFromRoute.value || searchMode.value !== "name") return;
  debouncedSearch();
});

watch(creator, () => {
  if (syncingFromRoute.value) return;
  debouncedSearch();
});

watch([order, category, activeFilter], () => {
  if (syncingFromRoute.value) return;
  runSearch();
});

watch(alsoDescriptions, (value) => {
  try {
    localStorage.setItem(DESC_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (syncingFromRoute.value || searchMode.value !== "name") return;
  runSearch();
});

watch(searchMode, (mode, prev) => {
  if (syncingFromRoute.value || mode === prev) return;
  runSearch();
});

watch(browseLayout, (layout) => {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    /* ignore */
  }
});

watch(
  () =>
    [
      route.query.q,
      route.query.order,
      route.query.category,
      route.query.mode,
      route.query.active,
      route.query.creator,
      route.query.desc,
    ] as const,
  ([q, o, c, m, a, cr, d]) => {
    const nextQuery = parseQuery(q);
    const nextOrder = parseOrder(o);
    const nextCategory = parseCategory(c);
    const nextMode = parseMode(m);
    const nextActive = parseActive(a);
    const nextCreator = parseQuery(cr);
    const nextDesc = d != null ? parseBoolFlag(d) : alsoDescriptions.value;
    if (
      nextQuery === (query.value || "") &&
      nextOrder === order.value &&
      nextCategory === category.value &&
      nextMode === searchMode.value &&
      nextActive === activeFilter.value &&
      nextCreator === (creator.value || "") &&
      nextDesc === alsoDescriptions.value
    ) {
      return;
    }
    syncingFromRoute.value = true;
    query.value = nextQuery;
    order.value = nextOrder;
    category.value = nextCategory;
    searchMode.value = nextMode;
    activeFilter.value = nextActive;
    creator.value = nextCreator;
    alsoDescriptions.value = nextDesc;
    syncingFromRoute.value = false;
    if (nextMode === "tags") void fetchPoolsByTags(1, false);
    else void fetchPoolsByName(1, false);
  },
);

watch(
  () => route.query.tags,
  () => {
    if (syncingFromRoute.value) return;
    if (searchMode.value !== "tags") return;
    void fetchPoolsByTags(1, false);
  },
);

onMounted(() => {
  void loadWatchedPools();
  if (searchMode.value === "tags") void fetchPoolsByTags(1, false);
  else void fetchPoolsByName(1, false);
});

watch(
  () => siteMode.activeMode,
  () => {
    watchedPoolResults.value = [];
    void loadWatchedPools();
    if (searchMode.value === "tags") void fetchPoolsByTags(1, false);
    else void fetchPoolsByName(1, false);
  },
);
</script>

<style scoped>
.pools-toolbar {
  display: flex;
  align-items: center;
  flex-grow: 999;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.pools-toolbar-search {
  flex: 1 1 12rem;
  min-width: 8rem;
}

.pools-toolbar-creator {
  flex: 0 1 8rem;
  min-width: 6rem;
  max-width: 10rem;
}

.pools-toolbar-select {
  flex: 0 1 9rem;
  min-width: 7rem;
  max-width: 11rem;
}

.pools-mode-toggle,
.pools-layout-toggle {
  flex-shrink: 0;
}
</style>
