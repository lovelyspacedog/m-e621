<template>
  <div class="ts-reader">
    <!-- Header -->
    <div class="ts-reader-header">
      <div class="ts-reader-header-inner">
        <div class="ts-reader-nav">
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-arrow-left"
            :to="comicsBackTo"
          >
            {{ comicsBackLabel }}
          </v-btn>
        </div>
        <div v-if="comic" class="ts-reader-title-block">
          <h1 class="text-h6 font-weight-bold">{{ comic.name }}</h1>
          <div class="ts-reader-meta">
            <span v-if="comic.artistDisplayName">{{ comic.artistDisplayName }}</span>
            <span>{{ comic.numberOfPages }} pages</span>
            <span v-if="comic.avgStars != null" class="ts-stars-avg">
              <v-icon size="12">mdi-star</v-icon>
              {{ Number(comic.avgStars).toFixed(1) }}
            </span>
            <span class="ts-stars-rate" :title="loggedIn ? 'Your rating' : 'Log in under Account to rate'">
              <button
                v-for="n in 3"
                :key="n"
                type="button"
                class="ts-star-btn"
                :class="{ 'ts-star-btn--on': yourStars >= n }"
                :disabled="!loggedIn || starLoading"
                @click="onRate(n)"
              >
                <v-icon size="16">{{ yourStars >= n ? "mdi-star" : "mdi-star-outline" }}</v-icon>
              </button>
            </span>
            <v-btn
              v-if="comic.creatorUserId"
              size="x-small"
              variant="tonal"
              :color="following ? 'primary' : undefined"
              :loading="followLoading"
              :disabled="!loggedIn"
              @click="onToggleFollow"
            >
              {{ following ? "Following" : "Follow" }}
            </v-btn>
            <v-btn
              size="x-small"
              variant="tonal"
              :color="comicWatched ? 'accent' : undefined"
              :prepend-icon="comicWatched ? 'mdi-eye' : 'mdi-eye-outline'"
              @click="onToggleWatch"
            >
              {{ comicWatched ? "Unwatch" : "Watch" }}
            </v-btn>
            <button
              type="button"
              class="ts-reader-comments-link"
              @click="scrollToComments"
            >
              <v-icon size="12">mdi-comment-outline</v-icon>
              {{ comic.comments?.length ?? comic.commentCount ?? 0 }}
            </button>
          </div>
          <div v-if="!loggedIn" class="text-caption text-medium-emphasis mt-1">
            Log in under Account to rate, follow, or comment. Watching comics is local and does not need login.
          </div>
          <div v-else-if="actionError" class="text-caption text-error mt-1">{{ actionError }}</div>
        </div>
        <div class="ts-reader-actions">
          <v-btn-toggle
            v-if="comic"
            v-model="viewMode"
            mandatory
            density="compact"
            variant="outlined"
            divided
            class="ts-view-toggle"
          >
            <v-btn value="gallery" size="small" :title="'Gallery'">
              <v-icon size="18">mdi-view-grid</v-icon>
              <span class="ts-view-label">Gallery</span>
            </v-btn>
            <v-btn value="scroll" size="small" :title="'Scroll'">
              <v-icon size="18">mdi-view-agenda</v-icon>
              <span class="ts-view-label">Scroll</span>
            </v-btn>
          </v-btn-toggle>
          <v-btn
            v-if="comic && viewMode === 'scroll'"
            size="small"
            variant="outlined"
            :color="fullWidthScroll ? 'primary' : undefined"
            :title="fullWidthScroll ? 'Exit full width' : 'Full width'"
            @click="fullWidthScroll = !fullWidthScroll"
          >
            <v-icon size="18">mdi-arrow-expand-horizontal</v-icon>
            <span class="ts-view-label">{{ fullWidthScroll ? "Fit" : "Full width" }}</span>
          </v-btn>
          <v-btn
            v-if="comic"
            :href="comicUrl(comic.name)"
            target="_blank"
            rel="noopener"
            variant="text"
            size="small"
            append-icon="mdi-open-in-new"
          >
            Open on Tailspace
          </v-btn>
        </div>
      </div>

      <!-- Neighbor comics -->
      <div v-if="comic && (comic.previousComic || comic.nextComic)" class="ts-reader-neighbors">
        <v-btn
          v-if="comic.previousComic"
          variant="outlined"
          size="small"
          prepend-icon="mdi-chevron-left"
          :to="readerRoute(comic.previousComic.name)"
        >
          {{ comic.previousComic.name }}
        </v-btn>
        <span v-else />
        <v-btn
          v-if="comic.nextComic"
          variant="outlined"
          size="small"
          append-icon="mdi-chevron-right"
          :to="readerRoute(comic.nextComic.name)"
        >
          {{ comic.nextComic.name }}
        </v-btn>
      </div>
    </div>

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <!-- Loading -->
    <div v-if="loading && !comic" class="ts-reader-grid">
      <v-skeleton-loader v-for="n in 12" :key="n" type="image" class="ts-page-skeleton" />
    </div>

    <!-- Gallery grid (pool-like) -->
    <div v-else-if="comic && viewMode === 'gallery'" class="ts-reader-grid">
      <button
        v-for="page in visiblePages"
        :key="page.token"
        type="button"
        class="ts-page-card"
        :title="`Page ${page.pageNumber}`"
        @click="openPage(page.pageNumber)"
      >
        <div class="ts-page-thumb">
          <img
            class="ts-page-img"
            :src="comicPageThumb(comic.id, page.token)"
            loading="lazy"
            :alt="`Page ${page.pageNumber}`"
          />
          <div class="ts-page-num">{{ page.pageNumber }}</div>
          <div v-if="page.isAnimated" class="ts-page-gif">GIF</div>
        </div>
      </button>
    </div>

    <!-- Scroll mode: full pages stacked -->
    <div
      v-else-if="comic && viewMode === 'scroll'"
      class="ts-scroll"
      :class="{ 'ts-scroll--full': fullWidthScroll }"
    >
      <div
        v-for="page in visiblePages"
        :key="page.token"
        :id="`comic-page-${page.pageNumber}`"
        class="ts-scroll-page"
      >
        <button
          type="button"
          class="ts-scroll-img-btn"
          :title="`Page ${page.pageNumber}`"
          @click="openPage(page.pageNumber)"
        >
          <img
            class="ts-scroll-img"
            :src="comicPageFull(comic.id, page.token, page.fileType)"
            loading="lazy"
            decoding="async"
            :alt="`Page ${page.pageNumber}`"
            :width="page.widthPx || undefined"
            :height="page.heightPx || undefined"
          />
        </button>
        <div class="ts-scroll-caption">Page {{ page.pageNumber }}</div>
        <p v-if="page.description" class="ts-scroll-desc">{{ page.description }}</p>
      </div>

      <div class="ts-scroll-end">
        <v-btn
          variant="outlined"
          size="small"
          prepend-icon="mdi-arrow-up"
          @click="scrollToTop"
        >
          To top
        </v-btn>
        <div v-if="comic.previousComic || comic.nextComic" class="ts-scroll-neighbors">
          <v-btn
            v-if="comic.previousComic"
            variant="text"
            size="small"
            prepend-icon="mdi-chevron-left"
            :to="readerRoute(comic.previousComic.name)"
          >
            {{ comic.previousComic.name }}
          </v-btn>
          <v-btn
            v-if="comic.nextComic"
            variant="text"
            size="small"
            append-icon="mdi-chevron-right"
            :to="readerRoute(comic.nextComic.name)"
          >
            {{ comic.nextComic.name }}
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Page-chunk pagination (gallery + scroll) -->
    <div
      v-if="comic && chunkCount > 1 && (viewMode === 'gallery' || viewMode === 'scroll')"
      class="ts-chunk-pagination"
    >
      <v-btn
        :disabled="chunkPage <= 1"
        variant="outlined"
        size="small"
        icon="mdi-chevron-left"
        @click="changeChunk(chunkPage - 1)"
      />
      <template v-for="(p, i) in chunkButtons" :key="`${p}-${i}`">
        <v-btn
          v-if="p !== '...'"
          :variant="p === chunkPage ? 'flat' : 'text'"
          :color="p === chunkPage ? 'primary' : undefined"
          size="small"
          min-width="36"
          @click="changeChunk(Number(p))"
        >
          {{ p }}
        </v-btn>
        <span v-else class="ts-chunk-ellipsis">…</span>
      </template>
      <v-btn
        :disabled="chunkPage >= chunkCount"
        variant="outlined"
        size="small"
        icon="mdi-chevron-right"
        @click="changeChunk(chunkPage + 1)"
      />
      <span class="ts-chunk-range">{{ chunkRangeLabel }}</span>
    </div>

    <!-- Comments -->
    <div v-if="comic" id="comic-comments" class="ts-comic-comments">
      <div class="ts-comic-comments-header">
        <h2 class="text-subtitle-1 font-weight-bold mb-0">Comments</h2>
        <span class="ts-comic-comments-count">{{ sortedComments.length }}</span>
      </div>
      <div v-if="!(sortedComments.length)" class="ts-comic-comments-empty">
        No comments yet.
      </div>
      <div v-else class="ts-comic-comments-list">
        <div v-for="c in sortedComments" :key="c.id" class="ts-comic-comment">
          <img
            v-if="c.profilePictureToken"
            class="ts-comic-comment-avatar"
            :src="profilePhoto(c.profilePictureToken)"
            :alt="c.username"
            loading="lazy"
          />
          <div v-else class="ts-comic-comment-avatar ts-comic-comment-avatar--placeholder">
            <v-icon size="16">mdi-account</v-icon>
          </div>
          <div class="ts-comic-comment-body">
            <div class="ts-comic-comment-meta">
              <span class="ts-comic-comment-user">{{ c.username }}</span>
              <span v-if="c.timestamp" class="ts-comic-comment-time">
                {{ formatCommentTime(c.timestamp) }}
              </span>
            </div>
            <div class="ts-comic-comment-text">{{ c.comment }}</div>
          </div>
        </div>
      </div>
      <div class="ts-comment-composer mt-4">
        <v-textarea
          v-model="commentDraft"
          variant="filled"
          density="compact"
          rows="2"
          auto-grow
          hide-details
          :disabled="!loggedIn || commentSending"
          :placeholder="loggedIn ? 'Write a comment…' : 'Log in under Account to comment'"
        />
        <v-btn
          class="mt-2"
          size="small"
          color="accent"
          variant="tonal"
          :disabled="!loggedIn || !commentDraft.trim()"
          :loading="commentSending"
          @click="onSendComment"
        >
          Post comment
        </v-btn>
      </div>
    </div>

    <!-- Fullscreen page viewer -->
    <v-dialog
      v-model="viewerOpen"
      fullscreen
      :scrim="false"
      transition="dialog-bottom-transition"
      @keydown.esc="closeViewer"
    >
      <div
        v-if="comic && currentPage"
        class="ts-viewer"
        tabindex="0"
        ref="viewerEl"
        @keydown="onViewerKey"
        @click.self="closeViewer"
      >
        <v-btn
          class="ts-viewer-close"
          icon="mdi-close"
          variant="text"
          color="white"
          size="small"
          @click="closeViewer"
        />

        <v-btn
          v-if="pageIndex > 0"
          class="ts-viewer-nav ts-viewer-nav--prev"
          icon="mdi-chevron-left"
          variant="tonal"
          color="white"
          @click.stop="goPage(pageIndex - 1)"
        />
        <v-btn
          v-if="pageIndex < comic.pages.length - 1"
          class="ts-viewer-nav ts-viewer-nav--next"
          icon="mdi-chevron-right"
          variant="tonal"
          color="white"
          @click.stop="goPage(pageIndex + 1)"
        />

        <div class="ts-viewer-main" @click.self="closeViewer">
          <img
            class="ts-viewer-img"
            :src="comicPageFull(comic.id, currentPage.token, currentPage.fileType)"
            :alt="`Page ${currentPage.pageNumber}`"
            :key="currentPage.token"
          />
        </div>

        <div class="ts-viewer-footer">
          <span>{{ comic.name }}</span>
          <span>Page {{ currentPage.pageNumber }} / {{ comic.pages.length }}</span>
        </div>

        <!-- Page strip -->
        <div class="ts-viewer-strip">
          <button
            v-for="(page, i) in comic.pages"
            :key="page.token"
            type="button"
            class="ts-viewer-strip-thumb"
            :class="{ 'ts-viewer-strip-thumb--active': i === pageIndex }"
            @click.stop="goPage(i)"
          >
            <img
              :src="comicPageThumb(comic.id, page.token)"
              loading="lazy"
              :alt="`Page ${page.pageNumber}`"
            />
          </button>
        </div>
      </div>
    </v-dialog>

    <TipDialog
      :tip-id="TIP_IDS.tailspaceComics"
      title="Tailspace comics"
      v-model="tailspaceComicsTipOpen"
    >
      <p class="mb-3">
        Gallery shows page thumbs; Scroll reads pages in a vertical strip
        (optional full width). Neighbor comics jump previous/next in the series.
      </p>
      <p class="mb-0">
        Rating, follow, and comments need a Tailspace login under Account.
        Watching a comic is local (eye button) and works without login.
        Federated Pools can open comics here when Tailspace comics is on under
        Sites in Pools.
      </p>
    </TipDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import {
  addComment,
  followArtist,
  getComic,
  comicUrl,
  comicPageFull,
  comicPageThumb,
  profilePhoto,
  updateStars,
  type TailspaceComicDetail,
} from "@/worker/tailspace/api";
import { useTailspaceSession } from "./useTailspaceSession";
import { useSiteModeStore, useWatchedComicsStore } from "@/services";
import {
  buildChunkButtons,
  GALLERY_CHUNK_SIZE,
  loadComicFullWidthScroll,
  loadComicViewMode,
  saveComicFullWidthScroll,
  saveComicViewMode,
  SCROLL_CHUNK_SIZE,
  type ComicReaderViewMode,
} from "@/misc/util/comicReader";

