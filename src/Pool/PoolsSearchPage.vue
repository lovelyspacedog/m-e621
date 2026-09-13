<template>
  <div>
    <portal to="toolbar">
      <div style="display: flex; align-items: center; flex-grow: 999; gap: 8px;">
        <v-text-field
          v-model="query"
          class="flex-grow-1"
          density="compact"
          hide-details
          clearable
          label="Search pools"
          prepend-inner-icon="mdi-magnify"
          variant="solo"
          @keyup.enter="runSearch"
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
          class="mb-1"
        >
          <v-list-item-title>{{ displayName(pool.name) }}</v-list-item-title>
          <v-list-item-subtitle>
            {{ pool.post_count }} posts · {{ pool.creator_name }}
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
import { useHead } from "@unhead/vue";
import { debounce } from "lodash";
import type { Pool } from "@/worker/api";
import { usePostsStore, useUrlStore } from "@/services";
import { getApiService } from "@/worker/services";

useHead({ title: "Pools" });

const urlStore = useUrlStore();
const postsStore = usePostsStore();

const query = ref("");
const pools = ref<Pool[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searched = ref(false);
const page = ref(1);
const hasMore = ref(true);

const displayName = (name: string) => name.replace(/_/g, " ");

const fetchPools = async (pageNumber: number, append: boolean) => {
  loading.value = true;
  error.value = null;
  try {
    const service = await getApiService();
    const q = query.value.trim();
    const result = await service.getPools({
      limit: postsStore.postListFetchLimit || 40,
      page: pageNumber,
      order: "post_count",
      query: q ? `*${q}*` : undefined,
      baseUrl: urlStore.e621Url,
    });
    const list = Array.isArray(result) ? result : [];
    pools.value = append ? [...pools.value, ...list] : list;
    hasMore.value = list.length > 0;
    searched.value = true;
    page.value = pageNumber;
  } catch (err: any) {
    error.value = err?.message || String(err);
    if (!append) pools.value = [];
  } finally {
    loading.value = false;
  }
};

const runSearch = () => {
  void fetchPools(1, false);
};

const loadMore = () => {
  if (!hasMore.value || loading.value) return;
  void fetchPools(page.value + 1, true);
};

const debouncedSearch = debounce(() => runSearch(), 400);

watch(query, () => {
  debouncedSearch();
});

onMounted(() => {
  runSearch();
});
</script>
