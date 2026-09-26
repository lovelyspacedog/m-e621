<template>
  <div class="u18-watched-page">
    <div class="u18-watched-header">
      <div>
        <span class="text-overline text-medium-emphasis">u18chan</span>
        <h1 class="text-h6 font-weight-bold d-flex align-center ga-2">
          <v-icon color="accent">mdi-eye</v-icon>
          Watched Threads
        </h1>
        <p class="text-caption text-medium-emphasis mb-0">
          Local watches with +N when a thread gains replies since you last opened it.
        </p>
      </div>
      <v-btn
        icon
        variant="text"
        :loading="loading"
        aria-label="Refresh"
        @click="hydrate"
      >
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <div
      v-if="!loading && !watchedStore.entries.length"
      class="u18-empty"
    >
      <v-icon size="64" color="medium-emphasis">mdi-eye-outline</v-icon>
      <p class="mt-3 text-medium-emphasis">
        No watched threads yet. Use the eye button on a thread or catalog card.
      </p>
    </div>

    <div v-else-if="loading && !rows.length" class="u18-grid">
      <v-skeleton-loader v-for="n in 12" :key="n" type="image" class="u18-skel" />
    </div>

    <div v-else-if="rows.length" class="u18-grid">
      <div v-for="row in rows" :key="row.key" class="u18-card-wrap">
        <button type="button" class="u18-card" @click="openRow(row)">
          <div class="u18-thumb">
            <img
              v-if="row.thumbUrl"
              :src="media(row.thumbUrl)"
              :alt="row.subject"
              loading="lazy"
            />
            <v-icon v-else size="40" color="medium-emphasis">mdi-image-off</v-icon>
            <div v-if="row.newCount > 0" class="u18-badge-new">+{{ row.newCount }}</div>
            <div class="u18-badge-board">/{{ row.liveBoard }}/</div>
          </div>
          <div class="u18-card-title">{{ row.subject }}</div>
          <div class="u18-card-meta">
            {{ row.postCount }} post{{ row.postCount === 1 ? "" : "s" }}
          </div>
        </button>
        <v-btn
          class="u18-watch-btn"
          icon
          size="x-small"
          variant="tonal"
          color="accent"
          title="Unwatch thread"
          aria-label="Unwatch thread"
          @click="unwatch(row)"
        >
          <v-icon size="18">mdi-eye</v-icon>
        </v-btn>
      </div>
    </div>

    <v-list
      v-if="unavailable.length"
      class="mt-2 mx-2"
      bg-color="transparent"
      density="compact"
    >
      <v-list-item
        v-for="entry in unavailable"
        :key="`missing-${entry.liveBoard}-${entry.topicId}`"
        :title="entry.subject || `Thread ${entry.topicId}`"
        :subtitle="`/${entry.liveBoard}/ · unavailable or failed to load`"
      >
        <template #append>
          <v-btn
            icon
            size="small"
            variant="text"
            title="Unwatch thread"
            aria-label="Unwatch thread"
            @click="watchedStore.remove(entry.liveBoard, entry.topicId)"
          >
            <v-icon>mdi-eye-off-outline</v-icon>
          </v-btn>
        </template>
      </v-list-item>
    </v-list>

    <TipDialog
      :tip-id="TIP_IDS.watchedU18chan"
      title="Watched u18chan threads"
      v-model="tipOpen"
    >
      <p class="mb-0">
        Watches are stored in this browser. Open a watched thread to clear its +N
        badge. New replies bump the count the next time this page refreshes.
      </p>
    </TipDialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import {
  useWatchedU18chanStore,
} from "@/services";
import type { WatchedU18chanEntry } from "@/services/types";
import { getThread, u18chanMediaUrl } from "@/worker/u18chan/api";
import { useHead } from "@unhead/vue";

useHead({ title: "u18chan Watched" });

interface WatchedRow {
  key: string;
  liveBoard: string;
  topicId: number;
  indexBoard: string;
  subject: string;
  thumbUrl: string | null;
  postCount: number;
  newCount: number;
}

const router = useRouter();
const watchedStore = useWatchedU18chanStore();
const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.watchedU18chan);

const loading = ref(false);
const error = ref<string | null>(null);
const rows = ref<WatchedRow[]>([]);
const unavailable = ref<WatchedU18chanEntry[]>([]);

const media = (url: string) => u18chanMediaUrl(url);

const openRow = (row: WatchedRow) => {
  void router.push({
    name: "U18chanThread",
    params: {
      board: row.indexBoard || "ifur",
      id: String(row.topicId),
    },
    query: { live: row.liveBoard },
  });
};

const unwatch = (row: WatchedRow) => {
  watchedStore.remove(row.liveBoard, row.topicId);
  rows.value = rows.value.filter((r) => r.key !== row.key);
};

const hydrateOne = async (entry: WatchedU18chanEntry): Promise<WatchedRow | null> => {
  try {
    const thread = await getThread(
      entry.liveBoard,
      entry.topicId,
      entry.indexBoard,
    );
    const postCount = thread.posts.length;
    const thumb =
      thread.posts.find((p) => p.images.length)?.images[0]?.thumbUrl ||
      entry.thumbUrl ||
      null;
    const snapshot = {
      postCount,
      subject: thread.subject || entry.subject,
      thumbUrl: thumb,
      indexBoard: entry.indexBoard,
    };
    watchedStore.ensureBaseline(entry.liveBoard, entry.topicId, snapshot);
    const newCount = watchedStore.newCount(
      entry.liveBoard,
      entry.topicId,
      postCount,
    );
    return {
      key: `${entry.liveBoard}:${entry.topicId}`,
      liveBoard: entry.liveBoard,
      topicId: entry.topicId,
      indexBoard: entry.indexBoard || "ifur",
      subject: thread.subject || entry.subject,
      thumbUrl: thumb,
      postCount,
      newCount,
    };
  } catch {
    return null;
  }
};

const hydrate = async () => {
  loading.value = true;
  error.value = null;
  const entries = [...watchedStore.entries];
  if (!entries.length) {
    rows.value = [];
    unavailable.value = [];
    loading.value = false;
    return;
  }
  try {
    const settled = await Promise.all(
      entries.map(async (entry) => ({ entry, row: await hydrateOne(entry) })),
    );
    const ok: WatchedRow[] = [];
    const missing: WatchedU18chanEntry[] = [];
    for (const item of settled) {
      if (item.row) ok.push(item.row);
      else missing.push(item.entry);
    }
    ok.sort((a, b) => b.newCount - a.newCount || a.subject.localeCompare(b.subject));
    rows.value = ok;
    unavailable.value = missing;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load watched threads";
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  tryOpen();
  void hydrate();
});

watch(
  () => watchedStore.entries.length,
  () => {
    void hydrate();
  },
);
</script>

<style scoped>
.u18-watched-page {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 48px;
}
.u18-watched-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 16px;
}
.u18-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  padding: 16px;
}
.u18-skel {
  min-height: 160px;
}
.u18-card-wrap {
  position: relative;
}
.u18-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
  width: 100%;
}
.u18-thumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(128, 128, 128, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}
.u18-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.u18-badge-new {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  background: rgb(var(--v-theme-accent));
  color: rgb(var(--v-theme-on-accent));
}
.u18-badge-board {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
}
.u18-card-title {
  font-size: 0.8rem;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.u18-card-meta {
  font-size: 0.7rem;
  opacity: 0.7;
}
.u18-watch-btn {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
}
.u18-empty {
  text-align: center;
  padding: 48px 16px;
}
</style>
