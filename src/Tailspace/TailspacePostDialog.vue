<template>
  <v-dialog
    v-model="open"
    fullscreen
    :scrim="false"
    transition="dialog-bottom-transition"
    @keydown.esc="$emit('close')"
  >
    <div class="ts-dialog" @click.self="$emit('close')">
      <!-- Close button -->
      <v-btn
        class="ts-dialog-close"
        icon="mdi-close"
        variant="text"
        color="white"
        size="small"
        @click="$emit('close')"
      />

      <!-- Post navigation (prev post / next post) -->
      <v-btn
        v-if="hasPrevPost"
        class="ts-nav-post ts-nav-post--prev"
        icon="mdi-skip-previous"
        variant="text"
        color="white"
        @click="$emit('navigate', prevPost!)"
      />
      <v-btn
        v-if="hasNextPost"
        class="ts-nav-post ts-nav-post--next"
        icon="mdi-skip-next"
        variant="text"
        color="white"
        @click="$emit('navigate', nextPost!)"
      />

      <!-- Main media viewer -->
      <div class="ts-dialog-main" @click.self="$emit('close')">
        <!-- Current media -->
        <div class="ts-media-wrap">
          <template v-if="currentMedia">
            <video
              v-if="currentMedia.mediaKind === 'video'"
              class="ts-media"
              :src="postMediaFull(currentMedia.token, currentMedia.fileType)"
              controls
              autoplay
              loop
              :key="currentMedia.id"
            />
            <img
              v-else
              class="ts-media"
              :src="postMediaFull(currentMedia.token, currentMedia.fileType)"
              :alt="post.title"
              :key="currentMedia.id"
            />
          </template>
        </div>

        <!-- Media strip (if multiple) -->
        <div v-if="post.media.length > 1" class="ts-strip">
          <div
            v-for="(m, i) in post.media"
            :key="m.id"
            class="ts-strip-thumb"
            :class="{ 'ts-strip-thumb--active': i === mediaIndex }"
            @click.stop="mediaIndex = i"
          >
            <video
              v-if="m.mediaKind === 'video'"
              class="ts-strip-img"
              :src="`${TAILSPACE_CDN}/post-media/${m.token}.${m.fileType}#t=0.5`"
              preload="metadata"
              muted
            />
            <img
              v-else
              class="ts-strip-img"
              :src="postMediaThumb(m.token)"
              loading="lazy"
            />
          </div>
        </div>

        <!-- Media nav arrows -->
        <v-btn
          v-if="mediaIndex > 0"
          class="ts-nav-media ts-nav-media--prev"
          icon="mdi-chevron-left"
          variant="tonal"
          color="white"
          @click.stop="mediaIndex--"
        />
        <v-btn
          v-if="currentMedia && mediaIndex < post.media.length - 1"
          class="ts-nav-media ts-nav-media--next"
          icon="mdi-chevron-right"
          variant="tonal"
          color="white"
          @click.stop="mediaIndex++"
        />
      </div>

      <!-- Info panel -->
      <div class="ts-dialog-info">
        <!-- Title + artist -->
        <div class="ts-info-header">
          <div>
            <div class="ts-info-title">{{ post.title }}</div>
            <div class="ts-info-artist">{{ post.creator.displayName }}</div>
          </div>
          <v-btn
            :href="postUrl(post.creator.username, post.id)"
            target="_blank"
            rel="noopener"
            variant="outlined"
            size="x-small"
            append-icon="mdi-open-in-new"
            class="ml-2 flex-shrink-0"
          >
            Open
          </v-btn>
        </div>

        <!-- Stats row -->
        <div class="ts-info-stats">
          <span title="Likes">
            <v-icon size="14">mdi-heart-outline</v-icon>
            {{ post.likeCount }}
          </span>
          <span title="Comments">
            <v-icon size="14">mdi-comment-outline</v-icon>
            {{ post.commentCount }}
          </span>
          <span title="Views">
            <v-icon size="14">mdi-eye-outline</v-icon>
            {{ post.viewCount.toLocaleString() }}
          </span>
          <span title="Media count" v-if="post.media.length > 1">
            <v-icon size="14">mdi-image-multiple</v-icon>
            {{ mediaIndex + 1 }} / {{ post.media.length }}
          </span>
        </div>

        <!-- Tags -->
        <div v-if="post.tags.length" class="ts-info-tags">
          <v-chip
            v-for="tag in post.tags"
            :key="tag.id"
            size="x-small"
            variant="tonal"
            class="mr-1 mb-1"
          >
            {{ tag.name }}
          </v-chip>
        </div>

        <!-- Date -->
        <div class="ts-info-date text-caption text-medium-emphasis mt-1">
          {{ formatDate(post.releasedAt) }}
        </div>

        <!-- Comments -->
        <div class="ts-comments">
          <div class="ts-comments-header">
            Comments
            <span v-if="post.commentCount" class="ts-comments-count">{{ post.commentCount }}</span>
          </div>

          <div v-if="!post.allowComments" class="ts-comments-empty">
            Comments are disabled on this post.
          </div>
          <div v-else-if="commentsLoading" class="ts-comments-empty">Loading…</div>
          <div v-else-if="commentsError" class="ts-comments-empty ts-comments-error">
            {{ commentsError }}
          </div>
          <div v-else-if="comments.length === 0" class="ts-comments-empty">
            No comments yet.
          </div>
          <div v-else class="ts-comments-list">
            <div v-for="c in comments" :key="c.id" class="ts-comment">
              <img
                v-if="c.profilePictureToken"
                class="ts-comment-avatar"
                :src="profilePhoto(c.profilePictureToken)"
                :alt="c.username"
                loading="lazy"
              />
              <div v-else class="ts-comment-avatar ts-comment-avatar--placeholder">
                <v-icon size="16">mdi-account</v-icon>
              </div>
              <div class="ts-comment-body">
                <div class="ts-comment-meta">
                  <span class="ts-comment-user">{{ c.username }}</span>
                  <span v-if="c.timestamp" class="ts-comment-time">
                    {{ formatCommentTime(c.timestamp) }}
                  </span>
                </div>
                <div class="ts-comment-text">{{ c.comment }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  getPostComments,
  postMediaFull,
  postMediaThumb,
  postUrl,
  profilePhoto,
  TAILSPACE_CDN,
  type TailspaceComment,
  type TailspacePost,
} from "@/worker/tailspace/api";

