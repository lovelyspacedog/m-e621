<template>
  <v-fade-transition mode="out-in">
    <div v-if="pool" key="content">
      <v-card color="transparent" elevation="0" style="max-width: 50vw">
        <v-card-title class="pool-info-title">
          <div class="pool-info-name">{{ displayName }}</div>
          <div class="pool-info-meta text-caption">
            {{ pool.post_count }} Posts &bull; created by {{ pool.creator_name }}
            <span v-if="pool.category"> &bull; {{ pool.category }}</span>
            <span v-if="datesCaption"> &bull; {{ datesCaption }}</span>
          </div>
        </v-card-title>
        <v-card-text style="max-height: 20vh; overflow-y: auto">
          <DText :text="pool.description || 'No description'" />
        </v-card-text>
        <v-card-actions>
          <v-btn
            v-if="showBrowse"
            color="accent"
            variant="text"
            :to="{ name: 'Pool', params: { id: poolId }, query: browseQuery }"
          >
            Browse pool
          </v-btn>
          <v-btn
            color="accent"
            variant="text"
            :prepend-icon="watched ? 'mdi-eye' : 'mdi-eye-outline'"
            :disabled="!poolOrigin"
            @click="toggleWatch"
          >
            {{ watched ? "Unwatch pool" : "Watch pool" }}
          </v-btn>
          <v-btn color="accent" variant="text" :href="siteUrl" target="_blank" rel="noopener noreferrer">
            Open on site
          </v-btn>
        </v-card-actions>
      </v-card>
    </div>
    <div v-else-if="loading" key="loading">
      <AppLogo type="loader" />
    </div>
    <div v-else-if="error" key="error" class="text-medium-emphasis">
      {{ error }}
    </div>
  </v-fade-transition>
</template>

<script lang="ts">
import AppLogo from "@/App/AppLogo.vue";
import DText from "@/Parser/DText.vue";
import { useSiteModeStore, useWatchedPoolsStore } from "@/services";
import { useMainStore } from "@/services/state";
import type { PoolOriginMode } from "@/services/types";
import type { Pool } from "@/worker/api";
import { getApiService } from "@/worker/services";
import {
  isPoolOriginMode,
  poolChildForOrigin,
  poolRouteQuery,
  resolvePoolOrigin,
} from "@/misc/util/poolOrigin";
import { computed, defineComponent, onMounted, ref, watch, type PropType } from "vue";
import { useRoute } from "vue-router";

const formatDate = (value: Date | string | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default defineComponent({
  props: {
    poolId: {
      type: Number,
      required: true,
    },
    showBrowse: {
      type: Boolean,
      default: true,
    },
    /** Explicit origin (Federated). Falls back to route ?origin= then activeMode. */
    originMode: {
      type: String as PropType<PoolOriginMode | null>,
      default: null,
    },
  },
  emits: {
    loaded: (_pool: Pool) => true,
    error: (_message: string) => true,
  },
  setup(props, { emit }) {
    const route = useRoute();
    const main = useMainStore();
    const siteMode = useSiteModeStore();
    const watchedPools = useWatchedPoolsStore();
    const pool = ref<Pool>();
    const loading = ref(false);
    const error = ref<string | null>(null);

    const poolOrigin = computed((): PoolOriginMode | null => {
      if (isPoolOriginMode(props.originMode)) return props.originMode;
      return resolvePoolOrigin(route.query.origin, siteMode.activeMode);
    });

    const child = computed(() =>
      poolOrigin.value ? poolChildForOrigin(main.$state, poolOrigin.value) : null,
    );

    const displayName = computed(() => (pool.value?.name || "").replace(/_/g, " "));
    const siteUrl = computed(() => {
      const base = child.value?.baseUrl || "";
      const normalized = base.endsWith("/") ? base : `${base}/`;
      return `${normalized}pools/${props.poolId}`;
    });
    const browseQuery = computed(() => poolRouteQuery(poolOrigin.value));
    const watched = computed(() =>
      poolOrigin.value
        ? watchedPools.isWatched(poolOrigin.value, props.poolId)
        : false,
    );
    const toggleWatch = () => {
      if (!pool.value || !poolOrigin.value) return;
      watchedPools.toggle(poolOrigin.value, props.poolId, {
        postCount: pool.value.post_count || pool.value.post_ids?.length || 0,
        updatedAt: pool.value.updated_at,
      });
    };
    const datesCaption = computed(() => {
      if (!pool.value) return null;
      const created = formatDate(pool.value.created_at);
      const updated = formatDate(pool.value.updated_at);
      const parts: string[] = [];
      if (created) parts.push(`created ${created}`);
      if (updated && updated !== created) parts.push(`updated ${updated}`);
      return parts.length ? parts.join(" · ") : null;
    });

    const getInfo = async () => {
      try {
        loading.value = true;
        error.value = null;
        pool.value = undefined;
        const origin = poolOrigin.value;
        if (!origin || !child.value) {
          const message = siteMode.isUnified
            ? "Pool origin required — open from Federated Pools browse"
            : "Pools are not available in this site mode";
          error.value = message;
          emit("error", message);
          return;
        }
        const service = await getApiService();
        const result = await service.getPool({
          id: props.poolId,
          baseUrl: child.value.baseUrl,
          mode: origin,
          auth: child.value.auth,
        });
        pool.value = result;
        if (watchedPools.isWatched(origin, props.poolId)) {
          watchedPools.markSeen(origin, props.poolId, {
            postCount: result.post_count || result.post_ids?.length || 0,
            updatedAt: result.updated_at,
          });
        }
        emit("loaded", result);
      } catch (err: any) {
        const message = err?.message || String(err);
        error.value = message;
        emit("error", message);
      } finally {
        loading.value = false;
      }
    };

    onMounted(() => {
      getInfo();
    });
    watch(
      () => [props.poolId, props.originMode, route.query.origin, siteMode.activeMode] as const,
      () => {
        getInfo();
      },
    );

    return {
      pool,
      loading,
      error,
      displayName,
      siteUrl,
      datesCaption,
      watched,
      toggleWatch,
      poolOrigin,
      browseQuery,
    };
  },
  components: { DText, AppLogo },
});
</script>

<style scoped>
.pool-info-title {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  gap: 4px;
  white-space: normal;
}
.pool-info-name {
  line-height: 1.25;
  font-weight: 600;
}
.pool-info-meta {
  line-height: 1.35;
  opacity: 0.7;
  font-weight: 400;
  white-space: normal;
}
</style>
