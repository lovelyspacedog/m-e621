<template>
  <div>
    <portal to="toolbar">
      <div class="posts-toolbar">
        <tag-search v-view-transition-name="'tagsearch'" class="posts-toolbar-search" :tags="tags" @add-tag="addTag"
          @remove-tag="removeTag" @confirm-search="updateQuery(), onSearchClick()" label="Tags" />

        <!-- Wide: inline action buttons -->
        <template v-if="!compactToolbarActions">
          <v-btn
            v-for="action in toolbarActions"
            :key="action.key"
            class="text-none"
            size="small"
            variant="text"
            :color="action.active ? (action.error ? 'error' : 'accent') : undefined"
            :loading="action.loading"
            :disabled="action.disabled"
            :title="action.title"
            @click="action.run"
          >
            {{ action.label }}
          </v-btn>
        </template>

        <!-- Narrow: collapse actions into a menu -->
        <v-menu v-else location="bottom end" offset-y transition="slide-y-transition">
          <template #activator="{ props: menuProps }">
            <v-btn v-bind="menuProps" icon size="small" title="Actions">
              <v-icon>mdi-dots-vertical</v-icon>
            </v-btn>
          </template>
          <v-list density="compact" min-width="180">
            <v-list-item
              v-for="action in toolbarActions"
              :key="action.key"
              :active="action.active"
              :disabled="action.disabled"
              :title="action.label"
              :subtitle="action.disabled ? action.title : undefined"
              @click="action.run"
            >
              <template v-if="action.loading" #append>
                <v-progress-circular indeterminate size="16" width="2" />
              </template>
            </v-list-item>
          </v-list>
        </v-menu>

        <v-btn icon @click="updateQuery(), onSearchClick()" :loading="loading">
          <v-icon>mdi-magnify</v-icon>
        </v-btn>
        <v-menu location="bottom left" max-height="300" offset-y transition="slide-y-transition" v-if="mdAndUp">
          <template #activator="{ props }">
            <v-btn v-bind="props" icon>
              <v-icon>mdi-history</v-icon>
            </v-btn>
          </template>
          <v-card>
            <v-card-text>
              <history-list :entries="historyEntries" @delete-entry="removeHistoryEntry($event)"
                @click-entry="onHistoryEntryClick" />
            </v-card-text>
          </v-card>
        </v-menu>
      </div>
    </portal>
    <div v-if="siteMode.isLocal && !loading && !posts.length" class="pa-6 text-center">
      <p class="mb-4">{{ localEmptyMessage }}</p>
      <div class="d-inline-block text-left" style="max-width: 420px">
        <local-folder-picker @changed="reloadLocal" />
      </div>
    </div>
    <posts :posts="posts" :loading="loading" :has-previous="hasPrevious" @load-previous="loadPreviousPage()"
      @load-next="loadNextPage()" @open-post="openFullscreenPost" :fullscreen-post="fullscreenPost || undefined"
      @exit-fullscreen="fullscreenPost = null" @next-fullscreen-post="onNextFullscreenPost"
      @previous-fullscreen-post="openPreviousFullscreenPost()"
      :has-previous-fullscreen-post="hasPreviousFullscreenPost"
      :has-next-fullscreen-post="hasNextFullscreenPost"
      :details-post="detailsPost || undefined" @open-post-details="openPostDetails"
      @close-details="detailsPost = null" @set-post-favorite="setPostFavorite($event)"
      @set-post-vote="setPostVote($event)"
      :resume-enabled="siteMode.isLocal"
      :restore-path="restorePath || undefined"
      :restore-video-time="restoreVideoTime"
      @restored="onRestored"
      @remuxed="reloadLocal" />
    <portal to="sidebar-suggestions">
      <v-list v-if="siteMode.isUnified" class="pa-0 mt-1 mb-2 unified-sidebar" density="compact">
        <v-list-subheader class="text-overline unified-sidebar__label">
          Federated source
        </v-list-subheader>
        <v-list-item class="unified-sidebar__source py-2">
          <v-btn-toggle
            class="w-100"
            color="accent"
            density="compact"
            divided
            mandatory
            :model-value="siteMode.unifiedFeedSource"
            @update:model-value="onUnifiedFeedSource"
          >
            <v-btn class="flex-grow-1" value="search" size="small">Search</v-btn>
            <v-btn
              class="flex-grow-1"
              value="following"
              size="small"
              title="Tag search is ignored. Needs login on each site."
            >
              Following
            </v-btn>
          </v-btn-toggle>
        </v-list-item>
        <v-list-item
          class="sidebar-section-header unified-sidebar__sites-header mt-2"
          @click="toggleUnifiedSitesOpen"
        >
          <template #prepend>
            <v-icon size="small">
              {{ unifiedSitesOpen ? "mdi-chevron-down" : "mdi-chevron-right" }}
            </v-icon>
          </template>
          <v-list-item-title class="text-overline">
            {{ siteMode.unifiedFeedSource === "following" ? "Sites in Following" : "Sites in this search" }}
          </v-list-item-title>
          <template #append>
            <span class="text-caption text-medium-emphasis mr-1">
              {{ unifiedSitesSummary }}
            </span>
          </template>
        </v-list-item>
        <v-list-item v-if="siteMode.unifiedFeedSource === 'search'" class="unified-sidebar__presets pt-1 pb-2">
          <div class="d-flex flex-wrap ga-2" @click.stop>
            <v-btn
              size="small"
              :variant="siteMode.isUnifiedSitesPresetActive('default') ? 'flat' : 'tonal'"
              color="accent"
              :aria-pressed="siteMode.isUnifiedSitesPresetActive('default')"
              @click="siteMode.applyUnifiedSitesPreset('default')"
            >
              Defaults
            </v-btn>
            <v-btn
              size="small"
              :variant="siteMode.isUnifiedSitesPresetActive('authenticated') ? 'flat' : 'tonal'"
              color="accent"
              :aria-pressed="siteMode.isUnifiedSitesPresetActive('authenticated')"
              @click="siteMode.applyUnifiedSitesPreset('authenticated')"
            >
              Auth only
            </v-btn>
          </div>
        </v-list-item>
        <template v-if="unifiedSitesOpen">
          <v-list-item
            v-for="child in unifiedSidebarChildren"
            :key="child"
          >
            <template #prepend>
              <v-icon>{{ unifiedChildIcon(child) }}</v-icon>
            </template>
            <v-list-item-title>{{ unifiedChildLabel(child) }}</v-list-item-title>
            <template #append>
              <v-switch
                class="ma-0"
                color="accent"
                density="compact"
                hide-details
                :model-value="siteMode.unifiedSites[child]"
                @update:model-value="siteMode.setUnifiedChild(child, !!$event)"
              />
            </template>
          </v-list-item>
        </template>
      </v-list>
      <v-list class="pa-0 mt-1 mb-2" density="compact">
        <v-menu location="bottom end" :close-on-content-click="false">
          <template #activator="{ props: menuProps }">
            <v-list-item v-bind="menuProps" title="Layout">
              <template #prepend>
                <v-icon>mdi-view-dashboard-outline</v-icon>
              </template>
              <template #append>
                <v-tooltip
                  :text="layoutShortcutHint"
                  location="top"
                >
                  <template #activator="{ props: tipProps }">
                    <v-icon
                      v-bind="tipProps"
                      size="small"
                      class="text-medium-emphasis"
                      @click.prevent.stop
                    >
                      mdi-keyboard-outline
                    </v-icon>
                  </template>
                </v-tooltip>
                <v-icon size="small" class="ml-1">mdi-menu-down</v-icon>
              </template>
            </v-list-item>
          </template>
          <v-list density="compact" min-width="260">
            <v-list-item>
              <template #prepend>
                <v-icon>mdi-arrow-expand-horizontal</v-icon>
              </template>
              <v-list-item-title>Full-width feed</v-list-item-title>
              <template #append>
                <v-switch
                  class="ma-0"
                  color="accent"
                  density="compact"
                  hide-details
                  :disabled="postsStore.feedLayout === 'grid'"
                  v-model="postsStore.fullWidthFeed"
                />
              </template>
            </v-list-item>
            <v-list-item>
              <template #prepend>
                <v-icon>mdi-view-grid</v-icon>
              </template>
              <v-list-item-title>Grid layout</v-list-item-title>
              <template #append>
                <v-switch
                  class="ma-0"
                  color="accent"
                  density="compact"
                  hide-details
                  :model-value="postsStore.feedLayout === 'grid'"
                  @update:model-value="postsStore.feedLayout = $event ? 'grid' : 'list'"
                />
              </template>
            </v-list-item>
            <v-list-item>
              <template #prepend>
                <v-icon>mdi-card-text-outline</v-icon>
              </template>
              <v-list-item-title>Compact cards</v-list-item-title>
              <template #append>
                <v-switch
                  class="ma-0"
                  color="accent"
                  density="compact"
                  hide-details
                  v-model="postsStore.compactCards"
                />
              </template>
            </v-list-item>
            <v-list-item>
              <template #prepend>
                <v-icon>mdi-skip-next</v-icon>
              </template>
              <v-list-item-title>Auto-next cards</v-list-item-title>
              <template #append>
                <v-switch
                  class="ma-0"
                  color="accent"
                  density="compact"
                  hide-details
                  v-model="postsStore.cardAutoNext"
                />
              </template>
            </v-list-item>
          </v-list>
        </v-menu>
      </v-list>
      <v-chip
        v-if="hiddenPostCount > 0"
        class="ma-2"
        size="small"
        variant="tonal"
        color="warning"
      >
        {{ hiddenPostCount }} blacklisted hidden
      </v-chip>
      <template v-if="suggestedTags.length > 0">
        <v-list class="pa-0" density="compact">
          <v-list-item
            class="sidebar-section-header"
            @click="toggleTagsOpen"
          >
            <template #prepend>
              <v-icon size="small">
                {{ tagsOpen ? "mdi-chevron-down" : "mdi-chevron-right" }}
              </v-icon>
            </template>
            <v-list-item-title class="text-overline">Tags on this page</v-list-item-title>
            <template #append>
              <span class="text-caption text-medium-emphasis">{{ suggestedTags.length }}</span>
            </template>
          </v-list-item>
        </v-list>
        <suggestions v-if="tagsOpen" :tags="suggestedTags" />
      </template>
    </portal>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { useHistory } from "@/Post/historyManager";