type ViewMode = ComicReaderViewMode;
const VIEW_MODE_KEY = "tailspace-comic-view-mode";
const FULL_WIDTH_KEY = "tailspace-comic-scroll-full-width";

const route = useRoute();
const router = useRouter();
const { isLoggedIn } = useTailspaceSession();
const siteMode = useSiteModeStore();
const watchedComics = useWatchedComicsStore();
const { open: tailspaceComicsTipOpen, tryOpen: tryTailspaceComicsTip } =
  useTipOpen(TIP_IDS.tailspaceComics);
onMounted(() => tryTailspaceComicsTip());
const comicsBackTo = computed(() =>
  siteMode.isUnified ? { name: "Pools" as const } : { name: "TailspaceComics" as const },
);
const comicsBackLabel = computed(() => (siteMode.isUnified ? "Pools" : "Comics"));
const loggedIn = computed(() => isLoggedIn());

const comic = ref<TailspaceComicDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const viewerOpen = ref(false);
const pageIndex = ref(0);
const viewerEl = ref<HTMLElement | null>(null);
const viewMode = ref<ViewMode>(loadComicViewMode(VIEW_MODE_KEY));
const fullWidthScroll = ref(loadComicFullWidthScroll(FULL_WIDTH_KEY));
/** 1-based chunk within gallery/scroll (not the comic page number). */
const chunkPage = ref(Number(route.query.chunk) || 1);
const yourStars = ref(0);
const starLoading = ref(false);
const following = ref(false);
const followLoading = ref(false);
const commentDraft = ref("");
const commentSending = ref(false);
const actionError = ref<string | null>(null);

