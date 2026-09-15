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
      <v-list v-if="siteMode.isUnified" class="pa-0 mt-1 mb-2" density="compact">
        <v-list-subheader class="text-overline">Sites in this search</v-list-subheader>
        <v-list-item
          v-for="child in unifiedChildModes"
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
      </v-list>
      <v-list class="pa-0 mt-1 mb-2" density="compact">
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
        <v-list-item v-if="postsStore.cardAutoNext" class="text-medium-emphasis">
          <v-list-item-subtitle>Space pauses (feed) · slideshow (fullscreen) · j/k next/prev</v-list-item-subtitle>
        </v-list-item>
        <v-list-item v-else class="text-medium-emphasis">
          <v-list-item-subtitle>j/k next/prev · Space slideshow in fullscreen</v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <div class="text-overline" v-if="hiddenPostCount > 0">Blacklisted posts hidden: {{ hiddenPostCount }}</div>
      <div class="text-overline" v-if="suggestedTags.length > 0">Tags on this page</div>
      <suggestions :tags="suggestedTags" />
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
import { buildUnifiedFetchArgs, unifiedChildLabel } from "../misc/util/postOrigin";
import { UNIFIED_CHILD_MODES, type UnifiedChildMode } from "@/services/types";
import {
  findLocalResumeTarget,
  getLocalPostsPage,
  invalidateLocalMediaIndex,
  localStatusMessage,
  revokeLocalBlobUrls,
} from "../misc/util/localMedia";
import HistoryList from "../Tag/HistoryList.vue";
import TagSearch from "../Tag/TagSearch.vue";
import LocalFolderPicker from "../Settings/LocalFolderPicker.vue";
import { getAnalyzeService, getApiService } from "../worker/services";
import { savePostsLocally, saveSearchLocally } from "../misc/util/saveLocal";
import Suggestions from "./Suggestions.vue";
import { useDisplay } from "vuetify";

const { mdAndUp, mdAndDown } = useDisplay();
const compactToolbarActions = computed(() => mdAndDown.value);

const account = useAccountStore();
const blacklist = useBlacklistStore();
const postsStore = usePostsStore();
const siteMode = useSiteModeStore();
const snackbar = useSnackbarStore();
const main = useMainStore();
const unifiedChildModes = UNIFIED_CHILD_MODES;
const unifiedChildIcon = (mode: UnifiedChildMode) => {
  switch (mode) {
    case "e6ai": return "mdi-robot";
    case "furbooru": return "mdi-dog";
    case "inkbunny": return "mdi-rabbit";
    case "furaffinity": return "$fox";
    default: return "mdi-paw";
  }
};
const localEmptyMessage = ref(localStatusMessage("no-folder"));
const restorePath = ref<string | null>(null);
const restoreVideoTime = ref<number | undefined>(undefined);
const bulkSaving = ref(false);
const searchSaving = ref(false);
let searchSaveAbort: AbortController | null = null;
const { tags, addTag, removeTag, updateQuery, query, setTags } =
  useRouterTagManager();
const urlStore = useUrlStore();
const route = useRoute();

const { removeRouterQuery, updateRouterQuery } = useRouterQueryHelpers();

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
    console.log("save page number", page)
    if (page === 1 || !page) {
      removeRouterQuery(["page"]);
    } else {
      updateRouterQuery({
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
    if (
      page <= 1 &&
      !siteMode.isFurbooru &&
      !siteMode.isInkbunny &&
      !siteMode.isFurAffinity &&
      !siteMode.isTailspace &&
      !siteMode.isUnified
    ) {
      const built = buildTagQuery(
        toRaw(blacklist.mode),
        toRaw(blacklist.tags),
        toRaw(tags.value),
      );
      if (built.truncated) {
        snackbar.addMessage(tagQueryTruncationMessage(built.total, built.limit));
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
  const target = await findLocalResumeTarget(
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
    restoreVideoTime.value = target.videoTime;
  }
};

onMounted(() => {
  if (siteMode.isLocal) {
    void loadLocalWithResume();
  } else {
    loadNextPage();
  }
});

onBeforeUnmount(() => {
  searchSaveAbort?.abort();
  revokeLocalBlobUrls();
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
  await removeRouterQuery(["page"]);
  if (siteMode.isLocal) {
    invalidateLocalMediaIndex();
    revokeLocalBlobUrls();
    restorePath.value = null;
    restoreVideoTime.value = undefined;
  }
  clearPosts();
  loadNextPage();
}, 50);

watch(
  query,
  (cur, prev) => {
    if (!isEqual(cur, prev)) {
      console.log("query updated", { prev, cur });
      onSearchClick();
    }
  },
  { immediate: false },
);

// When the user switches site mode from the nav drawer, router.push to the
// same blank /posts route is a no-op.  Watch the store signal so we always
// reload posts after a mode change regardless of route state.
// Skip Tailspace: that mode uses TailspacePosts, not this page (C3).
watch(
  () => siteMode.modeChangeCount,
  () => {
    if (siteMode.isTailspace) return;
    onSearchClick();
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
        tag.toLowerCase() !== "type:video" && tag.toLowerCase() !== "type:still",
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
    );
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
</style>