import { usePostListManager } from "@/Post/postListManager";
import Posts from "@/Post/Posts.vue";
import { useRouterTagManager } from "@/Post/routerTagManager";
import { useAccountStore, useBlacklistStore, useMainStore, usePostsStore, useShortcutService, useSiteModeStore, useSnackbarStore, useUrlStore } from "@/services";
import type { ITag } from "@/Tag/ITag";
import { debounce, isEqual } from "lodash";
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from "vue";
import { useRouterQueryHelpers } from "../misc/util/utilities";
import {
  buildTagQuery,
  tagQueryTruncationMessage,
} from "../misc/util/createTagQuery";
import { orderSupport, type UnifiedOrderKind } from "../misc/util/orderSupport";
import {
  buildUnifiedFetchArgs,
  unifiedChildIcon,
  unifiedChildLabel,
} from "../misc/util/postOrigin";
import { UNIFIED_CHILD_MODES, type UnifiedFeedSource } from "@/services/types";
import { modeSupportsFollowing } from "@/misc/util/siteCapabilities";
import {
  findLocalPathTarget,
  findLocalResumeTarget,
  getLocalPostsPage,
  invalidateLocalMediaIndex,
  localStatusMessage,
  remuxUnplayableLocal,
  revokeLocalBlobUrls,
  takePendingLocalFocusPath,
} from "../misc/util/localMedia";
import HistoryList from "../Tag/HistoryList.vue";
import TagSearch from "../Tag/TagSearch.vue";
import LocalFolderPicker from "../Settings/LocalFolderPicker.vue";
import { getAnalyzeService, getApiService } from "../worker/services";
import { savePostsLocally, saveSearchLocally } from "../misc/util/saveLocal";
import Suggestions from "./Suggestions.vue";
import {
  readSidebarSectionOpen,
  writeSidebarSectionOpen,
} from "@/misc/util/sidebarSections";
import { useDisplay } from "vuetify";

