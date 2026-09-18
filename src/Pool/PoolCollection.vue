<template>
  <div v-if="layout === 'grid'" class="pools-grid">
    <div v-for="pool in pools" :key="poolRowKey(pool)" class="pools-card">
      <router-link class="pools-card-link" :to="poolLink(pool)" :title="displayName(pool.name)">
        <div
          class="pools-card-thumb"
          :class="{ 'pools-cover--pulse': coverShowLoading(pool) }"
          :ref="(el) => observeCoverHost(el, poolRowKey(pool))"
        >
          <img
            v-if="activeCoverSrc(pool) && !coverImgFailed(activeCoverSrc(pool)!)"
            class="pools-card-img"
            :class="{ 'pools-card-img--loading': !coverImgReady(activeCoverSrc(pool)!) }"
            :src="activeCoverSrc(pool)!"
            :alt="displayName(pool.name)"
            decoding="async"
            :ref="(el) => syncCoverImg(el, activeCoverSrc(pool)!, poolRowKey(pool))"
            @load="onCoverLoad(activeCoverSrc(pool)!, poolRowKey(pool))"
            @error="onCoverError(activeCoverSrc(pool)!, poolRowKey(pool))"
          />
          <div v-if="coverShowMissing(pool)" class="pools-card-placeholder">
            <v-icon size="36" class="text-medium-emphasis"> mdi-image-off-outline </v-icon>
          </div>
          <div class="pools-badge pools-badge--pages">
            <v-icon size="12">mdi-image-multiple</v-icon>
            {{ pageCountLabel(pool) }}
          </div>
          <div v-if="pool.category" class="pools-badge pools-badge--cat">
            {{ pool.category }}
          </div>
          <div v-if="!pool.is_active" class="pools-badge pools-badge--inactive">inactive</div>
          <div v-if="newCount(pool) > 0" class="pools-badge pools-badge--new">
            +{{ newCount(pool) }}
          </div>
          <div v-if="showOrigin(pool)" class="pools-badge pools-badge--origin" :title="originLabel(pool)">
            <v-icon size="14">{{ originIcon(pool) }}</v-icon>
          </div>
        </div>
        <div class="pools-card-info">
          <div class="pools-card-title">{{ displayName(pool.name) }}</div>
          <div class="pools-card-meta">
            {{ pool.creator_name }}
            <span v-if="updatedLabel(pool)"> · {{ updatedLabel(pool) }}</span>
          </div>
        </div>
      </router-link>
      <v-btn
        v-if="canWatch(pool)"
        class="pool-watch-button"
        icon
        size="x-small"
        variant="tonal"
        :color="isWatched(pool) ? 'accent' : undefined"
        :title="isWatched(pool) ? 'Unwatch pool' : 'Watch pool'"
        :aria-label="isWatched(pool) ? 'Unwatch pool' : 'Watch pool'"
        @click="$emit('toggle-watch', pool)"
      >
        <v-icon size="18">
          {{ isWatched(pool) ? "mdi-eye" : "mdi-eye-outline" }}
        </v-icon>
      </v-btn>
    </div>
  </div>

  <v-list v-else bg-color="transparent">
    <v-list-item
      v-for="pool in pools"
      :key="poolRowKey(pool)"
      :to="poolLink(pool)"
      rounded="lg"
      class="mb-1 pool-row"
    >
      <template #prepend>
        <div
          class="pool-cover"
          :class="{ 'pools-cover--pulse': coverShowLoading(pool) }"
          :ref="(el) => observeCoverHost(el, poolRowKey(pool))"
        >
          <img
            v-if="activeCoverSrc(pool) && !coverImgFailed(activeCoverSrc(pool)!)"
            :src="activeCoverSrc(pool)!"
            :alt="displayName(pool.name)"
            class="pool-cover-img"
            :class="{ 'pool-cover-img--loading': !coverImgReady(activeCoverSrc(pool)!) }"
            decoding="async"
            :ref="(el) => syncCoverImg(el, activeCoverSrc(pool)!, poolRowKey(pool))"
            @load="onCoverLoad(activeCoverSrc(pool)!, poolRowKey(pool))"
            @error="onCoverError(activeCoverSrc(pool)!, poolRowKey(pool))"
          />
          <v-icon v-else-if="coverShowMissing(pool)" size="32" class="text-medium-emphasis">
            mdi-image-off-outline
          </v-icon>
        </div>
      </template>
      <v-list-item-title>
        <v-icon v-if="showOrigin(pool)" size="16" class="mr-1" :title="originLabel(pool)">
          {{ originIcon(pool) }}
        </v-icon>
        {{ displayName(pool.name) }}
      </v-list-item-title>
      <v-list-item-subtitle>
        {{ pageCountLabel(pool) }} {{ countNoun(pool) }} · {{ pool.creator_name }}
        <span v-if="updatedLabel(pool)"> · {{ updatedLabel(pool) }}</span>
        <span v-if="pool.category"> · {{ pool.category }}</span>
        <span v-if="!pool.is_active"> · inactive</span>
        <span v-if="newCount(pool) > 0"> · +{{ newCount(pool) }} new</span>
      </v-list-item-subtitle>
      <template #append>
        <v-chip
          v-if="newCount(pool) > 0"
          class="mr-1"
          size="x-small"
          color="accent"
          variant="flat"
          label
        >
          +{{ newCount(pool) }}
        </v-chip>
        <v-btn
          v-if="canWatch(pool)"
          icon
          size="small"
          variant="text"
          :color="isWatched(pool) ? 'accent' : undefined"
          :title="isWatched(pool) ? 'Unwatch pool' : 'Watch pool'"
          :aria-label="isWatched(pool) ? 'Unwatch pool' : 'Watch pool'"
          @click.prevent.stop="$emit('toggle-watch', pool)"
        >
          <v-icon>
            {{ isWatched(pool) ? "mdi-eye" : "mdi-eye-outline" }}
          </v-icon>
        </v-btn>
      </template>
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive } from "vue";
import type { Pool } from "@/worker/api";
import type { PoolBrowseOrigin, PoolOriginMode } from "@/services/types";
import { poolKey, poolRouteQuery } from "@/misc/util/poolOrigin";
import { unifiedChildIcon, unifiedChildLabel } from "@/misc/util/postOrigin";
import { isTailspacePoolItem } from "@/misc/util/tailspacePoolBrowse";
import { proxyDownloadUrl } from "@/misc/util/mediaProxy";

