<template>
  <div>
    <portal to="toolbar">
      <div class="pools-toolbar">
        <v-btn-toggle
          v-model="searchMode"
          mandatory
          density="compact"
          variant="outlined"
          divided
          class="pools-mode-toggle"
        >
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

        <v-select
          v-model="order"
          class="pools-toolbar-select"
          density="compact"
          hide-details
          variant="solo"
          :items="orderItems"
          :disabled="searchMode === 'tags'"
          label="Sort"
        />
        <v-select
          v-model="category"
          class="pools-toolbar-select"
          density="compact"
          hide-details
          variant="solo"
          :items="categoryItems"
          :disabled="searchMode === 'tags'"
          label="Category"
        />

        <v-btn-toggle
          v-model="browseLayout"
          mandatory
          density="compact"
          variant="outlined"
          divided
          class="pools-layout-toggle"
        >
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
      <div v-if="searchMode === 'tags'" class="text-caption text-medium-emphasis mb-3">
        Pools discovered from posts matching your tags (sort/category disabled).
      </div>
      <div v-if="error" class="text-medium-emphasis mb-4">{{ error }}</div>
      <div v-else-if="loading && !pools.length" class="text-center py-8">
        <v-progress-circular indeterminate color="accent" />
      </div>
      <div
        v-else-if="!pools.length && searched && searchMode === 'tags' && !tags.length"
        class="text-medium-emphasis"
      >
        Add post tags to find pools that contain matching posts.
      </div>
      <div v-else-if="!pools.length && searched" class="text-medium-emphasis">
        No pools found
      </div>

      <div v-else-if="browseLayout === 'grid'" class="pools-grid">
        <router-link
          v-for="pool in pools"
          :key="pool.id"
          class="pools-card"
          :to="{ name: 'Pool', params: { id: pool.id } }"
          :title="displayName(pool.name)"
        >
          <div class="pools-card-thumb">
            <img
              v-if="coverUrl(pool)"
              class="pools-card-img"
              :src="coverUrl(pool)!"
              :alt="displayName(pool.name)"
              loading="lazy"
            />
            <div v-else class="pools-card-placeholder">
              <v-icon size="36" class="text-medium-emphasis">
                mdi-image-off-outline
              </v-icon>
            </div>
            <div class="pools-badge pools-badge--pages">
              <v-icon size="12">mdi-image-multiple</v-icon>
              {{ pool.post_count }}
            </div>
            <div v-if="pool.category" class="pools-badge pools-badge--cat">
              {{ pool.category }}
            </div>
            <div v-if="!pool.is_active" class="pools-badge pools-badge--inactive">
              inactive
            </div>
          </div>
          <div class="pools-card-info">
            <div class="pools-card-title">{{ displayName(pool.name) }}</div>
            <div class="pools-card-meta">{{ pool.creator_name }}</div>
          </div>
        </router-link>
      </div>

      <v-list v-else bg-color="transparent">
        <v-list-item
          v-for="pool in pools"
          :key="pool.id"
          :to="{ name: 'Pool', params: { id: pool.id } }"
          rounded="lg"
          class="mb-1 pool-row"
        >
          <template #prepend>
            <div class="pool-cover">
              <img
                v-if="coverUrl(pool)"
                :src="coverUrl(pool)!"
                :alt="displayName(pool.name)"
                class="pool-cover-img"
                loading="lazy"
              />
              <v-icon v-else size="32" class="text-medium-emphasis">
                mdi-image-off-outline
              </v-icon>
            </div>
          </template>
          <v-list-item-title>{{ displayName(pool.name) }}</v-list-item-title>
          <v-list-item-subtitle>
            {{ pool.post_count }} posts · {{ pool.creator_name }}
            <span v-if="pool.category"> · {{ pool.category }}</span>
            <span v-if="!pool.is_active"> · inactive</span>
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>

      <div v-if="pools.length" class="text-center mt-4">
        <v-btn
          variant="text"
          color="accent"
          :loading="loading"
          :disabled="!hasMore"
          @click="loadMore"
        >
          {{ hasMore ? "Load more" : "End of results" }}
        </v-btn>
      </div>
    </v-container>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, toRaw, watch } from "vue";
import { useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import { debounce } from "lodash";
import type { Pool } from "@/worker/api";
import TagSearch from "@/Tag/TagSearch.vue";
import { useRouterTagManager } from "@/Post/routerTagManager";
import {
  useAccountStore,
  useBlacklistStore,
  usePostsStore,
  useSiteModeStore,
  useUrlStore,
} from "@/services";
import { BlacklistMode } from "@/services/types";
import { useRouterQueryHelpers } from "@/misc/util/utilities";
import { getApiService } from "@/worker/services";

useHead({ title: "Pools" });

type PoolOrder = "post_count" | "updated_at" | "created_at" | "name";
type PoolCategoryFilter = "all" | "series" | "collection";
type SearchMode = "name" | "tags";
type BrowseLayout = "grid" | "list";

const ORDER_VALUES: PoolOrder[] = [
  "post_count",
  "updated_at",
  "created_at",
  "name",
];
const CATEGORY_VALUES: PoolCategoryFilter[] = [
  "all",
  "series",
  "collection",
];
const LAYOUT_KEY = "pools-browse-layout";
const TAG_FETCH_CONCURRENCY = 8;

const route = useRoute();
const urlStore = useUrlStore();
const siteMode = useSiteModeStore();
const postsStore = usePostsStore();
const account = useAccountStore();
const blacklist = useBlacklistStore();
const { updateRouterQuery, removeRouterQuery } = useRouterQueryHelpers();
const { tags, addTag, removeTag, updateQuery: commitTagsToRoute } =
  useRouterTagManager();

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

const parseOrder = (raw: unknown): PoolOrder => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return ORDER_VALUES.includes(value as PoolOrder)
    ? (value as PoolOrder)
    : "post_count";
};
const parseCategory = (raw: unknown): PoolCategoryFilter => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return CATEGORY_VALUES.includes(value as PoolCategoryFilter)
    ? (value as PoolCategoryFilter)
    : "all";
};
const parseQuery = (raw: unknown): string => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : "";
};
const parseMode = (raw: unknown): SearchMode => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "tags" ? "tags" : "name";
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

const query = ref<string | null>(parseQuery(route.query.q));
const order = ref<PoolOrder>(parseOrder(route.query.order));
const category = ref<PoolCategoryFilter>(parseCategory(route.query.category));
const searchMode = ref<SearchMode>(parseMode(route.query.mode));
const browseLayout = ref<BrowseLayout>(loadBrowseLayout());
const pools = ref<Pool[]>([]);
const covers = ref<Record<number, string>>({});
const loading = ref(false);
const error = ref<string | null>(null);
const searched = ref(false);
const page = ref(1);
const hasMore = ref(true);
const syncingFromRoute = ref(false);
/** Posts page cursor for tags-mode discovery */
const tagPostsPage = ref(0);
const seenPoolIds = ref<Set<number>>(new Set());

const displayName = (name: string) => name.replace(/_/g, " ");
const coverUrl = (pool: Pool) => {
  const firstId = pool.post_ids?.[0];
  return firstId ? covers.value[firstId] || null : null;
};
const queryText = () => (query.value || "").trim();
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

const syncQueryToRoute = async () => {
  const next: Record<string, string | undefined> = {};
  const keysToRemove: string[] = [];

  if (searchMode.value === "tags") {
    next.mode = "tags";
    keysToRemove.push("q");
  } else {
    keysToRemove.push("mode");
    const q = queryText();
    if (q) next.q = q;
    else keysToRemove.push("q");
  }

  if (searchMode.value === "name") {
    if (order.value !== "post_count") next.order = order.value;
    else keysToRemove.push("order");
    if (category.value !== "all") next.category = category.value;
    else keysToRemove.push("category");
  }

  if (Object.keys(next).length) await updateRouterQuery(next);
  if (keysToRemove.length) await removeRouterQuery(keysToRemove);
};

