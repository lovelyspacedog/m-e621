<template>
  <div class="u18-catalog-page">
    <div class="u18-header">
      <div class="u18-header-inner">
        <div>
          <span class="text-overline text-medium-emphasis">u18chan</span>
          <h1 class="text-h6 font-weight-bold">{{ boardLabel }}</h1>
          <p class="text-caption text-medium-emphasis mb-0">
            Index catalog · guest posting via Settings identity
          </p>
        </div>
        <div class="u18-header-actions">
          <v-btn
            :href="externalUrl"
            target="_blank"
            rel="noopener"
            variant="text"
            size="small"
            append-icon="mdi-open-in-new"
          >
            Open on u18chan
          </v-btn>
          <v-btn
            icon
            variant="text"
            :loading="loading"
            aria-label="Refresh"
            @click="load"
          >
            <v-icon>mdi-refresh</v-icon>
          </v-btn>
        </div>
      </div>
    </div>

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <div v-if="loading && threads.length === 0" class="u18-grid">
      <v-skeleton-loader v-for="n in 24" :key="n" type="image" class="u18-skel" />
    </div>

    <div v-else-if="threads.length" class="u18-grid">
      <div v-for="thread in threads" :key="thread.id" class="u18-card-wrap">
        <button
          type="button"
          class="u18-card"
          @click="openThread(thread)"
        >
          <div class="u18-thumb">
            <img
              v-if="thread.thumbUrl"
              :src="thread.thumbUrl"
              :alt="thread.subject"
              loading="lazy"
            />
            <v-icon v-else size="40" color="medium-emphasis">mdi-image-off</v-icon>
          </div>
          <div class="u18-card-title">{{ thread.subject }}</div>
        </button>
        <v-btn
          class="u18-watch-btn"
          icon
          size="x-small"
          variant="tonal"
          :color="isWatched(thread) ? 'accent' : undefined"
          :title="isWatched(thread) ? 'Unwatch thread' : 'Watch thread'"
          :aria-label="isWatched(thread) ? 'Unwatch thread' : 'Watch thread'"
          @click.stop="toggleWatch(thread)"
        >
          <v-icon size="18">
            {{ isWatched(thread) ? "mdi-eye" : "mdi-eye-outline" }}
          </v-icon>
        </v-btn>
      </div>
    </div>

    <div v-else-if="!loading" class="u18-empty">
      <v-icon size="64" color="medium-emphasis">mdi-image-off-outline</v-icon>
      <p class="mt-3 text-medium-emphasis">No threads on this index.</p>
    </div>

    <v-card class="u18-compose ma-4" variant="outlined">
      <v-card-title class="text-subtitle-1">New thread on /{{ liveBoard }}/</v-card-title>
      <v-card-text>
        <u18chan-compose-form
          :live-board="liveBoard"
          :submitting="posting"
          @submit="onNewThread"
        />
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSiteModeStore, useWatchedU18chanStore } from "@/services";
import {
  DEFAULT_U18CHAN_INDEX,
  U18CHAN_BASE,
  isAllowedU18chanIndex,
  u18chanIndexBySlug,
} from "@/misc/util/u18chanBoards";
import { createPost, getCatalog } from "@/worker/u18chan/api";
import type { U18chanCatalogThread, U18chanPostPayload } from "@/worker/u18chan/types";
import U18chanComposeForm from "./U18chanComposeForm.vue";

const route = useRoute();
const router = useRouter();
const siteMode = useSiteModeStore();
const watchedStore = useWatchedU18chanStore();

const loading = ref(false);
const posting = ref(false);
const error = ref<string | null>(null);
const threads = ref<U18chanCatalogThread[]>([]);

const boardSlug = computed(() => {
  const raw = String(route.params.board || DEFAULT_U18CHAN_INDEX).toLowerCase();
  if (!isAllowedU18chanIndex(raw, siteMode.u18chanIncludeGore)) {
    return DEFAULT_U18CHAN_INDEX;
  }
  return raw;
});

const boardDef = computed(() => u18chanIndexBySlug(boardSlug.value));
const boardLabel = computed(() => boardDef.value?.label || "Index");
const liveBoard = computed(() => boardDef.value?.live || "fur");
const externalUrl = computed(() => `${U18CHAN_BASE}/${boardSlug.value}/`);

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    if (!route.params.board) {
      await router.replace({
        name: "U18chanCatalog",
        params: { board: boardSlug.value },
      });
    }
    threads.value = await getCatalog(boardSlug.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load catalog";
    threads.value = [];
  } finally {
    loading.value = false;
  }
};

const openThread = (thread: U18chanCatalogThread) => {
  void router.push({
    name: "U18chanThread",
    params: {
      board: boardSlug.value,
      id: String(thread.id),
    },
    query: { live: thread.liveBoard },
  });
};

const isWatched = (thread: U18chanCatalogThread) =>
  watchedStore.isWatched(thread.liveBoard, thread.id);

const toggleWatch = (thread: U18chanCatalogThread) => {
  watchedStore.toggle(
    thread.liveBoard,
    thread.id,
    thread.subject || `Thread ${thread.id}`,
    boardSlug.value,
    {
      subject: thread.subject,
      thumbUrl: thread.thumbUrl,
      indexBoard: boardSlug.value,
    },
  );
};

const onNewThread = async (payload: Omit<U18chanPostPayload, "liveBoard" | "topicId">) => {
  posting.value = true;
  error.value = null;
  try {
    await createPost({
      ...payload,
      liveBoard: liveBoard.value,
      topicId: 0,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to post";
  } finally {
    posting.value = false;
  }
};

watch(
  () => [boardSlug.value, siteMode.modeChangeCount] as const,
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<style scoped>
.u18-catalog-page {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 48px;
}
.u18-header {
  padding: 16px 16px 8px;
}
.u18-header-inner {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.u18-header-actions {
  display: flex;
  gap: 4px;
  align-items: center;
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
.u18-watch-btn {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
}
.u18-card-title {
  font-size: 0.8rem;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.u18-empty {
  text-align: center;
  padding: 48px 16px;
}
.u18-compose {
  max-width: 720px;
}
</style>
