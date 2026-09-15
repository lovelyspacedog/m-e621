<template>
  <v-dialog v-model="dialog" scrollable max-width="600px" scrim="primary">
    <v-card v-if="current" color="secondary">
      <v-card-title class="mt-0 pt-0 mx-0 px-0">
        <v-tabs v-model="tabs">
          <v-tab value="overview">Overview</v-tab>
          <v-tab value="tags">Tags</v-tab>
          <v-tab value="description">Description</v-tab>
          <v-tab v-if="!isLocal && !isInkbunny && !isFaJournal" value="comments">Comments</v-tab>
          <v-tab v-if="!isLocal && !isInkbunny && current.has_notes" value="notes">Notes</v-tab>
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
                <div class="text-body-1">
                  <d-text :text="current.description || 'No description'" />
                </div>
              </v-card-text>
            </v-card>
          </v-tabs-window-item>
          <v-tabs-window-item v-if="!isLocal && !isInkbunny && !isFaJournal" value="comments">
            <v-card text>
              <v-card-text>
                <post-comments-panel v-if="current && tabs === 'comments'" :post="current" />
              </v-card-text>
            </v-card>
          </v-tabs-window-item>
          <v-tabs-window-item v-if="!isLocal && !isInkbunny && current.has_notes" value="notes">
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
import type { PropType} from "vue";
import { computed, defineComponent, ref, watch } from "vue";
import type { EnhancedPost } from "@/worker/ApiService";
import type { Note } from "@/worker/api";
import { useMainStore, usePostsStore, useSiteModeStore } from "@/services";
import { originAuthForPost, originModeOf, unifiedChildLabel } from "@/misc/util/postOrigin";
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
  emits: ["close", "open-post-fullscreen", "set-post-favorite", "set-post-vote"],
  setup(props, context) {
    const posts = usePostsStore();
    const siteMode = useSiteModeStore();
    const main = useMainStore();
    const originMode = computed(() =>
      originModeOf(props.current, siteMode.activeMode),
    );
    const isLocal = computed(() => siteMode.isLocal);
    const isInkbunny = computed(() => originMode.value === "inkbunny");
    const isFaJournal = computed(
      () =>
        originMode.value === "furaffinity" &&
        props.current?.__meta?.furaffinity?.kind === "journal",
    );
    const buttons = computed(() => {
      let list = siteMode.filterButtons(posts.detailsButtons);
      if (originMode.value === "inkbunny") {
        list = list.filter((button) => button !== "favorite");
      }
      if (isFaJournal.value) {
        list = list.filter((button) => button !== "favorite");
      }
      return list;
    });
    const tabs = ref("overview");
    const notes = ref<Note[]>([]);
    const notesLoading = ref(false);
    const notesError = ref<string | null>(null);
    const notesLoadedFor = ref<number | null>(null);

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

    const loadNotes = async (postId: number) => {
      if (notesLoadedFor.value === postId) return;
      notesLoading.value = true;
      notesError.value = null;
      try {
        const service = await getApiService();
        const origin = originAuthForPost(
          props.current!,
          main.$state,
          siteMode.activeMode,
        );
        const result = await service.getNotes({
          postId,
          baseUrl: origin.baseUrl,
          mode: origin.mode,
        });
        if (props.current?.id !== postId) return;
        notes.value = result;
        notesLoadedFor.value = postId;
      } catch (error: any) {
        if (props.current?.id !== postId) return;
        notesError.value = error?.message || String(error);
        notes.value = [];
      } finally {
        if (props.current?.id === postId) {
          notesLoading.value = false;
        }
      }
    };

    watch(
      () => props.current?.id,
      () => {
        tabs.value = "overview";
        notes.value = [];
        notesLoadedFor.value = null;
        notesError.value = null;
      },
    );

    watch(
      [tabs, () => props.current?.id],
      ([tab, postId]) => {
        if (!postId || isLocal.value || isInkbunny.value || isFaJournal.value) return;
        if (tab === "notes") void loadNotes(postId);
      },
    );

    const originPageUrl = computed(() =>
      props.current ? postStandaloneUrl(props.current) : "",
    );
    const originLabel = computed(() => unifiedChildLabel(originMode.value));

    return {
      buttons,
      tabs,
      tags,
      dialog,
      isLocal,
      isInkbunny,
      isFaJournal,
      notes,
      notesLoading,
      notesError,
      originPageUrl,
      originLabel,
    };
  },
});
</script>
