<template>
  <div>
    <portal to="toolbar">
      <div class="pools-toolbar">
        <v-text-field
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
        <v-btn icon :loading="loading" @click="runSearch">
          <v-icon>mdi-magnify</v-icon>
        </v-btn>
      </div>
    </portal>

    <v-container>
      <div v-if="error" class="text-medium-emphasis mb-4">{{ error }}</div>
      <div v-else-if="loading && !pools.length" class="text-center py-8">
        <v-progress-circular indeterminate color="accent" />
      </div>
      <div v-else-if="!pools.length && searched" class="text-medium-emphasis">
        No pools found
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
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import { debounce } from "lodash";
import type { Pool } from "@/worker/api";
import {
  useAccountStore,
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

const route = useRoute();
const urlStore = useUrlStore();
const siteMode = useSiteModeStore();
const postsStore = usePostsStore();
const account = useAccountStore();
const { updateRouterQuery, removeRouterQuery } = useRouterQueryHelpers();

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

const query = ref<string | null>(parseQuery(route.query.q));
const order = ref<PoolOrder>(parseOrder(route.query.order));
const category = ref<PoolCategoryFilter>(parseCategory(route.query.category));
const pools = ref<Pool[]>([]);
const covers = ref<Record<number, string>>({});
const loading = ref(false);
const error = ref<string | null>(null);
const searched = ref(false);
const page = ref(1);
const hasMore = ref(true);
const syncingFromRoute = ref(false);

const displayName = (name: string) => name.replace(/_/g, " ");
const coverUrl = (pool: Pool) => {
  const firstId = pool.post_ids?.[0];
  return firstId ? covers.value[firstId] || null : null;
};
const queryText = () => (query.value || "").trim();

const syncQueryToRoute = async () => {
  const next: { q?: string; order?: string; category?: string } = {};
  const q = queryText();
  if (q) next.q = q;
  if (order.value !== "post_count") next.order = order.value;
  if (category.value !== "all") next.category = category.value;

  const keysToRemove: string[] = [];
  if (!q) keysToRemove.push("q");
  if (order.value === "post_count") keysToRemove.push("order");
  if (category.value === "all") keysToRemove.push("category");

  if (Object.keys(next).length) {
    await updateRouterQuery(next);
  }
  if (keysToRemove.length) {
    await removeRouterQuery(keysToRemove);
  }
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
      auth: account.auth,
      baseUrl: urlStore.e621Url,
      mode: siteMode.activeMode,
    });
    const next = { ...covers.value };
    for (const post of posts) {
      const url = post.preview?.url || post.sample?.url;
      if (url) next[post.id] = url;
    }
    covers.value = next;
  } catch {
    // Soft-fail: list stays usable without covers.
  }
};

const fetchPools = async (pageNumber: number, append: boolean) => {
  loading.value = true;
  error.value = null;
  try {
    const service = await getApiService();
    const q = queryText();
    const limit = postsStore.postListFetchLimit || 40;
    const result = await service.getPools({
      limit,
      page: pageNumber,
      order: order.value,
      query: q ? `*${q}*` : undefined,
      category: category.value === "all" ? undefined : category.value,
      baseUrl: urlStore.e621Url,
      mode: siteMode.activeMode,
    });
    const list = Array.isArray(result) ? result : [];
    pools.value = append ? [...pools.value, ...list] : list;
    if (!append) covers.value = {};
    hasMore.value = list.length >= limit;
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

const runSearch = () => {
  void syncQueryToRoute();
  void fetchPools(1, false);
};

const loadMore = () => {
  if (!hasMore.value || loading.value) return;
  void fetchPools(page.value + 1, true);
};

const debouncedSearch = debounce(() => runSearch(), 400);

watch(query, () => {
  if (syncingFromRoute.value) return;
  debouncedSearch();
});

watch([order, category], () => {
  if (syncingFromRoute.value) return;
  runSearch();
});

watch(
  () => [route.query.q, route.query.order, route.query.category] as const,
  ([q, o, c]) => {
    const nextQuery = parseQuery(q);
    const nextOrder = parseOrder(o);
    const nextCategory = parseCategory(c);
    if (
      nextQuery === query.value &&
      nextOrder === order.value &&
      nextCategory === category.value
    ) {
      return;
    }
    syncingFromRoute.value = true;
    query.value = nextQuery;
    order.value = nextOrder;
    category.value = nextCategory;
    syncingFromRoute.value = false;
    void fetchPools(1, false);
  },
);

onMounted(() => {
  void fetchPools(1, false);
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
</style>