const fetchCovers = async (list: Pool[]) => {
  const ids = [
    ...new Set(
      list
        .map((pool) => pool.post_ids?.[0])
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ].filter((id) => !covers.value[id]);
  if (!ids.length) return;

  try {
    const service = await getApiService();
    const { posts } = await service.getPosts({
      page: 1,
      limit: ids.length,
      tags: [`id:${ids.join(",")}`],
      blacklist: [],
      blacklistMode: BlacklistMode.hide,
      auth: toRaw(account.auth),
      baseUrl: toRaw(urlStore.e621Url),
      mode: toRaw(siteMode.activeMode),
    });
    const next = { ...covers.value };
    for (const post of posts) {
      const url = post.preview?.url || post.sample?.url;
      if (url) next[post.id] = url;
    }
    covers.value = next;
  } catch {
    // Soft-fail covers.
  }
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null>,
): Promise<R[]> => {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (index < items.length) {
        const currentIndex = index++;
        results[currentIndex] = await fn(items[currentIndex]);
      }
    },
  );
  await Promise.all(workers);
  return results.filter((value): value is R => value != null);
};

const hydratePools = async (ids: number[]): Promise<Pool[]> => {
  if (!ids.length) return [];
  const service = await getApiService();
  return mapWithConcurrency(ids, TAG_FETCH_CONCURRENCY, async (id) => {
    try {
      return await service.getPool({
        id,
        baseUrl: toRaw(urlStore.e621Url),
        mode: toRaw(siteMode.activeMode),
      });
    } catch {
      return null;
    }
  });
};

