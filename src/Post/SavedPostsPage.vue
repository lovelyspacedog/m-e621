<template>
  <div>
    <portal to="toolbar">
      <div class="saved-toolbar">
        <div class="text-subtitle-1 font-weight-medium">Saved posts</div>
        <v-spacer />
        <v-btn
          size="small"
          variant="text"
          :loading="loading"
          :disabled="loading"
          title="Refresh"
          @click="reload"
        >
          <v-icon start>mdi-refresh</v-icon>
          Refresh
        </v-btn>
      </div>
    </portal>

    <portal to="sidebar-suggestions">
      <feed-layout-menu />
      <v-list class="pa-0 mt-2" density="compact">
        <v-list-subheader class="text-overline">Collections</v-list-subheader>
        <v-list-item
          :active="activeCollectionId == null"
          rounded="lg"
          @click="selectCollection(null)"
        >
          <v-list-item-title>All saved</v-list-item-title>
          <template #append>
            <span class="text-caption text-medium-emphasis">{{ savedPosts.count }}</span>
          </template>
        </v-list-item>
        <v-list-item
          v-for="col in savedPosts.collections"
          :key="col.id"
          :active="activeCollectionId === col.id"
          rounded="lg"
          @click="selectCollection(col.id)"
        >
          <v-list-item-title>{{ col.name }}</v-list-item-title>
          <template #append>
            <span class="text-caption text-medium-emphasis mr-1">{{ col.postKeys.length }}</span>
            <v-menu location="bottom end">
              <template #activator="{ props: menuProps }">
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  aria-label="Collection actions"
                  v-bind="menuProps"
                  @click.prevent.stop
                >
                  <v-icon size="small">mdi-dots-vertical</v-icon>
                </v-btn>
              </template>
              <v-list density="compact">
                <v-list-item @click="openEditMembership(col.id)">
                  <template #prepend>
                    <v-icon>mdi-playlist-edit</v-icon>
                  </template>
                  <v-list-item-title>Edit posts</v-list-item-title>
                </v-list-item>
                <v-list-item @click="promptRename(col.id, col.name)">
                  <template #prepend>
                    <v-icon>mdi-pencil</v-icon>
                  </template>
                  <v-list-item-title>Rename</v-list-item-title>
                </v-list-item>
                <v-list-item @click="confirmDelete(col.id, col.name)">
                  <template #prepend>
                    <v-icon>mdi-delete</v-icon>
                  </template>
                  <v-list-item-title>Delete</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </template>
        </v-list-item>
        <v-list-item rounded="lg" @click="promptCreate">
          <template #prepend>
            <v-icon size="small">mdi-plus</v-icon>
          </template>
          <v-list-item-title class="text-medium-emphasis">New collection</v-list-item-title>
        </v-list-item>
      </v-list>
    </portal>

    <v-container v-if="!loading && !posts.length" class="text-center py-12">
      <v-icon size="64" class="mb-4" color="medium-emphasis">mdi-bookmark-outline</v-icon>
      <div class="text-h6 mb-2">
        {{ activeCollectionId ? "Collection is empty" : "No saved posts" }}
      </div>
      <div class="text-body-2 text-medium-emphasis mb-4">
        <template v-if="activeCollectionId">
          Edit this collection to add bookmarked posts, or switch back to All saved.
        </template>
        <template v-else>
          Bookmark posts from any supported site to see them here. Optionally group
          them into collections (sidebar).
        </template>
      </div>
      <v-btn
        v-if="activeCollectionId"
        color="accent"
        variant="tonal"
        class="mr-2"
        @click="openEditMembership(activeCollectionId)"
      >
        Edit posts
      </v-btn>
      <v-btn
        v-else
        color="accent"
        variant="tonal"
        :to="{ name: 'Posts' }"
      >
        Go to Posts
      </v-btn>
    </v-container>

    <posts
      v-else
      :posts="posts"
      :loading="loading"
      :fullscreen-post="fullscreenPost || undefined"
      :details-post="detailsPost || undefined"
      :has-previous="false"
      :has-previous-fullscreen-post="hasPreviousFullscreenPost"
      :has-next-fullscreen-post="hasNextFullscreenPost"
      :show-pagination="false"
      page-title="Saved posts"
      @load-next="noop"
      @load-previous="noop"
      @open-post="openFullscreenPost"
      @open-post-details="openPostDetails"
      @exit-fullscreen="exitFullscreen"
      @close-details="closeDetails"
      @next-fullscreen-post="openNextFullscreenPost"
      @previous-fullscreen-post="openPreviousFullscreenPost"
      @set-post-favorite="setPostFavorite"
      @set-post-vote="setPostVote"
    />

    <v-dialog v-model="editOpen" max-width="520">
      <v-card>
        <v-card-title>Edit collection posts</v-card-title>
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-3">
            A post can belong to more than one collection. Unchecked posts stay
            in All saved.
          </p>
          <v-alert
            v-if="!savedPosts.entries.length"
            type="info"
            density="compact"
            class="mb-0"
          >
            Bookmark some posts first.
          </v-alert>
          <v-list v-else density="compact" max-height="360" class="overflow-y-auto">
            <v-list-item v-for="entry in savedPosts.entries" :key="entryKey(entry)">
              <template #prepend>
                <v-checkbox
                  :model-value="editSelected.has(entryKey(entry))"
                  hide-details
                  density="compact"
                  @update:model-value="(v) => toggleEditKey(entryKey(entry), !!v)"
                />
              </template>
              <v-list-item-title>
                {{ entry.originMode }} #{{ entry.id }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="editOpen = false">Cancel</v-btn>
          <v-btn color="primary" variant="text" :disabled="!editCollectionId" @click="saveEdit">
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <TipDialog
      :tip-id="TIP_IDS.savedPosts"
      title="Saved posts"
      v-model="savedPostsTipOpen"
    >
      <p class="mb-0">
        Saved posts are bookmarks kept across site modes — separate from each
        site’s own favorites. Group them into named collections from the sidebar
        (a post can sit in more than one). This list uses the same Layout controls
        as Posts.
      </p>
    </TipDialog>
  </div>