export type PoolListItem = Pool & {
  originMode?: PoolBrowseOrigin;
  /** Tailspace comic slug when originMode is tailspace. */
  comicName?: string;
};

/** Cap simultaneous cover image downloads across the visible grid. */
const MAX_COVER_DOWNLOADS = 6;

const props = defineProps<{
  pools: PoolListItem[];
  layout: "grid" | "list";
  /** Keys are `${originMode}:${postId}` (or bare id string for legacy). */
  covers: Record<string, string>;
  /** Watched keys: `${originMode}:${id}` preferred; bare numeric id also accepted. */
  watchedIds: Set<string | number>;
  /** `${originMode}:${id}` or bare id → new posts since last seen */
  newCounts?: Record<string, number>;
  /** Fallback origin when pool.originMode is missing (single-site browse). */
  coverOrigin?: string;
  /** Show origin chips (Federated browse). */
  showOriginBadges?: boolean;
  /** Pool row keys still waiting on cover URL resolution. */
  coversPending?: Set<string>;
}>();

defineEmits<{
  "toggle-watch": [pool: PoolListItem];
}>();

const resolvedOrigin = (pool: PoolListItem): string =>
  pool.originMode || props.coverOrigin || "";

const poolRowKey = (pool: PoolListItem) =>
  pool.originMode ? poolKey(pool.originMode, pool.id) : String(pool.id);

const poolLink = (pool: PoolListItem) => {
  if (isTailspacePoolItem(pool) || pool.originMode === "tailspace") {
    const name = pool.comicName || pool.name;
    return {
      name: "TailspaceComic" as const,
      params: { name },
    };
  }
  return {
    name: "Pool" as const,
    params: { id: pool.id },
    query: poolRouteQuery(
      (pool.originMode ?? props.coverOrigin) as PoolOriginMode | undefined,
    ),
  };
};