const { mdAndDown, mdAndUp } = useDisplay();

const account = useAccountStore();
const blacklist = useBlacklistStore();
const postsStore = usePostsStore();
const compactToolbarActions = computed(
  () => postsStore.alwaysCollapseToolbar || mdAndDown.value,
);
const siteMode = useSiteModeStore();
const snackbar = useSnackbarStore();
const main = useMainStore();
const unifiedSidebarChildren = computed(() =>
  siteMode.unifiedFeedSource === "following"
    ? UNIFIED_CHILD_MODES.filter((mode) => modeSupportsFollowing(mode))
    : UNIFIED_CHILD_MODES,
);
const unifiedSitesOpen = ref(readSidebarSectionOpen("unified-sites", false));
const tagsOpen = ref(readSidebarSectionOpen("tags-on-page", true));
const toggleUnifiedSitesOpen = () => {
  unifiedSitesOpen.value = !unifiedSitesOpen.value;
  writeSidebarSectionOpen("unified-sites", unifiedSitesOpen.value);
};
const toggleTagsOpen = () => {
  tagsOpen.value = !tagsOpen.value;
  writeSidebarSectionOpen("tags-on-page", tagsOpen.value);
};
const unifiedSitesSummary = computed(() => {
  const children = unifiedSidebarChildren.value;
  const enabled = children.filter((child) => siteMode.unifiedSites[child]).length;
  return `${enabled}/${children.length} sites`;
});
const layoutShortcutHint = computed(() =>
  postsStore.cardAutoNext
    ? "Space pauses (feed) · slideshow (fullscreen) · j/k next/prev"
    : "j/k next/prev · Space slideshow in fullscreen",
);
const onUnifiedFeedSource = (value: unknown) => {
  if (value === "search" || value === "following") {
    siteMode.setUnifiedFeedSource(value as UnifiedFeedSource);
  }
};
const localEmptyMessage = ref(localStatusMessage("no-folder"));
const restorePath = ref<string | null>(null);
const restoreVideoTime = ref<number | undefined>(undefined);
const bulkSaving = ref(false);
const searchSaving = ref(false);
const bulkRemuxing = ref(false);
let searchSaveAbort: AbortController | null = null;
let remuxAbort: AbortController | null = null;
const { tags, addTag, removeTag, updateQuery, query, setTags } =
  useRouterTagManager();
