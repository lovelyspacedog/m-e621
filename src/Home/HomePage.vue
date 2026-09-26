<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <h1 class="text-h5 mb-1">Home</h1>
        <p class="text-body-2 text-medium-emphasis mb-4">
          What’s new on this profile — shortcuts, wake hits, watches, and Saved.
        </p>

        <section class="mb-6">
          <div class="text-subtitle-2 mb-2">Shortcuts</div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              v-for="item in shortcuts"
              :key="item.key"
              size="small"
              variant="tonal"
              :to="item.to"
              @click="item.onClick?.()"
            >
              {{ item.label }}
              <v-chip
                v-if="item.badge"
                size="x-small"
                color="primary"
                class="ml-2"
              >
                {{ item.badge > 99 ? "99+" : item.badge }}
              </v-chip>
            </v-btn>
          </div>
        </section>

        <section v-if="!siteMode.isNews" class="mb-6">
          <div class="d-flex flex-wrap align-center ga-2 mb-2">
            <div class="text-subtitle-2 mb-0">Saved-search wake</div>
            <v-spacer />
            <v-btn
              v-if="showDiscovery"
              size="small"
              variant="text"
              :to="{ name: 'SavedSearchWake' }"
            >
              Wake-up tool
            </v-btn>
          </div>
          <v-alert
            v-if="!galleryEntries.length"
            type="info"
            density="compact"
            class="mb-0"
          >
            No gallery saved searches on this profile yet. Add some in the
            sidebar.
          </v-alert>
          <v-list v-else lines="one" border rounded density="compact">
            <v-list-item
              v-for="entry in galleryEntries"
              :key="entry.id"
              :to="toSearch(entry)"
              @click="onOpenWake(entry)"
            >
              <v-list-item-title>{{ entry.name }}</v-list-item-title>
              <template #append>
                <v-chip
                  v-if="wakeCount(entry) > 0"
                  size="x-small"
                  color="primary"
                >
                  +{{ wakeCount(entry) }}
                </v-chip>
              </template>
            </v-list-item>
          </v-list>
        </section>

        <section
          v-if="showWatchedSection"
          class="mb-6"
        >
          <div class="d-flex flex-wrap align-center ga-2 mb-2">
            <div class="text-subtitle-2 mb-0">Watched</div>
            <v-spacer />
            <v-btn
              v-if="showPoolsLink"
              size="small"
              variant="text"
              :to="{ name: 'Pools' }"
            >
              Pools
            </v-btn>
            <v-btn
              v-if="siteMode.isTailspace"
              size="small"
              variant="text"
              :to="{ name: 'TailspaceComics' }"
            >
              Comics
            </v-btn>
          </div>
          <v-alert
            v-if="!watchedRows.length"
            type="info"
            density="compact"
            class="mb-0"
          >
            No watched pools, comics, or u18chan threads yet. Open one and
            watch it — +N badges still live on the Pools / Comics / u18chan
            Watched pages.
          </v-alert>
          <v-list v-else lines="one" border rounded density="compact">
            <v-list-item
              v-for="row in watchedRows"
              :key="row.key"
              :to="row.to"
            >
              <v-list-item-title>{{ row.title }}</v-list-item-title>
              <v-list-item-subtitle>{{ row.subtitle }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </section>

        <section v-if="siteMode.supportsSavedPosts" class="mb-6">
          <div class="d-flex flex-wrap align-center ga-2 mb-2">
            <div class="text-subtitle-2 mb-0">Saved</div>
            <v-spacer />
            <v-btn size="small" variant="text" :to="{ name: 'SavedPosts' }">
              Open Saved
            </v-btn>
          </div>
          <p class="text-body-2 text-medium-emphasis mb-2">
            {{ savedPosts.count }} saved post{{
              savedPosts.count === 1 ? "" : "s"
            }}
            <span v-if="savedPosts.collections.length">
              · {{ savedPosts.collections.length }} collection{{
                savedPosts.collections.length === 1 ? "" : "s"
              }}
            </span>
          </p>
          <v-alert
            v-if="!savedPosts.count"
            type="info"
            density="compact"
            class="mb-0"
          >
            Bookmark posts from the feed; group them into collections on Saved.
          </v-alert>
          <v-list
            v-else-if="savedPosts.collections.length"
            lines="one"
            border
            rounded
            density="compact"
          >
            <v-list-item
              v-for="col in savedPosts.collections"
              :key="col.id"
              :to="{ name: 'SavedPosts' }"
            >
              <v-list-item-title>{{ col.name }}</v-list-item-title>
              <template #append>
                <span class="text-caption text-medium-emphasis">
                  {{ col.postKeys.length }}
                </span>
              </template>
            </v-list-item>
          </v-list>
        </section>

        <section v-if="showDiscovery" class="mb-2">
          <div class="text-subtitle-2 mb-2">Discovery</div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              size="small"
              variant="tonal"
              :to="{ name: 'HistoryInsights' }"
            >
              History Insights
              <v-chip size="x-small" variant="text" class="ml-1">
                {{ history.entries.length }}
              </v-chip>
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              :to="{ name: 'ActivityHeatmap' }"
            >
              Activity heatmap
            </v-btn>
          </div>
        </section>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.homeOverview"
      title="Home"
      v-model="tipOpen"
    >
      <p class="mb-0">
        Home gathers wake hits, watches, Saved, and browse shortcuts for the
        current site profile. Artist Dashboard stays under Tools on e621 and
        e6ai.
      </p>
    </TipDialog>
  </v-container>
</template>

<script setup lang="ts">
import {
  useDiscoveryStore,
  useHistoryStore,
  useNewsStore,
  useSavedPostsStore,
  useSavedSearchStore,
  useSiteModeStore,
  useWatchedComicsStore,
  useWatchedPoolsStore,
  useWatchedU18chanStore,
} from "@/services";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import {
  modeSupportsDiscoveryTools,
  modeSupportsFollowing,
  modeSupportsPools,
} from "@/misc/util/siteCapabilities";
import { poolRouteQuery } from "@/misc/util/poolOrigin";
import { browsePostsRoute } from "@/misc/util/browsePostsRoute";
import type { SavedSearchEntry } from "@/services/types";
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref, watch } from "vue";
import type { RouteLocationRaw } from "vue-router";
import { peekNewsCachedArticles } from "@/worker/news/api";

