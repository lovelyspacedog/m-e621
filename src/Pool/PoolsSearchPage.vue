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
          :cover-origin="defaultCoverOrigin"
          :show-origin-badges="isFederatedPools"
          :watched-ids="watchedIds"
          :new-counts="newCounts"
          @toggle-watch="toggleWatch"
        />
        <v-list v-if="unavailableWatched.length" class="mt-2" bg-color="transparent" density="compact">
          <v-list-item
            v-for="entry in unavailableWatched"
            :key="`${entry.originMode}:${entry.id}`"
            :title="`Pool ${entry.id}`"
            :subtitle="unavailableSubtitle(entry)"
          >
            <template #append>
              <v-btn
                icon
                size="small"
                variant="text"
                title="Unwatch pool"
                aria-label="Unwatch pool"
                @click="removeUnavailableWatch(entry)"
              >
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
        :cover-origin="defaultCoverOrigin"
        :show-origin-badges="isFederatedPools"
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
import PoolCollection, { type PoolListItem } from "@/Pool/PoolCollection.vue";
import { useRouterTagManager } from "@/Post/routerTagManager";
import {
  usePostsStore,
  useSiteModeStore,
  useSnackbarStore,
  useWatchedPoolsStore,
} from "@/services";
import { useMainStore } from "@/services/state";
import type { PoolOriginMode, PoolBrowseOrigin, WatchedPoolEntry } from "@/services/types";
import { BlacklistMode } from "@/services/types";
import { useRouterQueryHelpers } from "@/misc/util/utilities";
import {
  isPoolOriginMode,
  poolFamilyChildren,
  poolKey,
  sortPoolsByOrder,
  type PoolChildFetchArgs,
} from "@/misc/util/poolOrigin";
import { unifiedChildLabel } from "@/misc/util/postOrigin";
import {
  poolOrderToTailspaceSort,
  tailspaceComicCoverUrl,
  tailspaceComicToPoolListItem,
  tailspaceCoverKey,
} from "@/misc/util/tailspacePoolBrowse";
import { getComics } from "@/worker/tailspace/api";
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
const main = useMainStore();
const siteMode = useSiteModeStore();
const postsStore = usePostsStore();
const snackbar = useSnackbarStore();
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
/** Federated defaults to Updated so e621/e6ai results interleave by time. */
const defaultOrderForMode = (): PoolOrder =>
  siteMode.isUnified ? "updated_at" : "post_count";