const urlStore = useUrlStore();
const route = useRoute();

const { removeRouterQuery, updateRouterQuery } = useRouterQueryHelpers();

/** Dedupe 40-tag truncation snackbar — once per distinct search query. */
const lastTagTruncationKey = ref("");

const {
  loadPreviousPage,
  loadNextPage,
  visiblePosts: posts,
  clearPosts,
  hiddenPostCount,
  fullscreenPost,
  detailsPost,
  loading,
  openPostDetails,
  openFullscreenPost,
  openNextFullscreenPost,
  openPreviousFullscreenPost,
  setPostFavorite,
  setPostVote,
  hasPrevious,
  hasPreviousFullscreenPost,
  hasNextFullscreenPost,
} = usePostListManager({
  getSavedPageNumber() {
    return Number(route.query.page) || 0;
  },
  savePageNumber(page) {
    if (page === 1 || !page) {
      void removeRouterQuery(["page"]);
    } else {
      void updateRouterQuery({
        page: String(page),
      });
    }
  },
  async loadPosts(page) {
    if (siteMode.isLocal) {
      const result = await getLocalPostsPage(
        page,
        toRaw(postsStore.postListFetchLimit),
        toRaw(tags.value),
        page <= 1,
      );
      localEmptyMessage.value =
        localStatusMessage(result.status) || "No matching local files.";
      return result.posts;
    }
    // e621/e6ai only — hide-mode blacklist is folded into the 40-tag API cap (M9).
    // Unified must NOT use this path: child queries are prepared separately and
    // origin blacklists are applied per child / stamped client-side (FEATURES 8.3).
    if (
      page <= 1 &&
      !siteMode.isFurbooru &&
      !siteMode.isInkbunny &&
      !siteMode.isFurAffinity &&
      !siteMode.isWeasyl &&
      !siteMode.isItaku &&
      !siteMode.isSofurry &&
      !siteMode.isTailspace &&
      !siteMode.isFlayrah &&
      !siteMode.isUnified
    ) {
      const built = buildTagQuery(
        toRaw(blacklist.mode),
        toRaw(blacklist.tags),
        toRaw(tags.value),
      );
      if (built.truncated) {
        const key = `${built.total}:${toRaw(tags.value).join(" ")}`;
        if (key !== lastTagTruncationKey.value) {
          lastTagTruncationKey.value = key;
          snackbar.addMessage(
            tagQueryTruncationMessage(built.total, built.limit),
          );
        }
      }
    }
    const service = await getApiService();
    const result = await service.getPosts(toRaw({
      limit: toRaw(postsStore.postListFetchLimit),
      page,
      tags: toRaw(tags.value),
      blacklist: toRaw(blacklist.tags),
      blacklistMode: toRaw(blacklist.mode),
      auth: toRaw(account.auth),
      userId: toRaw(account.userId),
      baseUrl: toRaw(urlStore.e621Url),
      mode: toRaw(siteMode.activeMode),
      unified: siteMode.isUnified
        ? buildUnifiedFetchArgs(main.$state)
        : undefined,
    }));
    for (const warning of result.warnings || []) {
      snackbar.addMessage(warning);
    }
    return result.posts;
  },
});

