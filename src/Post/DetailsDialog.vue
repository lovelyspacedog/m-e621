<template>
  <v-dialog v-model="dialog" scrollable max-width="600px" scrim="primary">
    <v-card v-if="current" color="secondary">
      <v-card-title class="mt-0 pt-0 mx-0 px-0">
        <v-tabs v-model="tabs">
          <v-tab value="overview">Overview</v-tab>
          <v-tab value="tags">Tags</v-tab>
          <v-tab value="description">Description</v-tab>
          <v-tab v-if="supportsComments" value="comments">Comments</v-tab>
          <v-tab v-if="supportsNotes" value="notes">Notes</v-tab>
          <v-tab v-if="!isLocal" value="share">Share</v-tab>
        </v-tabs>
      </v-card-title>
      <v-card-text>
        <v-tabs-window v-model="tabs">
          <v-tabs-window-item value="overview">
            <v-card text>
              <v-card-text>
                <post-info-list
                  :post="current"
                  @set-post-vote="$emit('set-post-vote', $event)"
                />
              </v-card-text>
            </v-card>
          </v-tabs-window-item>
          <v-tabs-window-item value="tags">
            <v-card text>
              <v-card-text>
                <suggestions :tags="tags" />
              </v-card-text>
            </v-card>
          </v-tabs-window-item>
          <v-tabs-window-item value="description">
            <v-card text>
              <v-card-text>
                <div
                  v-if="isSofurryStory"
                  class="text-body-1 sofurry-story"
                >
                  <div v-if="sofurryStoryTitle" class="text-h6 mb-3">
                    {{ sofurryStoryTitle }}
                  </div>
                  <pre class="sofurry-story-text">{{
                    current.description || "No story text"
                  }}</pre>
                </div>
                <div v-else class="text-body-1">
                  <d-text :text="current.description || 'No description'" />
                </div>
              </v-card-text>
            </v-card>
          </v-tabs-window-item>
          <v-tabs-window-item v-if="supportsComments" value="comments">
            <v-card text>
              <v-card-text>
                <post-comments-panel v-if="current && tabs === 'comments'" :post="current" />
              </v-card-text>
            </v-card>
          </v-tabs-window-item>
          <v-tabs-window-item v-if="supportsNotes" value="notes">
            <v-card text>
              <v-card-text>
                <div v-if="notesLoading" class="text-center py-4">
                  <v-progress-circular indeterminate color="accent" size="32" />
                </div>
                <div v-else-if="notesError" class="text-medium-emphasis">
                  {{ notesError }}
                </div>
                <div v-else-if="!notes.length" class="text-medium-emphasis">
                  No notes
                </div>
                <div v-else>
                  <div v-for="note in notes" :key="note.id" class="mb-4">
                    <div class="text-caption mb-1">
                      {{ note.creator_name }}
                      · {{ note.x }},{{ note.y }}
                    </div>
                    <d-text :text="note.body" />
                  </div>
                </div>
              </v-card-text>
            </v-card>
          </v-tabs-window-item>
          <v-tabs-window-item v-if="!isLocal" value="share">
            <v-card text>
              <v-card-text>
                <link-share
                  v-if="current.file.url"
                  :post-id="current.id"
                  :raw-file-url="current.file.url"
                  :origin-url="originPageUrl"
                  :origin-label="originLabel"
                />
                <div v-else>
                  Post can't be shared at this time.
                </div>
              </v-card-text>
            </v-card>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <post-buttons
          :buttons="buttons"
          :post="current"
          @open-post-details="dialog = false"
          @open-post-fullscreen="$emit('open-post-fullscreen', $event)"
          @set-post-favorite="$emit('set-post-favorite', $event)"
          @open-fluffle-search="$emit('open-fluffle-search', $event)"
        />
        <v-btn color="primary" variant="text" @click="dialog = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import Suggestions from "./Suggestions.vue";
import DText from "../Parser/DText.vue";
import PostInfoList from "./PostInfoList.vue";
import LinkShare from "./LinkShare.vue";
import PostButtons from "@/Post/PostButtons.vue";
import PostCommentsPanel from "@/Post/PostCommentsPanel.vue";
import type { PropType } from "vue";
import { computed, defineComponent, ref, watch } from "vue";
import type { EnhancedPost } from "@/worker/ApiService";
import type { Note } from "@/worker/api";
import { useMainStore, usePostsStore, useSiteModeStore } from "@/services";
import {
  originAuthForPost,
  originModeOf,
  postFeedKey,
  unifiedChildLabel,
} from "@/misc/util/postOrigin";
import {
  modeSupportsNotes,
  postSupportsComments,
} from "@/misc/util/siteCapabilities";
import { postStandaloneUrl } from "@/misc/util/url";
import type { ITag } from "@/Tag/ITag";
import { getApiService } from "@/worker/services";