const canWatch = (pool: PoolListItem) => {
  void pool;
  return true;
};

const countNoun = (pool: PoolListItem) =>
  pool.originMode === "tailspace" ? "pages" : "posts";

const displayName = (name: string) => name.replace(/_/g, " ");
const coverLookupKey = (origin: string, id: number) =>
  origin ? `${origin}:${id}` : String(id);
const coverUrl = (pool: PoolListItem) => {
  const origin = resolvedOrigin(pool);
  let raw: string | null = null;
  if (origin === "tailspace") {
    raw = props.covers[coverLookupKey(origin, pool.id)] || null;
  } else {
    for (const id of pool.post_ids || []) {
      if (typeof id !== "number" || id <= 0) continue;
      const keyed = props.covers[coverLookupKey(origin, id)];
      if (keyed) {
        raw = keyed;
        break;
      }
      if (props.covers[String(id)]) {
        raw = props.covers[String(id)];
        break;
      }
    }
  }
  return raw ? proxyDownloadUrl(raw) || raw : null;
};

const coverImgReadyMap = reactive<Record<string, boolean>>({});
const coverImgFailedMap = reactive<Record<string, boolean>>({});
/** Pool keys that have entered (or are near) the viewport. */
const nearViewport = reactive<Record<string, boolean>>({});
/** Pool keys allowed to set <img src> (concurrency-gated). */
const downloadAllowed = reactive<Record<string, boolean>>({});

const coverImgReady = (url: string) => !!coverImgReadyMap[url];
const coverImgFailed = (url: string) => !!coverImgFailedMap[url];

const downloadQueue: string[] = [];
const downloadInFlight = new Set<string>();

const pumpCoverDownloads = () => {
  while (downloadInFlight.size < MAX_COVER_DOWNLOADS && downloadQueue.length) {
    const key = downloadQueue.shift()!;
    if (downloadAllowed[key] || downloadInFlight.has(key)) continue;
    downloadInFlight.add(key);
    downloadAllowed[key] = true;
  }
};

const enqueueCoverDownload = (key: string) => {
  if (downloadAllowed[key] || downloadInFlight.has(key) || downloadQueue.includes(key)) {
    return;
  }
  downloadQueue.push(key);
  pumpCoverDownloads();
};

const releaseCoverDownload = (key: string) => {
  if (!downloadInFlight.has(key)) return;
  downloadInFlight.delete(key);
  pumpCoverDownloads();
};

const onCoverLoad = (url: string, poolKeyStr: string) => {
  coverImgReadyMap[url] = true;
  coverImgFailedMap[url] = false;
  releaseCoverDownload(poolKeyStr);
};
const onCoverError = (url: string, poolKeyStr: string) => {
  coverImgReadyMap[url] = false;
  coverImgFailedMap[url] = true;
  releaseCoverDownload(poolKeyStr);
};

/** Cached images may already be complete before @load fires. */
const syncCoverImg = (el: unknown, url: string, poolKeyStr: string) => {
  if (!(el instanceof HTMLImageElement) || !url) return;
  if (!el.complete) return;
  if (el.naturalWidth > 0) onCoverLoad(url, poolKeyStr);
  else onCoverError(url, poolKeyStr);
};

const observedEls = new WeakMap<Element, string>();
let coverObserver: IntersectionObserver | null = null;

const ensureCoverObserver = () => {
  if (coverObserver) return coverObserver;
  if (typeof IntersectionObserver === "undefined") return null;
  coverObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const key = observedEls.get(entry.target);
        if (!key) continue;
        nearViewport[key] = true;
        coverObserver?.unobserve(entry.target);
      }
    },
    { rootMargin: "280px 0px", threshold: 0.01 },
  );
  return coverObserver;
};

const observeCoverHost = (el: unknown, key: string) => {
  if (!(el instanceof Element)) return;
  if (nearViewport[key]) return;
  const obs = ensureCoverObserver();
  if (!obs) {
    nearViewport[key] = true;
    return;
  }
  if (observedEls.get(el) === key) return;
  observedEls.set(el, key);
  obs.observe(el);
};

onBeforeUnmount(() => {
  coverObserver?.disconnect();
  coverObserver = null;
});