const shortcutService = useShortcutService();
const onNextFullscreenPost = async (opts?: { skipDocuments?: boolean }) => {
  const moved = await openNextFullscreenPost(opts);
  // Slideshow asked to skip stories/PDFs but nothing else remained.
  if (opts?.skipDocuments && !moved) {
    shortcutService.emitter.emit("fullscreenSlideshowStop");
  }
};

const reloadLocal = () => {
  invalidateLocalMediaIndex();
  revokeLocalBlobUrls();
  restorePath.value = null;
  restoreVideoTime.value = undefined;
  clearPosts();
  loadNextPage();
};

const onRestored = () => {
  restorePath.value = null;
  restoreVideoTime.value = undefined;
};

const bulkSaveVisible = async () => {
  if (siteMode.isLocal || bulkSaving.value || searchSaving.value) return;
  bulkSaving.value = true;
  try {
    await savePostsLocally(posts.value, { concurrency: 2 });
  } finally {
    bulkSaving.value = false;
  }
};

const toggleBulkRemux = async () => {
  if (!siteMode.isLocal) return;
  if (bulkRemuxing.value) {
    remuxAbort?.abort();
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    snackbar.addMessage(
      "Remux needs a network connection the first time (ffmpeg core). Remux jobs are not added to the offline save queue.",
    );
    return;
  }
  bulkRemuxing.value = true;
  remuxAbort = new AbortController();
  let lastLabel = "";
  try {
    const result = await remuxUnplayableLocal({
      tags: toRaw(tags.value),
      signal: remuxAbort.signal,
      onProgress: (p) => {
        const name = p.path.split("/").pop() || p.path;
        const label = `Remux ${p.index + 1}/${p.total}: ${name}`;
        if (label !== lastLabel) {
          lastLabel = label;
          snackbar.addMessage(label);
        }
      },
    });
    if (!result.done && !result.failed && !result.aborted) {
      snackbar.addMessage("No unplayable videos in this Local filter");
    } else {
      const parts = [`${result.done} remuxed`];
      if (result.failed) parts.push(`${result.failed} failed`);
      if (result.aborted) parts.push("cancelled");
      snackbar.addMessage(parts.join(", "));
      if (result.done) reloadLocal();
    }
  } catch (err) {
    snackbar.addMessage(
      err instanceof Error ? err.message : "Bulk remux failed",
    );
  } finally {
    bulkRemuxing.value = false;
    remuxAbort = null;
  }
};