const props = defineProps<{
  post: TailspacePost;
  allPosts: TailspacePost[];
}>();

const emit = defineEmits<{
  close: [];
  navigate: [post: TailspacePost];
}>();

const open = ref(true);
const mediaIndex = ref(0);
const comments = ref<TailspaceComment[]>([]);
const commentsLoading = ref(false);
const commentsError = ref<string | null>(null);

watch(() => props.post, () => {
  mediaIndex.value = 0;
  loadComments();
}, { immediate: true });
watch(open, (v) => { if (!v) emit("close"); });

const currentMedia = computed(() => props.post.media[mediaIndex.value] ?? null);

const currentIndex = computed(() =>
  props.allPosts.findIndex((p) => p.id === props.post.id),
);
const prevPost = computed(() =>
  currentIndex.value > 0 ? props.allPosts[currentIndex.value - 1] : null,
);
const nextPost = computed(() =>
  currentIndex.value < props.allPosts.length - 1
    ? props.allPosts[currentIndex.value + 1]
    : null,
);
const hasPrevPost = computed(() => prevPost.value !== null);
const hasNextPost = computed(() => nextPost.value !== null);

async function loadComments() {
  comments.value = [];
  commentsError.value = null;
  if (!props.post.allowComments) {
    commentsLoading.value = false;
    return;
  }
  commentsLoading.value = true;
  try {
    const res = await getPostComments(props.post.creator.username, props.post.id);
    comments.value = res.comments || [];
  } catch (e: unknown) {
    commentsError.value = e instanceof Error ? e.message : "Failed to load comments.";
  } finally {
    commentsLoading.value = false;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
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
</script>

<style scoped>
.ts-dialog {
  position: relative;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Close / post nav ── */
.ts-dialog-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
}

.ts-nav-post {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
}
.ts-nav-post--prev { left: 4px; }
.ts-nav-post--next { right: 4px; }

/* ── Main media area ── */
.ts-dialog-main {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-height: 0;
}

.ts-media-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex: 1;
  min-height: 0;
  padding: 0 56px; /* room for nav arrows */
}

.ts-media {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
}

/* ── Media strip ── */
.ts-strip {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  overflow-x: auto;
  background: rgba(0, 0, 0, 0.5);
  width: 100%;
  flex-shrink: 0;
}
.ts-strip-thumb {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  opacity: 0.55;
  border: 2px solid transparent;
  transition: opacity 0.12s, border-color 0.12s;
}
.ts-strip-thumb--active {
  opacity: 1;
  border-color: rgba(var(--v-theme-primary), 1);
}
.ts-strip-thumb:hover:not(.ts-strip-thumb--active) {
  opacity: 0.85;
}
.ts-strip-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ── Media nav arrows ── */
.ts-nav-media {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}
.ts-nav-media--prev { left: 4px; }
.ts-nav-media--next { right: 4px; }

/* ── Info panel ── */
.ts-dialog-info {
  background: rgba(20, 20, 20, 0.95);
  padding: 10px 14px 12px;
  flex-shrink: 0;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.ts-info-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.ts-info-title {
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.3;
  color: #fff;
}
.ts-info-artist {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.6);
  margin-top: 1px;
}
.ts-info-stats {
  display: flex;
  gap: 12px;
  font-size: 0.78rem;
  color: rgba(255,255,255,0.65);
  margin-bottom: 6px;
}
.ts-info-stats span {
  display: flex;
  align-items: center;
  gap: 3px;
}
.ts-info-tags {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 2px;
}
.ts-info-date {
  font-size: 0.72rem;
}

/* ── Comments ── */
.ts-comments {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255,255,255,0.08);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.ts-comments-header {
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ts-comments-count {
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.55;
}
.ts-comments-empty {
  font-size: 0.78rem;
  color: rgba(255,255,255,0.45);
  padding: 4px 0 8px;
}
.ts-comments-error {
  color: #f8a0a0;
}
.ts-comments-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  max-height: 280px;
  padding-right: 4px;
}
.ts-comment {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.ts-comment-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(255,255,255,0.08);
}
.ts-comment-avatar--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.45);
}
.ts-comment-body {
  min-width: 0;
  flex: 1;
}
.ts-comment-meta {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 2px;
}
.ts-comment-user {
  font-size: 0.78rem;
  font-weight: 700;
  color: rgba(255,255,255,0.9);
}
.ts-comment-time {
  font-size: 0.68rem;
  color: rgba(255,255,255,0.4);
}
.ts-comment-text {
  font-size: 0.8rem;
  line-height: 1.35;
  color: rgba(255,255,255,0.78);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Responsive: side panel on wide screens ── */
@media (min-width: 900px) {
  .ts-dialog {
    flex-direction: row;
  }
  .ts-dialog-main {
    flex: 1;
  }
  .ts-dialog-info {
    width: 280px;
    flex-shrink: 0;
    border-top: none;
    border-left: 1px solid rgba(255,255,255,0.08);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .ts-comments-list {
    max-height: none;
    flex: 1;
  }
  .ts-strip {
    flex-direction: column;
    width: 56px;
    height: auto;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 6px;
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    max-height: 70%;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.6);
  }
  .ts-strip-thumb {
    width: 48px;
    height: 48px;
  }
  .ts-nav-post--prev { left: 68px; }
  .ts-nav-post--next { right: 288px; }
}
</style>