</template>

<script setup lang="ts">
import FeedLayoutMenu from "@/Post/FeedLayoutMenu.vue";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- registered for <posts> in template
import Posts from "@/Post/Posts.vue";
import { usePostListManager } from "@/Post/postListManager";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import {
  buildUnifiedFetchArgs,
  modeSupportsSavedPosts,
} from "@/misc/util/postOrigin";
import { blockedToolRedirectName } from "@/misc/util/blockedToolRedirect";
import {
  useMainStore,
  useSavedPostsStore,
  useSiteModeStore,
  useSnackbarStore,
} from "@/services";
import type { SavedPostEntry } from "@/services/types";
import { getApiService } from "@/worker/services";
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useHead } from "@unhead/vue";

useHead({ title: "Saved posts" });

const router = useRouter();
const siteMode = useSiteModeStore();
const savedPosts = useSavedPostsStore();
const snackbar = useSnackbarStore();
const main = useMainStore();
const { open: savedPostsTipOpen, tryOpen: trySavedPostsTip } = useTipOpen(
  TIP_IDS.savedPosts,
);
onMounted(() => trySavedPostsTip());

const activeCollectionId = ref<string | null>(null);
const editOpen = ref(false);
const editCollectionId = ref<string | null>(null);
const editSelected = ref(new Set<string>());

const noop = () => {
  /* Saved list is not paginated */
};

const entryKey = (entry: SavedPostEntry) =>
  savedPosts.keyOf(entry.originMode, entry.id);

const {
  visiblePosts: posts,
  clearPosts,
  replacePosts,
  fullscreenPost,
  detailsPost,
  loading,
  openPostDetails,
  openFullscreenPost,
  openNextFullscreenPost,
  openPreviousFullscreenPost,
  setPostFavorite,
  setPostVote,
  hasPreviousFullscreenPost,
  hasNextFullscreenPost,
} = usePostListManager({
  getSavedPageNumber() {
    return 0;
  },
  savePageNumber() {
    /* no page query for saved */
  },
  async loadPosts() {
    return [];
  },
});

const exitFullscreen = () => {
  fullscreenPost.value = null;
};
const closeDetails = () => {
  detailsPost.value = null;
};

const selectCollection = (id: string | null) => {
  activeCollectionId.value = id;
  void reload();
};

const promptCreate = () => {
  const name = window.prompt("New collection name");
  if (name == null) return;
  const col = savedPosts.createCollection(name);
  if (!col) {
    snackbar.addMessage("Name required");
    return;
  }
  activeCollectionId.value = col.id;
  openEditMembership(col.id);
};

const promptRename = (id: string, current: string) => {
  const name = window.prompt("Rename collection", current);
  if (name == null) return;
  savedPosts.renameCollection(id, name);
};

const confirmDelete = (id: string, name: string) => {
  const ok = window.confirm(`Delete collection “${name}”? Posts stay in All saved.`);
  if (!ok) return;
  savedPosts.deleteCollection(id);
  if (activeCollectionId.value === id) {
    activeCollectionId.value = null;
    void reload();
  }
};

const openEditMembership = (id: string) => {
  const col = savedPosts.collections.find((c) => c.id === id);
  editCollectionId.value = id;
  editSelected.value = new Set(col?.postKeys || []);
  editOpen.value = true;
};

const toggleEditKey = (key: string, present: boolean) => {
  const next = new Set(editSelected.value);
  if (present) next.add(key);
  else next.delete(key);
  editSelected.value = next;
};

const saveEdit = () => {
  if (!editCollectionId.value) return;
  savedPosts.replaceCollectionKeys(editCollectionId.value, [
    ...editSelected.value,
  ]);
  editOpen.value = false;
  void reload();
};

const reload = async () => {
  if (!siteMode.supportsSavedPosts) return;
  clearPosts();
  loading.value = true;
  try {
    const source = savedPosts.entriesForCollection(activeCollectionId.value);
    // Plain clones only — Pinia Proxies in entries break Comlink postMessage.
    const entries = source.map((e) => ({
      originMode: e.originMode,
      id: e.id,
      savedAt: e.savedAt,
    }));
    if (!entries.length) {
      replacePosts([]);
      return;
    }
    const service = await getApiService();
    const unified = buildUnifiedFetchArgs(main.$state, { includeDisabled: true });
    const result = await service.getPostsByIds({
      entries,
      children: unified.children,
      sharedBlacklist: unified.sharedBlacklist,
    });
    for (const warning of result.warnings || []) {
      snackbar.addMessage(warning);
    }
    replacePosts(result.posts);
  } catch (error: unknown) {
    snackbar.addMessage(error instanceof Error ? error.message : String(error));
    replacePosts([]);
  } finally {
    loading.value = false;
  }
};

const ensureSavedPostsMode = () => {
  if (!modeSupportsSavedPosts(siteMode.activeMode)) {
    router.replace({ name: blockedToolRedirectName(siteMode.activeMode) });
    return false;
  }
  return true;
};

onMounted(() => {
  if (!ensureSavedPostsMode()) return;
  reload();
});

watch(
  () => siteMode.activeMode,
  () => {
    if (!ensureSavedPostsMode()) return;
  },
);

watch(
  () => savedPosts.count,
  () => {
    if (!siteMode.supportsSavedPosts) return;
    void reload();
  },
);
</script>

<style scoped>
.saved-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
</style>