const comicWatched = computed(() =>
  comic.value ? watchedComics.isWatched(comic.value.id) : false,
);

const comicWatchSnapshot = (c: TailspaceComicDetail) => ({
  pageCount: c.numberOfPages || c.pages?.length || 0,
});

const onToggleWatch = () => {
  if (!comic.value) return;
  watchedComics.toggle(comic.value.id, comic.value.name, comicWatchSnapshot(comic.value));
};

watch(viewMode, (mode) => {
  saveComicViewMode(VIEW_MODE_KEY, mode);
});

watch(fullWidthScroll, (on) => {
  saveComicFullWidthScroll(FULL_WIDTH_KEY, on);
});

const comicName = computed(() => {
  const raw = route.params.name;
  const name = Array.isArray(raw) ? raw.join("/") : String(raw || "");
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
});

const currentPage = computed(() => comic.value?.pages[pageIndex.value] ?? null);

const sortedComments = computed(() => {
  const list = [...(comic.value?.comments ?? [])];
  list.sort((a, b) => {
    const at = a.timestamp;
    const bt = b.timestamp;
    if (at == null && bt == null) return (b.id || 0) - (a.id || 0);
    if (at == null) return 1;
    if (bt == null) return -1;
    if (bt !== at) return bt - at;
    return (b.id || 0) - (a.id || 0);
  });
  return list;
});

