<template>
  <div v-if="layout === 'grid'" class="pools-grid">
    <div v-for="pool in pools" :key="pool.id" class="pools-card">
      <router-link class="pools-card-link" :to="{ name: 'Pool', params: { id: pool.id } }" :title="displayName(pool.name)">
        <div class="pools-card-thumb">
          <img v-if="coverUrl(pool)" class="pools-card-img" :src="coverUrl(pool)!" :alt="displayName(pool.name)" loading="lazy" />
          <div v-else class="pools-card-placeholder">
            <v-icon size="36" class="text-medium-emphasis"> mdi-image-off-outline </v-icon>
          </div>
          <div class="pools-badge pools-badge--pages">
            <v-icon size="12">mdi-image-multiple</v-icon>
            {{ pool.post_count }}
          </div>
          <div v-if="pool.category" class="pools-badge pools-badge--cat">
            {{ pool.category }}
          </div>
          <div v-if="!pool.is_active" class="pools-badge pools-badge--inactive">inactive</div>
          <div v-if="newCount(pool) > 0" class="pools-badge pools-badge--new">
            +{{ newCount(pool) }}
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
        class="pool-watch-button"
        icon
        size="x-small"
        variant="tonal"
        :color="isWatched(pool.id) ? 'accent' : undefined"
        :title="isWatched(pool.id) ? 'Unwatch pool' : 'Watch pool'"
        :aria-label="isWatched(pool.id) ? 'Unwatch pool' : 'Watch pool'"
        @click="$emit('toggle-watch', pool)"
      >
        <v-icon size="18">
          {{ isWatched(pool.id) ? "mdi-eye" : "mdi-eye-outline" }}
        </v-icon>
      </v-btn>
    </div>
  </div>

  <v-list v-else bg-color="transparent">
    <v-list-item v-for="pool in pools" :key="pool.id" :to="{ name: 'Pool', params: { id: pool.id } }" rounded="lg" class="mb-1 pool-row">
      <template #prepend>
        <div class="pool-cover">
          <img v-if="coverUrl(pool)" :src="coverUrl(pool)!" :alt="displayName(pool.name)" class="pool-cover-img" loading="lazy" />
          <v-icon v-else size="32" class="text-medium-emphasis"> mdi-image-off-outline </v-icon>
        </div>
      </template>
      <v-list-item-title>{{ displayName(pool.name) }}</v-list-item-title>
      <v-list-item-subtitle>
        {{ pool.post_count }} posts · {{ pool.creator_name }}
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
          icon
          size="small"
          variant="text"
          :color="isWatched(pool.id) ? 'accent' : undefined"
          :title="isWatched(pool.id) ? 'Unwatch pool' : 'Watch pool'"
          :aria-label="isWatched(pool.id) ? 'Unwatch pool' : 'Watch pool'"
          @click.prevent.stop="$emit('toggle-watch', pool)"
        >
          <v-icon>
            {{ isWatched(pool.id) ? "mdi-eye" : "mdi-eye-outline" }}
          </v-icon>
        </v-btn>
      </template>
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
import type { Pool } from "@/worker/api";

const props = defineProps<{
  pools: Pool[];
  layout: "grid" | "list";
  covers: Record<number, string>;
  watchedIds: Set<number>;
  /** pool id → new posts since last seen */
  newCounts?: Record<number, number>;
}>();

defineEmits<{
  "toggle-watch": [pool: Pool];
}>();

const displayName = (name: string) => name.replace(/_/g, " ");
const coverUrl = (pool: Pool) => {
  for (const id of pool.post_ids || []) {
    if (typeof id === "number" && id > 0 && props.covers[id]) {
      return props.covers[id];
    }
  }
  return null;
};
const isWatched = (id: number) => props.watchedIds.has(id);
const newCount = (pool: Pool) => props.newCounts?.[pool.id] || 0;
const updatedLabel = (pool: Pool) => {
  const raw = pool.updated_at;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};
</script>

<style scoped>
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