const toggleSaveSearch = async () => {
  if (siteMode.isLocal || bulkSaving.value) return;
  if (searchSaving.value) {
    searchSaveAbort?.abort();
    return;
  }
  searchSaving.value = true;
  searchSaveAbort = new AbortController();
  const signal = searchSaveAbort.signal;
  const tagsSnapshot = toRaw(tags.value);
  try {
    await saveSearchLocally(
      async (page) => {
        const service = await getApiService();
        const { posts } = await service.getPosts(
          toRaw({
            limit: toRaw(postsStore.postListFetchLimit),
            page,
            tags: tagsSnapshot,
            blacklist: toRaw(blacklist.tags),
            blacklistMode: toRaw(blacklist.mode),
            auth: toRaw(account.auth),
            userId: toRaw(account.userId),
            baseUrl: toRaw(urlStore.e621Url),
            mode: toRaw(siteMode.activeMode),
            unified: siteMode.isUnified
              ? buildUnifiedFetchArgs(main.$state)
              : undefined,
          }),
        );
        return posts;
      },
      { concurrency: 2, signal },
    );
  } finally {
    searchSaving.value = false;
    searchSaveAbort = null;
  }
};

const loadLocalWithResume = async () => {
  const pendingFocus = takePendingLocalFocusPath();
  const target = pendingFocus
    ? await findLocalPathTarget(
        pendingFocus,
        toRaw(tags.value),
        toRaw(postsStore.postListFetchLimit),
      )
    : await findLocalResumeTarget(
        toRaw(tags.value),
        toRaw(postsStore.postListFetchLimit),
      );
  const pagesToLoad = target ? Math.max(target.page, 1) : 1;
  for (let i = 0; i < pagesToLoad; i++) {
    await loadNextPage();
    if (
      target &&
      posts.value.some((post) => post.__meta?.localPath === target.path)
    ) {
      break;
    }
  }
  if (
    target &&
    posts.value.some((post) => post.__meta?.localPath === target.path)
  ) {
    restorePath.value = target.path;
    restoreVideoTime.value =
      pendingFocus || !("videoTime" in target)
        ? undefined
        : (target as { videoTime?: number }).videoTime;
  }
};

onMounted(() => {
  if (siteMode.isLocal) {
    void loadLocalWithResume();
  } else {
    loadNextPage();
  }
});

const { historyEntries, addHistoryEntry, removeHistoryEntry } =
  useHistory();

const suggestedTags = ref<ITag[]>([]);
const suggestTags = async () => {
  const settingsSuggestedTagsCount = postsStore.sidebarSuggestionLimit;
  if (!posts.value.length) {
    suggestedTags.value = [];
    return;
  }
  if (siteMode.isLocal) {
    const counts = new Map<string, ITag>();
    for (const post of posts.value) {
      for (const [category, names] of Object.entries(post.tags)) {
        if (!Array.isArray(names)) continue;
        for (const name of names) {
          const key = `${category}:${name}`;
          const prev = counts.get(key);
          if (prev) {
            prev.post_count = (prev.post_count || 0) + 1;
          } else {
            counts.set(key, { name, category, post_count: 1 });
          }
        }
      }
    }
    suggestedTags.value = [...counts.values()]
      .sort((a, b) => (b.post_count || 0) - (a.post_count || 0))
      .slice(0, settingsSuggestedTagsCount);
    return;
  }
  const service = await getAnalyzeService();
  const occurences = await service.getTagOccurrences(JSON.parse(JSON.stringify(posts.value))); // TODO: no json
  // TODO: handle slicing and mapping in worker
  suggestedTags.value = occurences.sorted
    .slice(0, settingsSuggestedTagsCount)
    .map(
      (t) =>
      ({
        name: t.name,
        category: t.category,
        post_count: t.count,
      } as ITag),
    );
};

const onSearchClick = debounce(async () => {
  // Clear before awaiting router so an in-flight page load cannot keep
  // appending the previous query's posts across the yield.
  if (siteMode.isLocal) {
    invalidateLocalMediaIndex();
    revokeLocalBlobUrls();
    restorePath.value = null;
    restoreVideoTime.value = undefined;
  }
  clearPosts();
  await removeRouterQuery(["page"]);
  loadNextPage();
}, 50);