export default defineComponent({
  components: {
    Suggestions,
    DText,
    PostInfoList,
    LinkShare,
    PostButtons,
    PostCommentsPanel,
  },
  props: {
    current: {
      type: Object as PropType<EnhancedPost>,
      required: false,
    },
  },
  emits: ["close", "open-post-fullscreen", "set-post-favorite", "set-post-vote", "open-fluffle-search"],
  setup(props, context) {
    const posts = usePostsStore();
    const siteMode = useSiteModeStore();
    const main = useMainStore();
    const originMode = computed(() =>
      originModeOf(props.current, siteMode.activeMode),
    );
    const isLocal = computed(() => siteMode.isLocal);
    const supportsComments = computed(() =>
      postSupportsComments(props.current, siteMode.activeMode),
    );
    const supportsNotes = computed(
      () =>
        !!props.current?.has_notes &&
        modeSupportsNotes(originMode.value),
    );
    const buttons = computed(() =>
      siteMode.filterButtonsForPost(posts.detailsButtons, props.current),
    );
    const tabs = ref("overview");
    const notes = ref<Note[]>([]);
    const notesLoading = ref(false);
    const notesError = ref<string | null>(null);
    const notesLoadedFor = ref<string | null>(null);

    const tags = computed(() => {
      const allTags: ITag[] = [];
      if (!props.current) {
        return allTags;
      }
      for (const [category, tags] of Object.entries(props.current.tags)) {
        allTags.unshift(
          ...tags.map((tag: string) => ({
            name: tag,
            post_count: 0,
            category,
          })),
        );
      }

      return allTags;
    });

    const dialog = computed<boolean>({
      get() {
        return !!props.current;
      },
      set(val) {
        if (!val) {
          context.emit("close");
        }
      },
    });

    const loadNotes = async (feedKey: string) => {
      if (!props.current || notesLoadedFor.value === feedKey) return;
      const postId = props.current.id;
      notesLoading.value = true;
      notesError.value = null;
      try {
        const service = await getApiService();
        const origin = originAuthForPost(
          props.current,
          main.$state,
          siteMode.activeMode,
        );
        const result = await service.getNotes({
          postId,
          baseUrl: origin.baseUrl,
          mode: origin.mode,
        });
        if (!props.current || postFeedKey(props.current) !== feedKey) return;
        notes.value = result;
        notesLoadedFor.value = feedKey;
      } catch (error: unknown) {
        if (!props.current || postFeedKey(props.current) !== feedKey) return;
        notesError.value = error instanceof Error ? error.message : String(error);
        notes.value = [];
      } finally {
        if (props.current && postFeedKey(props.current) === feedKey) {
          notesLoading.value = false;
        }
      }
    };

    watch(
      () => (props.current ? postFeedKey(props.current) : null),
      () => {
        tabs.value = "overview";
        notes.value = [];
        notesLoadedFor.value = null;
        notesError.value = null;
      },
    );

    watch(
      [tabs, () => (props.current ? postFeedKey(props.current) : null)],
      ([tab, feedKey]) => {
        if (!feedKey || !supportsNotes.value) return;
        if (tab === "notes") void loadNotes(feedKey);
      },
    );

    const originPageUrl = computed(() =>
      props.current ? postStandaloneUrl(props.current) : "",
    );
    const originLabel = computed(() => unifiedChildLabel(originMode.value));
    const isSofurryStory = computed(
      () =>
        props.current?.__meta?.kind === "story" &&
        !!props.current?.__meta?.sofurry,
    );
    const sofurryStoryTitle = computed(
      () => props.current?.__meta?.sofurry?.title || "",
    );

    return {
      buttons,
      tabs,
      tags,
      dialog,
      isLocal,
      supportsComments,
      supportsNotes,
      notes,
      notesLoading,
      notesError,
      originPageUrl,
      originLabel,
      isSofurryStory,
      sofurryStoryTitle,
    };
  },
});
</script>

<style scoped>
.sofurry-story-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  margin: 0;
  line-height: 1.55;
}
</style>