/**
 * Only attach src for near-viewport cards, and only up to MAX_COVER_DOWNLOADS
 * simultaneous downloads so a full watched grid does not stampede the network/GPU.
 */
const activeCoverSrc = (pool: PoolListItem) => {
  const key = poolRowKey(pool);
  if (!nearViewport[key]) return null;
  const url = coverUrl(pool);
  if (!url) return null;
  if (coverImgReady(url) || coverImgFailed(url)) return url;
  if (!downloadAllowed[key]) {
    enqueueCoverDownload(key);
    return null;
  }
  return url;
};

const coverIsPending = (pool: PoolListItem) =>
  !!props.coversPending?.has(poolRowKey(pool));

const coverShowLoading = (pool: PoolListItem) => {
  const key = poolRowKey(pool);
  if (!nearViewport[key]) return false;
  const url = coverUrl(pool);
  if (url) {
    if (coverImgReady(url) || coverImgFailed(url)) return false;
    return true;
  }
  return coverIsPending(pool);
};

const coverShowMissing = (pool: PoolListItem) => {
  const key = poolRowKey(pool);
  const url = coverUrl(pool);
  if (url) {
    if (!nearViewport[key]) return false;
    return coverImgFailed(url);
  }
  return !coverIsPending(pool);
};

const watchKey = (pool: PoolListItem) =>
  pool.originMode ? poolKey(pool.originMode, pool.id) : String(pool.id);
const isWatched = (pool: PoolListItem) =>
  props.watchedIds.has(watchKey(pool)) || props.watchedIds.has(pool.id);
const newCount = (pool: PoolListItem) =>
  props.newCounts?.[watchKey(pool)] || props.newCounts?.[String(pool.id)] || 0;
const showOrigin = (pool: PoolListItem) =>
  !!props.showOriginBadges && !!pool.originMode;
const originLabel = (pool: PoolListItem) =>
  pool.originMode ? unifiedChildLabel(pool.originMode) : "";
const originIcon = (pool: PoolListItem) =>
  pool.originMode ? unifiedChildIcon(pool.originMode) : "mdi-paw";
const updatedLabel = (pool: PoolListItem) => {
  const raw = pool.updated_at;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  const ms = date.getTime();
  // Furbooru gallery list stubs use epoch until the reader hydrates membership.
  if (Number.isNaN(ms) || ms <= 0) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};
/** Gallery list JSON has no image_count — show em dash until the reader fills it. */
const pageCountLabel = (pool: PoolListItem) => {
  const n = pool.post_count || 0;
  if (n > 0) return String(n);
  if (pool.originMode === "furbooru") return "—";
  return String(n);
};
</script>

<style scoped>
.pool-row :deep(.v-list-item__prepend) {
  margin-inline-end: 12px;
}
.pool-cover {
  position: relative;
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
.pool-cover-img--loading {
  opacity: 0;
  position: absolute;
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
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(var(--v-theme-surface-variant), 0.4);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}
.pools-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.pools-card-link {
  display: block;
  text-decoration: none;
  color: inherit;
}
.pool-watch-button {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
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
.pools-card-img--loading {
  opacity: 0;
  position: absolute;
  inset: 0;
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
/* Lightweight CSS pulse — avoids N× Vuetify progress-circular SVG animations. */
.pools-cover--pulse::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    110deg,
    transparent 30%,
    rgba(255, 255, 255, 0.08) 45%,
    rgba(255, 255, 255, 0.14) 50%,
    rgba(255, 255, 255, 0.08) 55%,
    transparent 70%
  );
  background-size: 200% 100%;
  animation: pools-cover-shimmer 1.35s ease-in-out infinite;
}
@keyframes pools-cover-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pools-cover--pulse::after {
    animation: none;
    background: rgba(255, 255, 255, 0.06);
  }
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
  top: 34px;
  left: 5px;
  background: rgba(180, 0, 0, 0.75);
  color: #fff;
}
.pools-badge--new {
  bottom: 5px;
  left: 5px;
  background: rgb(var(--v-theme-accent));
  color: rgb(var(--v-theme-on-accent));
}
.pools-badge--origin {
  top: 5px;
  left: 36px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 3px;
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