onBeforeUnmount(() => {
  onSearchClick.cancel();
  searchSaveAbort?.abort();
  remuxAbort?.abort();
  revokeLocalBlobUrls();
});

watch(
  query,
  (cur, prev) => {
    if (!isEqual(cur, prev)) {
      onSearchClick();
    }
  },
  { immediate: false },
);

// Browser back/forward (or typed ?page=) must reload — tags-only watch misses this.
// Skip when the URL page already sits inside the in-memory window (own savePageNumber).
watch(
  () => Number(route.query.page) || 0,
  (rawPage) => {
    const target = rawPage > 0 ? rawPage : 1;
    if (posts.value.length) {
      const first = posts.value[0].__meta.pageNumber;
      const last = posts.value[posts.value.length - 1].__meta.pageNumber;
      if (target >= first && target <= last) return;
    }
    onSearchClick.cancel();
    if (siteMode.isLocal) {
      invalidateLocalMediaIndex();
      revokeLocalBlobUrls();
      restorePath.value = null;
      restoreVideoTime.value = undefined;
    }
    clearPosts();
    void loadNextPage();
  },
);

// When the user switches site mode from the nav drawer, router.push to the
// same blank /posts route is a no-op.  Watch the store signal so we always
// reload posts after a mode change regardless of route state.
// Skip Tailspace / Flayrah: dedicated chrome, not this page (C3).
// Do not go through onSearchClick's debounce — clear immediately so the
// previous site's feed cannot linger across the 50ms wait / router await.
watch(
  () => siteMode.modeChangeCount,
  async (count) => {
    if (siteMode.isTailspace || siteMode.isFlayrah) return;
    onSearchClick.cancel();
    if (siteMode.isLocal) {
      invalidateLocalMediaIndex();
      revokeLocalBlobUrls();
      restorePath.value = null;
      restoreVideoTime.value = undefined;
    }
    clearPosts();
    await removeRouterQuery(["page"]);
    if (siteMode.isTailspace || siteMode.isFlayrah) return;
    if (count !== siteMode.modeChangeCount) return;
    if (siteMode.isLocal) {
      await loadLocalWithResume();
    } else {
      loadNextPage();
    }
  },
);

const activeOrder = computed(
  () => tags.value.find((tag) => tag.startsWith("order:")) || null,
);

const applyOrder = (orderTag: string) => {
  const withoutOrder = tags.value.filter((tag) => !tag.startsWith("order:"));
  if (orderTag === "order:newest") {
    setTags(withoutOrder);
  } else {
    setTags(
      activeOrder.value === orderTag ? withoutOrder : [...withoutOrder, orderTag],
    );
  }
  updateQuery();
};

const hasTypeTag = (typeTag: string) =>
  tags.value.some((tag) => tag.toLowerCase() === typeTag);

const toggleTypeTag = (typeTag: string) => {
  if (typeTag === "type:favorited") {
    const without = tags.value.filter(
      (tag) => tag.toLowerCase() !== "type:favorited",
    );
    setTags(hasTypeTag(typeTag) ? without : [...without, typeTag]);
  } else {
    const withoutMedia = tags.value.filter(
      (tag) =>
        tag.toLowerCase() !== "type:video" &&
        tag.toLowerCase() !== "type:still" &&
        tag.toLowerCase() !== "type:audio",
    );
    setTags(hasTypeTag(typeTag) ? withoutMedia : [...withoutMedia, typeTag]);
  }
  updateQuery();
};

type ToolbarAction = {
  key: string;
  label: string;
  active?: boolean;
  error?: boolean;
  loading?: boolean;
  disabled?: boolean;
  title?: string;
  run: () => void;
};