const fetchPoolsByName = async (pageNumber: number, append: boolean) => {
  loading.value = true;
  error.value = null;
  try {
    const service = await getApiService();
    const q = queryText();
    const limit = browseLimit();
    const shared = {
      limit,
      page: pageNumber,
      order: order.value,
      category: category.value === "all" ? undefined : category.value,
      baseUrl: toRaw(urlStore.e621Url),
      mode: toRaw(siteMode.activeMode),
    } as const;

    let list: Pool[];
    if (q) {
      // Name and description are separate filters (AND if combined). Merge two
      // pages so either field can match.
      const [byName, byDesc] = await Promise.all([
        service.getPools({ ...shared, query: `*${q}*` }),
        service.getPools({
          ...shared,
          descriptionMatches: `*${q}*`,
        }),
      ]);
      const nameList = Array.isArray(byName) ? byName : [];
      const descList = Array.isArray(byDesc) ? byDesc : [];
      list = mergePools(
        [nameList, descList],
        append ? new Set(pools.value.map((p) => p.id)) : undefined,
      );
      hasMore.value = nameList.length >= limit || descList.length >= limit;
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

/**
 * Discover pools from posts matching tags (+ pool:>0). Advances posts pages
 * until we collect `browseLimit` new pools or posts run out.
 */
const fetchPoolsByTags = async (reset: boolean) => {
  if (!tags.value.length) {
    pools.value = [];
    covers.value = {};
    seenPoolIds.value = new Set();
    tagPostsPage.value = 0;
    hasMore.value = false;
    searched.value = true;
    error.value = null;
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    const service = await getApiService();
    const limit = browseLimit();
    const postPageSize = Math.min(limit, 40);
    if (reset) {
      pools.value = [];
      covers.value = {};
      seenPoolIds.value = new Set();
      tagPostsPage.value = 0;
    }

    const collected: Pool[] = [];
    let postsPage = tagPostsPage.value;
    let postsExhausted = false;

    while (collected.length < limit && !postsExhausted) {
      postsPage += 1;
      const { posts } = await service.getPosts({
        page: postsPage,
        limit: postPageSize,
        tags: [...toRaw(tags.value), "pool:>0"],
        blacklist: toRaw(blacklist.tags),
        blacklistMode: toRaw(blacklist.mode),
        auth: toRaw(account.auth),
        baseUrl: toRaw(urlStore.e621Url),
        mode: toRaw(siteMode.activeMode),
      });
      if (!posts.length) {
        postsExhausted = true;
        break;
      }
      if (posts.length < postPageSize) postsExhausted = true;

      const newIds: number[] = [];
      for (const post of posts) {
        for (const poolId of post.pools || []) {
          if (seenPoolIds.value.has(poolId)) continue;
          seenPoolIds.value.add(poolId);
          newIds.push(poolId);
        }
      }
      if (newIds.length) {
        const hydrated = await hydratePools(newIds);
        collected.push(...hydrated);
      }
    }

    tagPostsPage.value = postsPage;
    pools.value = reset ? collected : [...pools.value, ...collected];
    hasMore.value = !postsExhausted;
    searched.value = true;
    void fetchCovers(collected);
  } catch (err: any) {
    error.value = err?.message || String(err);
    if (reset) pools.value = [];
  } finally {
    loading.value = false;
  }
};

const runSearch = () => {
  void syncQueryToRoute();
  if (searchMode.value === "tags") {
    commitTagsToRoute();
    void fetchPoolsByTags(true);
  } else {
    void fetchPoolsByName(1, false);
  }
};

const runTagSearch = () => {
  commitTagsToRoute();
  void syncQueryToRoute();
  void fetchPoolsByTags(true);
};

const loadMore = () => {
  if (!hasMore.value || loading.value) return;
  if (searchMode.value === "tags") {
    void fetchPoolsByTags(false);
  } else {
    void fetchPoolsByName(page.value + 1, true);
  }
};

const debouncedSearch = debounce(() => {
  if (searchMode.value !== "name") return;
  runSearch();
}, 400);

watch(query, () => {
  if (syncingFromRoute.value || searchMode.value !== "name") return;
  debouncedSearch();
});

watch([order, category], () => {
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
    ] as const,
  ([q, o, c, m]) => {
    const nextQuery = parseQuery(q);
    const nextOrder = parseOrder(o);
    const nextCategory = parseCategory(c);
    const nextMode = parseMode(m);
    if (
      nextQuery === (query.value || "") &&
      nextOrder === order.value &&
      nextCategory === category.value &&
      nextMode === searchMode.value
    ) {
      return;
    }
    syncingFromRoute.value = true;
    query.value = nextQuery;
    order.value = nextOrder;
    category.value = nextCategory;
    searchMode.value = nextMode;
    syncingFromRoute.value = false;
    if (nextMode === "tags") void fetchPoolsByTags(true);
    else void fetchPoolsByName(1, false);
  },
);

watch(
  () => route.query.tags,
  () => {
    if (syncingFromRoute.value) return;
    if (searchMode.value !== "tags") return;
    void fetchPoolsByTags(true);
  },
);

onMounted(() => {
  if (searchMode.value === "tags") void fetchPoolsByTags(true);
  else void fetchPoolsByName(1, false);
});
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

.pools-toolbar-select {
  flex: 0 1 9rem;
  min-width: 7rem;
  max-width: 11rem;
}

.pools-mode-toggle,
.pools-layout-toggle {
  flex-shrink: 0;
}

.pool-row :deep(.v-list-item__prepend) {
  margin-inline-end: 12px;
}

.pool-cover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(128, 128, 128, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pool-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.pools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  max-width: 1800px;
  margin: 0 auto;
}
@media (min-width: 600px) {
  .pools-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
}
@media (min-width: 960px) {
  .pools-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }
}

.pools-card {
  display: block;
  text-decoration: none;
  color: inherit;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(var(--v-theme-surface-variant), 0.4);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.pools-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}

.pools-card-thumb {
  position: relative;
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-border-color), 0.15);
  overflow: hidden;
}
.pools-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s ease;
}
.pools-card:hover .pools-card-img {
  transform: scale(1.04);
}
.pools-card-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pools-badge {
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
.pools-badge--pages {
  bottom: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
}
.pools-badge--cat {
  top: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
.pools-badge--inactive {
  top: 5px;
  left: 5px;
  background: rgba(180, 0, 0, 0.75);
  color: #fff;
}

.pools-card-info {
  padding: 6px 8px 8px;
}
.pools-card-title {
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.pools-card-meta {
  font-size: 0.72rem;
  opacity: 0.6;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