const chunkSize = computed(() =>
  viewMode.value === "scroll" ? SCROLL_CHUNK_SIZE : GALLERY_CHUNK_SIZE,
);

const chunkCount = computed(() => {
  const total = comic.value?.pages.length ?? 0;
  if (total <= 0) return 1;
  return Math.ceil(total / chunkSize.value);
});

const visiblePages = computed(() => {
  const pages = comic.value?.pages ?? [];
  const size = chunkSize.value;
  const start = (chunkPage.value - 1) * size;
  return pages.slice(start, start + size);
});

const chunkRangeLabel = computed(() => {
  const pages = comic.value?.pages ?? [];
  if (!pages.length) return "";
  const size = chunkSize.value;
  const start = (chunkPage.value - 1) * size;
  const first = pages[start]?.pageNumber ?? start + 1;
  const last = pages[Math.min(start + size, pages.length) - 1]?.pageNumber ?? pages.length;
  return `${first}–${last} / ${pages.length}`;
});

const chunkButtons = computed(() =>
  buildChunkButtons(chunkCount.value, chunkPage.value),
);

function readerRoute(name: string) {
  return { name: "TailspaceComic", params: { name } };
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollToComments() {
  document.getElementById("comic-comments")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function formatCommentTime(ts: number) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function chunkForPageIndex(idx: number): number {
  return Math.floor(idx / chunkSize.value) + 1;
}

function syncChunkQuery(chunk: number) {
  const q = { ...route.query };
  if (chunk > 1) q.chunk = String(chunk);
  else delete q.chunk;
  router.replace({ query: q });
}

function changeChunk(p: number) {
  if (p < 1 || p > chunkCount.value || p === chunkPage.value) return;
  chunkPage.value = p;
  syncChunkQuery(p);
  scrollToTop();
}

function ensureChunkForPageNumber(pageNumber: number) {
  if (!comic.value) return;
  const idx = comic.value.pages.findIndex((p) => p.pageNumber === pageNumber);
  if (idx < 0) return;
  const needed = chunkForPageIndex(idx);
  if (needed !== chunkPage.value) {
    chunkPage.value = needed;
    syncChunkQuery(needed);
  }
}

function scrollToPage(pageNumber: number) {
  ensureChunkForPageNumber(pageNumber);
  nextTick(() => {
    document.getElementById(`comic-page-${pageNumber}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

async function loadComic(name: string) {
  if (!name) return;
  loading.value = true;
  error.value = null;
  comic.value = null;
  viewerOpen.value = false;
  try {
    comic.value = await getComic(name);
    yourStars.value = Number(comic.value.yourStars ?? 0);
    following.value = false;
    actionError.value = null;
    commentDraft.value = "";
    if (watchedComics.isWatched(comic.value.id)) {
      watchedComics.markSeen(comic.value.id, comicWatchSnapshot(comic.value));
    }
    const qPage = Number(route.query.page);
    const qChunk = Number(route.query.chunk);
    if (qPage > 0) {
      const idx = comic.value.pages.findIndex((p) => p.pageNumber === qPage);
      if (idx >= 0) {
        chunkPage.value = chunkForPageIndex(idx);
        if (viewMode.value === "scroll") {
          scrollToPage(qPage);
        } else {
          openPage(qPage);
        }
      }
    } else if (qChunk > 0) {
      chunkPage.value = Math.min(Math.max(1, qChunk), chunkCount.value);
    } else {
      chunkPage.value = 1;
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Failed to load comic.";
  } finally {
    loading.value = false;
  }
}

const onRate = async (n: number) => {
  if (!loggedIn.value || !comic.value || starLoading.value) {
    if (!loggedIn.value) actionError.value = "Log in under Account to rate.";
    return;
  }
  const next = yourStars.value === n ? 0 : n;
  starLoading.value = true;
  actionError.value = null;
  const prev = yourStars.value;
  yourStars.value = next;
  try {
    await updateStars(comic.value.id, next);
    if (comic.value) comic.value.yourStars = next;
  } catch (e) {
    yourStars.value = prev;
    actionError.value = e instanceof Error ? e.message : "Rating failed.";
  } finally {
    starLoading.value = false;
  }
};

const onToggleFollow = async () => {
  const id = comic.value?.creatorUserId;
  if (!loggedIn.value || !id || followLoading.value) {
    if (!loggedIn.value) actionError.value = "Log in under Account to follow.";
    return;
  }
  followLoading.value = true;
  actionError.value = null;
  const next = !following.value;
  following.value = next;
  try {
    const res = await followArtist(id, next ? "follow" : "unfollow");
    following.value = res.following;
  } catch (e) {
    following.value = !next;
    actionError.value = e instanceof Error ? e.message : "Follow failed.";
  } finally {
    followLoading.value = false;
  }
};

const onSendComment = async () => {
  const text = commentDraft.value.trim();
  if (!loggedIn.value || !comic.value || !text || commentSending.value) return;
  commentSending.value = true;
  actionError.value = null;
  try {
    await addComment({ comicId: comic.value.id, comment: text });
    commentDraft.value = "";
    comic.value = await getComic(comicName.value);
    yourStars.value = Number(comic.value.yourStars ?? yourStars.value);
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : "Comment failed.";
  } finally {
    commentSending.value = false;
  }
};

function openPage(pageNumber: number) {
  if (!comic.value) return;
  const idx = comic.value.pages.findIndex((p) => p.pageNumber === pageNumber);
  if (idx < 0) return;
  pageIndex.value = idx;
  viewerOpen.value = true;
  router.replace({
    query: { ...route.query, page: String(pageNumber) },
  });
  nextTick(() => viewerEl.value?.focus());
}

function goPage(idx: number) {
  if (!comic.value) return;
  if (idx < 0 || idx >= comic.value.pages.length) return;
  pageIndex.value = idx;
  const pageNumber = comic.value.pages[idx].pageNumber;
  router.replace({
    query: { ...route.query, page: String(pageNumber) },
  });
}

function closeViewer() {
  viewerOpen.value = false;
  const q = { ...route.query };
  delete q.page;
  router.replace({ query: q });
}

function onViewerKey(e: KeyboardEvent) {
  if (e.key === "ArrowLeft" || e.key === "a") {
    e.preventDefault();
    goPage(pageIndex.value - 1);
  } else if (e.key === "ArrowRight" || e.key === "d" || e.key === " ") {
    e.preventDefault();
    goPage(pageIndex.value + 1);
  } else if (e.key === "Escape") {
    closeViewer();
  }
}

function onWindowKey(e: KeyboardEvent) {
  if (!viewerOpen.value) return;
  onViewerKey(e);
}

onMounted(() => window.addEventListener("keydown", onWindowKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onWindowKey));

watch(comicName, (name) => loadComic(name), { immediate: true });
// Apply Back/Forward changes to page/chunk without remounting (M26).
watch(
  () => [route.query.page, route.query.chunk] as const,
  () => {
    if (!comic.value) return;
    const qPage = Number(route.query.page);
    const qChunk = Number(route.query.chunk);
    if (qPage > 0) {
      const idx = comic.value.pages.findIndex((p) => p.pageNumber === qPage);
      if (idx >= 0) {
        ensureChunkForPageNumber(qPage);
        if (viewMode.value === "scroll") scrollToPage(qPage);
        return;
      }
    }
    if (qChunk > 0 && qChunk !== chunkPage.value) {
      changeChunk(qChunk);
    }
  },
);
watch(viewerOpen, (open) => {
  if (!open) return;
  nextTick(() => viewerEl.value?.focus());
});
watch(viewMode, (mode, prevMode) => {
  // Remap chunk so the same comic pages stay in view when chunk size changes.
  const prevSize = prevMode === "scroll" ? SCROLL_CHUNK_SIZE : GALLERY_CHUNK_SIZE;
  const startIdx = (chunkPage.value - 1) * prevSize;
  const keepPage = comic.value?.pages[startIdx]?.pageNumber;
  if (keepPage != null) {
    ensureChunkForPageNumber(keepPage);
  } else if (chunkPage.value > chunkCount.value) {
    chunkPage.value = Math.max(1, chunkCount.value);
    syncChunkQuery(chunkPage.value);
  }
  if (mode !== "scroll") return;
  const qPage = Number(route.query.page);
  if (qPage > 0) scrollToPage(qPage);
});
watch(chunkCount, (n) => {
  if (!comic.value) return;
  if (chunkPage.value > n) {
    chunkPage.value = n;
    syncChunkQuery(n);
  }
});
</script>

<style scoped>
.ts-reader {
  min-height: 100%;
  padding-bottom: 2rem;
}

.ts-reader-header {
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  margin-bottom: 0.75rem;
}
.ts-reader-header-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  max-width: 1400px;
  margin: 0 auto;
}
.ts-reader-title-block {
  flex: 1;
  min-width: 180px;
  text-align: center;
}
.ts-reader-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  font-size: 0.78rem;
  opacity: 0.65;
  margin-top: 2px;
}
.ts-reader-meta span,
.ts-reader-comments-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.ts-reader-comments-link {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0;
  cursor: pointer;
  opacity: 0.85;
}
.ts-reader-comments-link:hover {
  opacity: 1;
  text-decoration: underline;
}
.ts-stars-rate {
  display: inline-flex;
  align-items: center;
}
.ts-star-btn {
  background: transparent;
  border: 0;
  padding: 0 1px;
  color: inherit;
  cursor: pointer;
  line-height: 1;
  opacity: 0.85;
}
.ts-star-btn--on {
  color: #ffc107;
  opacity: 1;
}
.ts-star-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.ts-reader-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}
.ts-view-toggle {
  flex-shrink: 0;
}
.ts-view-label {
  margin-left: 4px;
}
@media (max-width: 599px) {
  .ts-view-label {
    display: none;
  }
}

.ts-reader-neighbors {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  max-width: 1400px;
  margin: 0.75rem auto 0;
}

.ts-reader-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  padding: 0 0.75rem;
  max-width: 1400px;
  margin: 0 auto;
}
@media (min-width: 600px) {
  .ts-reader-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
    padding: 0 1.25rem;
  }
}
@media (min-width: 960px) {
  .ts-reader-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}

/* ── Scroll mode ── */
.ts-scroll {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  padding: 0.5rem 0.75rem 2rem;
  max-width: 1100px;
  margin: 0 auto;
}
.ts-scroll--full {
  max-width: none;
  padding-left: 0;
  padding-right: 0;
}
.ts-scroll-page {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  scroll-margin-top: 12px;
}
.ts-scroll-img-btn {
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: zoom-in;
  line-height: 0;
}
.ts-scroll-img {
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: none;
  display: block;
  margin: 0 auto;
  border-radius: 4px;
  background: rgba(var(--v-border-color), 0.12);
}
.ts-scroll--full .ts-scroll-img {
  width: 100%;
  border-radius: 0;
}
.ts-scroll--full .ts-scroll-desc {
  max-width: min(720px, 100%);
  padding: 0 0.75rem;
}
.ts-scroll-caption {
  margin-top: 6px;
  font-size: 0.75rem;
  opacity: 0.55;
}
.ts-scroll-desc {
  margin: 6px 0 0;
  max-width: 720px;
  font-size: 0.85rem;
  opacity: 0.8;
  white-space: pre-wrap;
  text-align: left;
  align-self: stretch;
}
.ts-scroll-end {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 1rem 0 0.5rem;
}
.ts-scroll-neighbors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.ts-chunk-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 1rem 0.75rem 0.25rem;
  max-width: 1400px;
  margin: 0 auto;
}
.ts-chunk-ellipsis {
  opacity: 0.45;
  padding: 0 2px;
  user-select: none;
}
.ts-chunk-range {
  margin-left: 8px;
  font-size: 0.78rem;
  opacity: 0.6;
  white-space: nowrap;
}

/* ── Comments ── */
.ts-comic-comments {
  max-width: 800px;
  margin: 1.5rem auto 0;
  padding: 1rem 1.25rem 2rem;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  scroll-margin-top: 12px;
}
.ts-comic-comments-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.ts-comic-comments-count {
  font-size: 0.8rem;
  opacity: 0.55;
  font-weight: 600;
}
.ts-comic-comments-empty {
  font-size: 0.85rem;
  opacity: 0.5;
}
.ts-comic-comments-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ts-comic-comment {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.ts-comic-comment-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(var(--v-border-color), 0.2);
}
.ts-comic-comment-avatar--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.55;
}
.ts-comic-comment-body {
  min-width: 0;
  flex: 1;
}
.ts-comic-comment-meta {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 2px;
}
.ts-comic-comment-user {
  font-size: 0.85rem;
  font-weight: 700;
}
.ts-comic-comment-time {
  font-size: 0.72rem;
  opacity: 0.5;
}
.ts-comic-comment-text {
  font-size: 0.9rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  opacity: 0.9;
}

.ts-page-card {
  border: 0;
  padding: 0;
  background: rgba(var(--v-theme-surface-variant), 0.4);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.ts-page-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.ts-page-thumb {
  position: relative;
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-border-color), 0.15);
}
.ts-page-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ts-page-num {
  position: absolute;
  bottom: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
}
.ts-page-gif {
  position: absolute;
  top: 5px;
  left: 5px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 700;
}
.ts-page-skeleton {
  aspect-ratio: 2 / 3;
  border-radius: 8px;
}

/* ── Fullscreen viewer ── */
.ts-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.94);
  display: flex;
  flex-direction: column;
  outline: none;
}
.ts-viewer-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
}
.ts-viewer-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
}
.ts-viewer-nav--prev { left: 8px; }
.ts-viewer-nav--next { right: 8px; }
.ts-viewer-main {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 56px 8px;
}
.ts-viewer-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 2px;
}
.ts-viewer-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 14px;
  color: rgba(255,255,255,0.75);
  font-size: 0.8rem;
  flex-shrink: 0;
}
.ts-viewer-strip {
  display: flex;
  gap: 4px;
  padding: 6px 8px 10px;
  overflow-x: auto;
  background: rgba(0, 0, 0, 0.45);
  flex-shrink: 0;
}
.ts-viewer-strip-thumb {
  width: 48px;
  height: 72px;
  flex-shrink: 0;
  border: 2px solid transparent;
  border-radius: 4px;
  overflow: hidden;
  padding: 0;
  cursor: pointer;
  opacity: 0.55;
  background: transparent;
}
.ts-viewer-strip-thumb--active {
  opacity: 1;
  border-color: rgba(var(--v-theme-primary), 1);
}
.ts-viewer-strip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