const toolbarActions = computed((): ToolbarAction[] => {
  const unified = (
    kind: UnifiedOrderKind,
    orderTag: string,
    label: string,
  ): ToolbarAction => {
    const support = orderSupport(siteMode.activeMode, kind, tags.value);
    return {
      key: kind,
      label,
      active: support.supported && activeOrder.value === orderTag,
      disabled: !support.supported,
      title: support.reason,
      run: support.supported ? () => applyOrder(orderTag) : () => {},
    };
  };

  const actions: ToolbarAction[] = [
    unified("score", "order:score", "Score"),
    unified("favs", "order:favcount", "Favs"),
    unified("random", "order:random", "Random"),
  ];
  if (siteMode.isInkbunny || siteMode.isFurAffinity) {
    actions.push({
      key: "newest",
      label: "Newest",
      active: activeOrder.value === "order:newest",
      run: () => applyOrder("order:newest"),
    });
  }
  const musicCapable =
    siteMode.isLocal ||
    siteMode.isFurAffinity ||
    siteMode.isInkbunny ||
    siteMode.isWeasyl ||
    siteMode.isSofurry ||
    siteMode.isUnified;
  if (siteMode.isLocal) {
    actions.push(
      {
        key: "newest",
        label: "Newest",
        active: !activeOrder.value || activeOrder.value === "order:newest",
        run: () => applyOrder("order:newest"),
      },
      {
        key: "name",
        label: "Name",
        active: activeOrder.value === "order:name",
        run: () => applyOrder("order:name"),
      },
      {
        key: "size",
        label: "Size",
        active: activeOrder.value === "order:filesize",
        run: () => applyOrder("order:filesize"),
      },
      {
        key: "video",
        label: "Video",
        active: hasTypeTag("type:video"),
        run: () => toggleTypeTag("type:video"),
      },
      {
        key: "stills",
        label: "Stills",
        active: hasTypeTag("type:still"),
        run: () => toggleTypeTag("type:still"),
      },
      {
        key: "audio",
        label: "Audio",
        active: hasTypeTag("type:audio"),
        run: () => toggleTypeTag("type:audio"),
      },
      {
        key: "duration",
        label: "Duration",
        active: activeOrder.value === "order:duration",
        run: () => applyOrder("order:duration"),
      },
      {
        key: "local-favs",
        label: "Favorited",
        active: hasTypeTag("type:favorited"),
        run: () => toggleTypeTag("type:favorited"),
      },
      {
        key: "remux-unplayable",
        label: bulkRemuxing.value ? "Cancel remux" : "Remux unplayable",
        loading: bulkRemuxing.value,
        active: bulkRemuxing.value,
        error: bulkRemuxing.value,
        title:
          "Remux unplayable videos in the current Local filter to MP4 (not queued offline; ffmpeg may need network on first use)",
        run: () => {
          void toggleBulkRemux();
        },
      },
    );
  } else if (musicCapable) {
    actions.push({
      key: "audio",
      label: "Audio",
      active: hasTypeTag("type:audio"),
      run: () => toggleTypeTag("type:audio"),
    });
  }
  if (!siteMode.isLocal) {
    actions.push(
      {
        key: "save-visible",
        label: "Save visible",
        loading: bulkSaving.value,
        disabled: !posts.value.length || bulkSaving.value || searchSaving.value,
        run: () => {
          void bulkSaveVisible();
        },
      },
      {
        key: "save-search",
        label: searchSaving.value ? "Cancel save" : "Save search",
        active: searchSaving.value,
        error: searchSaving.value,
        disabled: bulkSaving.value,
        run: () => {
          void toggleSaveSearch();
        },
      },
    );
  }
  return actions;
});

const onHistoryEntryClick = (entry: string[]) => {
  setTags(entry);
  updateQuery();
};

watch(
  () => posts.value.map((p) => p.id).join(","),
  () => {
    console.log("posts changed", posts.value.length);
    addHistoryEntry(tags.value);
    suggestTags();
  },
);

</script>

<style scoped>
.posts-toolbar {
  display: flex;
  align-items: center;
  flex-grow: 999;
  min-width: 0;
  gap: 2px;
}
.posts-toolbar-search {
  flex: 1 1 auto;
  min-width: 0;
}
.sidebar-section-header {
  cursor: pointer;
  user-select: none;
}
.unified-sidebar__label {
  margin-bottom: 4px;
  min-height: auto;
}
.unified-sidebar__source {
  min-height: auto;
}
.unified-sidebar__sites-header {
  margin-top: 8px;
}
.unified-sidebar__presets {
  min-height: auto;
}
</style>