const parseOrderOrDefault = (raw: unknown): PoolOrder => {
  if (raw == null || (Array.isArray(raw) && raw[0] == null)) {
    return defaultOrderForMode();
  }
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (ORDER_VALUES.includes(value as PoolOrder)) return value as PoolOrder;
  return defaultOrderForMode();
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
const order = ref<PoolOrder>(parseOrderOrDefault(route.query.order));
const category = ref<PoolCategoryFilter>(parseCategory(route.query.category));
const activeFilter = ref<ActiveFilter>(parseActive(route.query.active));
const searchMode = ref<SearchMode>(parseMode(route.query.mode));
const alsoDescriptions = ref(loadAlsoDescriptions());
const browseLayout = ref<BrowseLayout>(loadBrowseLayout());
const pools = ref<PoolListItem[]>([]);
const watchedPoolResults = ref<PoolListItem[]>([]);
const watchedLoading = ref(false);
const covers = ref<Record<string, string>>({});
const loading = ref(false);
const error = ref<string | null>(null);
const searched = ref(false);
const hasMore = ref(true);
const syncingFromRoute = ref(false);
/** Bumps on each browse fetch so overlapping resets cannot wipe results. */
let browseFetchGeneration = 0;
/** Bumps on each tags fetch so overlapping resets cannot wipe results. */
let tagsFetchGeneration = 0;

const childPage = ref<Partial<Record<PoolBrowseOrigin, number>>>({});
const childHasMore = ref<Partial<Record<PoolBrowseOrigin, boolean>>>({});

const isFederatedPools = computed(() => siteMode.isUnified);
const includeTailspaceComics = computed(
  () => isFederatedPools.value && siteMode.unifiedIncludeTailspaceComics,
);
const browseChildren = computed(() => poolFamilyChildren(main.$state));
const defaultCoverOrigin = computed(() => {
  if (isPoolOriginMode(siteMode.activeMode)) return siteMode.activeMode;
  return browseChildren.value[0]?.mode || "e621";
});

const watchedEntries = computed(() => {
  if (isFederatedPools.value) {
    const enabled = new Set(browseChildren.value.map((c) => c.mode));
    return watchedPoolStore.entries.filter((entry) => enabled.has(entry.originMode));
  }
  if (!isPoolOriginMode(siteMode.activeMode)) return [];
  return watchedPoolStore.entriesFor(siteMode.activeMode);
});

const watchedIds = computed(
  () => new Set(watchedEntries.value.map((entry) => poolKey(entry.originMode, entry.id))),
);

const newCounts = computed(() => {
  const out: Record<string, number> = {};
  for (const pool of [...watchedPoolResults.value, ...pools.value]) {
    const origin = pool.originMode;
    if (!origin || origin === "tailspace") continue;
    const n = watchedPoolStore.newCount(
      origin,
      pool.id,
      pool.post_count || 0,
      pool.updated_at,
    );
    if (n > 0) out[poolKey(origin, pool.id)] = n;
  }
  return out;
});

const unavailableWatched = computed(() => {
  if (watchedLoading.value) return [];
  const loaded = new Set(
    watchedPoolResults.value.map((pool) =>
      pool.originMode ? poolKey(pool.originMode, pool.id) : String(pool.id),
    ),
  );
  return watchedEntries.value.filter(
    (entry) => !loaded.has(poolKey(entry.originMode, entry.id)),
  );
});

const unavailableSubtitle = (entry: WatchedPoolEntry) =>
  isFederatedPools.value
    ? `${unifiedChildLabel(entry.originMode)} · Pool details are unavailable`
    : "Pool details are unavailable";

const queryText = () => (query.value || "").trim();
const creatorText = () => (creator.value || "").trim();
const browseLimit = () => postsStore.postListFetchLimit || 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One retry — concurrent e621/e6ai under COEP often throws "Failed to fetch". */
const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch {
    await sleep(150);
    return await fn();
  }
};

/**
 * Run child pool fetches one-at-a-time. Parallel fan-out to e621+e6ai
 * intermittently fails with TypeError "Failed to fetch" under COEP.
 */
const mapPoolChildrenSequential = async <T>(
  children: PoolChildFetchArgs[],
  mapper: (child: PoolChildFetchArgs, index: number) => Promise<T>,
): Promise<T[]> => {
  const out: T[] = [];
  for (let i = 0; i < children.length; i++) {
    if (i > 0) await sleep(75);
    out.push(await mapper(children[i], i));
  }
  return out;
};

const stampPools = (list: Pool[], origin: PoolOriginMode): PoolListItem[] =>
  list.map((pool) => ({ ...pool, originMode: origin }));

const mergePools = (
  lists: PoolListItem[][],
  existingKeys?: Set<string>,
): PoolListItem[] => {
  const seen = existingKeys ? new Set(existingKeys) : new Set<string>();
  const out: PoolListItem[] = [];
  for (const list of lists) {
    for (const pool of list) {
      const origin = pool.originMode;
      if (!origin) continue;
      const key = poolKey(origin, pool.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pool);
    }
  }
  // Federated (or any multi-origin merge): re-sort so sources interleave.
  if (isFederatedPools.value || new Set(out.map((p) => p.originMode)).size > 1) {
    return sortPoolsByOrder(out, order.value);
  }
  return out;
};

const existingPoolKeys = () =>
  new Set(
    pools.value
      .filter((p): p is PoolListItem & { originMode: PoolBrowseOrigin } => !!p.originMode)
      .map((p) => poolKey(p.originMode, p.id)),
  );