useHead({ title: "Home" });

const siteMode = useSiteModeStore();
const discovery = useDiscoveryStore();
const savedSearches = useSavedSearchStore();
const savedPosts = useSavedPostsStore();
const watchedPools = useWatchedPoolsStore();
const watchedComics = useWatchedComicsStore();
const watchedU18chan = useWatchedU18chanStore();
const history = useHistoryStore();
const newsStore = useNewsStore();

const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.homeOverview);
onMounted(() => tryOpen());

const showDiscovery = computed(() =>
  modeSupportsDiscoveryTools(siteMode.activeMode),
);
const showPoolsLink = computed(() => modeSupportsPools(siteMode.activeMode));
const showWatchedSection = computed(
  () =>
    showPoolsLink.value ||
    siteMode.isTailspace ||
    siteMode.isU18chan ||
    watchedPools.entries.length > 0 ||
    watchedComics.entries.length > 0 ||
    watchedU18chan.entries.length > 0,
);

const galleryEntries = computed(() =>
  savedSearches.entries.filter((e) => !e.news),
);

const wakeTick = ref(0);
watch(
  () => discovery.wakeById,
  () => {
    wakeTick.value += 1;
  },
  { deep: true },
);

const wakeCount = (entry: SavedSearchEntry) => {
  void wakeTick.value;
  return discovery.newCountFor(entry.id);
};

const onOpenWake = (entry: SavedSearchEntry) => {
  discovery.markSavedSearchOpened(entry.id);
};

const toSearch = (entry: SavedSearchEntry): RouteLocationRaw => {
  const tags = entry.tags;
  if (siteMode.isTailspace) {
    return {
      name: "TailspacePosts",
      query: { tags: tags.join(" ") },
    };
  }
  return {
    name: "Posts",
    query: { tags: tags.join(" ") },
  };
};

type Shortcut = {
  key: string;
  label: string;
  to?: RouteLocationRaw;
  badge?: number;
  onClick?: () => void;
};

const newsUnread = computed(() => {
  if (!siteMode.isNews) return 0;
  void newsStore.readCount;
  return peekNewsCachedArticles().filter((a) => !newsStore.isRead(a.id)).length;
});

const shortcuts = computed((): Shortcut[] => {
  const items: Shortcut[] = [
    {
      key: "browse",
      label: siteMode.isNews ? "News feed" : "Browse posts",
      to: browsePostsRoute(siteMode.activeMode),
    },
  ];

  if (siteMode.isTailspace) {
    items.push(
      {
        key: "comics",
        label: "Comics",
        to: { name: "TailspaceComics" },
      },
      {
        key: "following",
        label: "Following",
        to: { name: "TailspaceFollowing" },
      },
    );
  } else if (siteMode.isU18chan) {
    items.push({
      key: "u18-watched",
      label: "Watched",
      to: { name: "U18chanWatched" },
      badge: watchedU18chan.entries.length || undefined,
    });
  } else if (siteMode.isUnified) {
    items.push({
      key: "following",
      label: "Following",
      to: { name: "Posts" },
      onClick: () => siteMode.setUnifiedFeedSource("following"),
    });
  } else if (modeSupportsFollowing(siteMode.activeMode)) {
    items.push({
      key: "following",
      label: "Following",
      to: { name: "Posts", query: { tags: "following:me" } },
    });
  }

  if (showPoolsLink.value) {
    items.push({
      key: "pools",
      label: "Pools",
      to: { name: "Pools" },
    });
  }

  if (siteMode.supportsSavedPosts) {
    items.push({
      key: "saved",
      label: "Saved",
      to: { name: "SavedPosts" },
      badge: savedPosts.count || undefined,
    });
  }

  if (siteMode.isNews) {
    items.push({
      key: "news",
      label: "News",
      to: { name: "NewsFeed" },
      badge: newsUnread.value || undefined,
    });
  }

  return items;
});

const watchedRows = computed(() => {
  const pools = watchedPools.entries.map((e) => ({
    key: `pool:${e.originMode}:${e.id}`,
    title: `${e.originMode} pool #${e.id}`,
    subtitle: "Watched pool",
    to: {
      name: "Pool" as const,
      params: { id: e.id },
      query: poolRouteQuery(e.originMode),
    },
  }));
  const comics = watchedComics.entries.map((e) => ({
    key: `comic:${e.id}`,
    title: e.name.replace(/_/g, " "),
    subtitle: "Watched comic",
    to: {
      name: "TailspaceComic" as const,
      params: { name: e.name },
    },
  }));
  const u18 = watchedU18chan.entries.map((e) => ({
    key: `u18:${e.liveBoard}:${e.topicId}`,
    title: e.subject || `Thread ${e.topicId}`,
    subtitle: `u18chan /${e.liveBoard}/`,
    to: {
      name: "U18chanThread" as const,
      params: {
        board: e.indexBoard || "ifur",
        id: String(e.topicId),
      },
      query: { live: e.liveBoard },
    },
  }));
  if (siteMode.isTailspace) return comics;
  if (siteMode.isU18chan) return u18;
  if (siteMode.isUnified) return [...pools, ...comics];
  return pools;
});
</script>