const sharedPoolArgsFor = (child: PoolChildFetchArgs) =>
  ({
    limit: browseLimit(),
    order: order.value,
    category: category.value === "all" ? undefined : category.value,
    isActive:
      activeFilter.value === "all" ? undefined : activeFilter.value === "active",
    creatorName: creatorText() || undefined,
    baseUrl: child.baseUrl,
    mode: child.mode,
    auth: child.auth,
  }) as const;

const resetChildPaging = (
  children: PoolChildFetchArgs[],
  opts?: { includeTailspace?: boolean },
) => {
  const pages: Partial<Record<PoolBrowseOrigin, number>> = {};
  const more: Partial<Record<PoolBrowseOrigin, boolean>> = {};
  for (const child of children) {
    pages[child.mode] = 1;
    more[child.mode] = true;
  }
  if (opts?.includeTailspace) {
    pages.tailspace = 1;
    more.tailspace = true;
  }
  childPage.value = pages;
  childHasMore.value = more;
};

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

  if (order.value !== defaultOrderForMode()) next.order = order.value;
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

const fetchCoversFor = async (list: PoolListItem[], child: PoolChildFetchArgs) => {
  const origin = child.mode;
  const coverKey = (id: number) => `${origin}:${id}`;
  const needed = new Set<number>();
  for (const pool of list) {
    if (pool.originMode && pool.originMode !== origin) continue;
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
    const next = { ...covers.value };
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      const slice = ids.slice(i, i + ID_BATCH);
      const { posts } = await service.getPosts({
        page: 1,
        limit: slice.length,
        tags: [`id:${slice.join(",")}`],
        blacklist: [],
        blacklistMode: BlacklistMode.hide,
        auth: child.auth,
        baseUrl: child.baseUrl,
        mode: child.mode,
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

const fetchCovers = async (list: PoolListItem[]) => {
  const byOrigin = new Map<PoolOriginMode, PoolListItem[]>();
  for (const pool of list) {
    if (!pool.originMode || pool.originMode === "tailspace") continue;
    const arr = byOrigin.get(pool.originMode) || [];
    arr.push(pool);
    byOrigin.set(pool.originMode, arr);
  }
  const children = browseChildren.value;
  for (const [origin, poolsForOrigin] of byOrigin.entries()) {
    const child =
      children.find((c) => c.mode === origin) ||
      poolFamilyChildren(main.$state).find((c) => c.mode === origin);
    if (!child) continue;
    await fetchCoversFor(poolsForOrigin, child);
  }
};

const hydratePoolsForChild = async (
  child: PoolChildFetchArgs,
  ids: number[],
): Promise<PoolListItem[]> => {
  if (!ids.length) return [];
  const service = await getApiService();
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  const out: Pool[] = [];
  for (let i = 0; i < unique.length; i += ID_BATCH) {
    const slice = unique.slice(i, i + ID_BATCH);
    try {
      const result = await withRetry(() =>
        service.getPools({
          ...sharedPoolArgsFor(child),
          limit: Math.max(slice.length, 1),
          page: 1,
          order: "post_count",
          category: undefined,
          isActive: undefined,
          creatorName: undefined,
          ids: slice,
        }),
      );
      if (Array.isArray(result)) out.push(...result);
    } catch {
      // Fall through — missing ids show as unavailable watches.
    }
  }
  return stampPools(out, child.mode);
};

const poolSnapshot = (pool: Pool) => ({
  postCount: pool.post_count || pool.post_ids?.length || 0,
  updatedAt: pool.updated_at,
});

const loadWatchedPools = async () => {
  watchedLoading.value = true;
  try {
    const children = browseChildren.value;
    const byChild = new Map<PoolOriginMode, number[]>();
    for (const entry of watchedEntries.value) {
      const list = byChild.get(entry.originMode) || [];
      list.push(entry.id);
      byChild.set(entry.originMode, list);
    }
    const hydrated: PoolListItem[] = [];
    await mapPoolChildrenSequential(children, async (child) => {
      const ids = byChild.get(child.mode) || [];
      if (!ids.length) return;
      hydrated.push(...(await hydratePoolsForChild(child, ids)));
    });
    const byKey = new Map(
      hydrated.map((pool) => [poolKey(pool.originMode!, pool.id), pool]),
    );
    watchedPoolResults.value = watchedEntries.value
      .map((entry) => byKey.get(poolKey(entry.originMode, entry.id)))
      .filter((pool): pool is PoolListItem => !!pool);
    for (const pool of watchedPoolResults.value) {
      if (!pool.originMode) continue;
      watchedPoolStore.ensureBaseline(pool.originMode, pool.id, poolSnapshot(pool));
    }
    watchedPoolResults.value = [...watchedPoolResults.value].sort((a, b) => {
      const delta =
        watchedPoolStore.newCount(
          b.originMode!,
          b.id,
          b.post_count || 0,
          b.updated_at,
        ) -
        watchedPoolStore.newCount(
          a.originMode!,
          a.id,
          a.post_count || 0,
          a.updated_at,
        );
      if (delta) return delta;
      return 0;
    });
    void fetchCovers(watchedPoolResults.value);
  } finally {
    watchedLoading.value = false;
  }
};

const toggleWatch = (pool: PoolListItem) => {
  const origin = pool.originMode;
  if (!origin || origin === "tailspace") return;
  const watched = watchedPoolStore.toggle(origin, pool.id, poolSnapshot(pool));
  if (watched) {
    watchedPoolResults.value = [
      pool,
      ...watchedPoolResults.value.filter(
        (item) => !(item.originMode === origin && item.id === pool.id),
      ),
    ];
    void fetchCovers([pool]);
  } else {
    watchedPoolResults.value = watchedPoolResults.value.filter(
      (item) => !(item.originMode === origin && item.id === pool.id),
    );
  }
};

const removeUnavailableWatch = (entry: WatchedPoolEntry) => {
  watchedPoolStore.remove(entry.originMode, entry.id);
};

const fetchNamePageForChild = async (
  child: PoolChildFetchArgs,
  pageNumber: number,
): Promise<{ list: PoolListItem[]; hasMore: boolean }> => {
  const service = await getApiService();
  const q = queryText();
  const limit = browseLimit();
  const shared = {
    ...sharedPoolArgsFor(child),
    limit,
    page: pageNumber,
  };

  if (q && alsoDescriptions.value) {
    const byName = await withRetry(() =>
      service.getPools({ ...shared, query: `*${q}*` }),
    );
    await sleep(75);
    const byDesc = await withRetry(() =>
      service.getPools({
        ...shared,
        descriptionMatches: `*${q}*`,
      }),
    );
    const nameList = stampPools(Array.isArray(byName) ? byName : [], child.mode);
    const descList = stampPools(Array.isArray(byDesc) ? byDesc : [], child.mode);
    return {
      list: mergePools([nameList, descList]),
      hasMore: nameList.length >= limit || descList.length >= limit,
    };
  }
  if (q) {
    const result = await withRetry(() =>
      service.getPools({ ...shared, query: `*${q}*` }),
    );
    const list = stampPools(Array.isArray(result) ? result : [], child.mode);
    return { list, hasMore: list.length >= limit };
  }
  const result = await withRetry(() => service.getPools(shared));
  const list = stampPools(Array.isArray(result) ? result : [], child.mode);
  return { list, hasMore: list.length >= limit };
};

const fetchTailspaceComicsPage = async (
  pageNumber: number,
): Promise<{ list: PoolListItem[]; hasMore: boolean; covers: Record<string, string> }> => {
  const result = await getComics({
    page: pageNumber,
    search: queryText() || undefined,
    sort: poolOrderToTailspaceSort(order.value),
  });
  const comics = Array.isArray(result?.comics) ? result.comics : [];
  const list = comics.map(tailspaceComicToPoolListItem);
  const covers: Record<string, string> = {};
  for (const comic of comics) {
    covers[tailspaceCoverKey(comic.id)] = tailspaceComicCoverUrl(comic);
  }
  const totalPages = Math.max(1, Number(result?.numberOfPages) || 1);
  return { list, hasMore: pageNumber < totalPages, covers };
};

const fetchPoolsByName = async (append: boolean) => {
  const generation = ++browseFetchGeneration;
  loading.value = true;
  error.value = null;
  try {
    const children = browseChildren.value;
    const withTailspace = includeTailspaceComics.value;
    if (!children.length && !withTailspace) {
      error.value =
        "No e621, e6ai, or Tailspace comics sources — enable sites in Federated Account settings";
      if (!append) pools.value = [];
      hasMore.value = false;
      searched.value = true;
      return;
    }
    if (!append) resetChildPaging(children, { includeTailspace: withTailspace });

    const results = await mapPoolChildrenSequential(children, async (child) => {
      if (append && childHasMore.value[child.mode] === false) {
        return { child, list: [] as PoolListItem[], hasMore: false, failed: false };
      }
      const pageNumber = append
        ? (childPage.value[child.mode] || 1) + 1
        : 1;
      try {
        const result = await withRetry(() =>
          fetchNamePageForChild(child, pageNumber),
        );
        return {
          child,
          list: result.list,
          hasMore: result.hasMore,
          failed: false,
          pageNumber,
        };
      } catch (err: any) {
        snackbar.addMessage(
          `${unifiedChildLabel(child.mode)} skipped: ${err?.message || String(err)}`,
        );
        return {
          child,
          list: [] as PoolListItem[],
          hasMore: false,
          failed: true,
          pageNumber,
        };
      }
    });
    if (generation !== browseFetchGeneration) return;

    const pages = { ...childPage.value };
    const more = { ...childHasMore.value };
    const lists: PoolListItem[][] = [];
    let tailspaceCovers: Record<string, string> = {};
    for (const result of results) {
      if (result.failed) {
        more[result.child.mode] = false;
        continue;
      }
      pages[result.child.mode] = result.pageNumber!;
      more[result.child.mode] = result.hasMore;
      lists.push(result.list);
    }

    if (withTailspace) {
      if (!(append && more.tailspace === false)) {
        const pageNumber = append ? (pages.tailspace || 1) + 1 : 1;
        try {
          if (children.length) await sleep(75);
          const ts = await withRetry(() => fetchTailspaceComicsPage(pageNumber));
          pages.tailspace = pageNumber;
          more.tailspace = ts.hasMore;
          lists.push(ts.list);
          tailspaceCovers = ts.covers;
        } catch (err: any) {
          snackbar.addMessage(
            `Tailspace skipped: ${err?.message || String(err)}`,
          );
          more.tailspace = false;
        }
      }
    }

    childPage.value = pages;
    childHasMore.value = more;

    const merged = mergePools(lists, append ? existingPoolKeys() : undefined);
    const next = append ? [...pools.value, ...merged] : merged;
    pools.value =
      isFederatedPools.value || new Set(next.map((p) => p.originMode)).size > 1
        ? sortPoolsByOrder(next, order.value)
        : next;
    if (!append) covers.value = {};
    if (Object.keys(tailspaceCovers).length) {
      covers.value = { ...covers.value, ...tailspaceCovers };
    }
    hasMore.value = Object.values(more).some(Boolean);
    searched.value = true;
    void fetchCovers(merged);
  } catch (err: any) {
    if (generation !== browseFetchGeneration) return;
    error.value = err?.message || String(err);
    if (!append) pools.value = [];
  } finally {
    if (generation === browseFetchGeneration) loading.value = false;
  }
};

const fetchPoolsByTags = async (append: boolean) => {
  const generation = ++tagsFetchGeneration;

  if (!tags.value.length) {
    if (generation !== tagsFetchGeneration) return;
    pools.value = [];
    covers.value = {};
    hasMore.value = false;
    searched.value = true;
    error.value = null;
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    const children = browseChildren.value;
    if (!children.length) {
      if (generation !== tagsFetchGeneration) return;
      error.value =
        "No e621 or e6ai sites enabled — turn them on in Federated Account settings";
      if (!append) pools.value = [];
      hasMore.value = false;
      searched.value = true;
      return;
    }
    if (!append) resetChildPaging(children);

    const service = await getApiService();
    const limit = browseLimit();
    const results = await mapPoolChildrenSequential(children, async (child) => {
      if (append && childHasMore.value[child.mode] === false) {
        return { child, list: [] as PoolListItem[], hasMore: false, failed: false };
      }
      const pageNumber = append
        ? (childPage.value[child.mode] || 1) + 1
        : 1;
      try {
        const result = await withRetry(() =>
          service.getPools({
            ...sharedPoolArgsFor(child),
            limit,
            page: pageNumber,
            postTagsMatch: toRaw(tags.value).join(" "),
          }),
        );
        const list = stampPools(Array.isArray(result) ? result : [], child.mode);
        return {
          child,
          list,
          hasMore: list.length >= limit,
          failed: false,
          pageNumber,
        };
      } catch (err: any) {
        snackbar.addMessage(
          `${unifiedChildLabel(child.mode)} skipped: ${err?.message || String(err)}`,
        );
        return {
          child,
          list: [] as PoolListItem[],
          hasMore: false,
          failed: true,
          pageNumber,
        };
      }
    });
    if (generation !== tagsFetchGeneration) return;

    const pages = { ...childPage.value };
    const more = { ...childHasMore.value };
    const lists: PoolListItem[][] = [];
    for (const result of results) {
      if (result.failed) {
        more[result.child.mode] = false;
        continue;
      }
      pages[result.child.mode] = result.pageNumber!;
      more[result.child.mode] = result.hasMore;
      lists.push(result.list);
    }
    childPage.value = pages;
    childHasMore.value = more;

    const merged = mergePools(lists, append ? existingPoolKeys() : undefined);
    const next = append ? [...pools.value, ...merged] : merged;
    pools.value =
      isFederatedPools.value || new Set(next.map((p) => p.originMode)).size > 1
        ? sortPoolsByOrder(next, order.value)
        : next;
    if (!append) covers.value = {};
    hasMore.value = Object.values(more).some(Boolean);
    searched.value = true;
    void fetchCovers(merged);
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
  if (searchMode.value === "tags") void fetchPoolsByTags(false);
  else void fetchPoolsByName(false);
};

const runTagSearch = async () => {
  syncingFromRoute.value = true;
  try {
    await updateRouterQuery({ tags: tags.value.join(" ") });
    await syncQueryToRoute();
  } finally {
    syncingFromRoute.value = false;
  }
  void fetchPoolsByTags(false);
};

const loadMore = () => {
  if (!hasMore.value || loading.value) return;
  if (searchMode.value === "tags") {
    void fetchPoolsByTags(true);
  } else {
    void fetchPoolsByName(true);
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
    const nextOrder = parseOrderOrDefault(o);
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
    if (nextMode === "tags") void fetchPoolsByTags(false);
    else void fetchPoolsByName(false);
  },
);

watch(
  () => route.query.tags,
  () => {
    if (syncingFromRoute.value) return;
    if (searchMode.value !== "tags") return;
    void fetchPoolsByTags(false);
  },
);

const reloadPoolsForMode = async () => {
  await loadWatchedPools();
  if (searchMode.value === "tags") await fetchPoolsByTags(false);
  else await fetchPoolsByName(false);
};

onMounted(() => {
  void reloadPoolsForMode();
});

// Watch sources separately so a new array identity does not re-fire every tick.
watch(
  [
    () => siteMode.activeMode,
    () => JSON.stringify(siteMode.unifiedSites),
    () => siteMode.unifiedIncludeTailspaceComics,
  ],
  () => {
    // Apply Federated default sort when the URL has no explicit order.
    if (route.query.order == null) {
      order.value = defaultOrderForMode();
    }
    watchedPoolResults.value = [];
    void reloadPoolsForMode();
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
