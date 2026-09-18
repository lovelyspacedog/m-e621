<template>
  <div>
    <div
      v-if="isLocal && filename"
      class="text-subtitle-2 text-truncate mb-2"
      :title="filename"
    >
      {{ filename }}
    </div>
    <div>
      <v-chip v-if="!isLocal && !isInkbunny && !isFurAffinity" variant="outlined" class="mr-2 mb-2 no-before-content">
        <v-icon>mdi-thumbs-up-down</v-icon>
        <span class="ml-2">
          {{ post.score.total }}
        </span>
      </v-chip>
      <v-chip v-if="!isLocal && !isInkbunny && !isFurAffinity" variant="outlined" class="mr-2 mb-2 no-before-content">
        <v-icon>mdi-heart</v-icon>
        <span class="ml-2">
          {{ post.fav_count }}
        </span>
      </v-chip>
      <v-chip
        v-if="isInkbunny && inkbunnyPagecount > 1"
        variant="outlined"
        class="mr-2 mb-2 no-before-content"
      >
        <v-icon>mdi-image-multiple</v-icon>
        <span class="ml-2">{{ inkbunnyPagecount }}</span>
      </v-chip>
      <v-chip variant="outlined" class="mr-2 mb-2 no-before-content" v-if="score">
        <v-icon>mdi-counter</v-icon>
        <span class="ml-2">
          {{ score }}
        </span>
      </v-chip>
      <tag-with-menu
        v-for="name in visibleCreatorTags"
        :key="name"
        :tag="{ name, category: creatorCategory }"
      />
      <v-chip
        v-if="hiddenCreatorCount > 0 || creatorsExpanded"
        class="mr-2 mb-2"
        variant="tonal"
        color="accent"
        @click.stop="creatorsExpanded = !creatorsExpanded"
      >
        {{ creatorsExpanded ? "Show less" : `+${hiddenCreatorCount} more` }}
      </v-chip>
      <template v-if="isLocal">
        <tag-with-menu
          v-for="name in localDerivedGeneral"
          :key="'derived-' + name"
          :tag="{ name, category: 'general' }"
        />
        <v-chip
          v-for="name in localExtraTags"
          :key="'extra-' + name"
          class="mr-2 mb-2"
          closable
          variant="outlined"
          @click:close="onRemoveLocalTag(name)"
        >
          {{ name }}
        </v-chip>
        <v-text-field
          v-model="tagDraft"
          class="local-tag-input mr-2 mb-2"
          density="compact"
          hide-details
          label="Add tags"
          variant="outlined"
          @keydown.enter.prevent="onAddLocalTags"
        />
      </template>
      <tag-with-menu v-for="pool in post.pools || []" :key="pool" :tag="{ name: `pool:${pool}`, category: 'pool' }" />
      <v-chip variant="outlined" class="mb-2 no-before-content">
        <v-icon>mdi-clock</v-icon>
        <span class="ml-2">
          <date-display :value="post.created_at" />
        </span>
      </v-chip>
    </div>
  </div>
</template>

<script lang="ts">
import DateDisplay from "@/ArtistDashboard/DateDisplay.vue";
import { prettyBytes } from "@/misc/util/prettyBytes";
import { getTagColorFromCategory } from "@/misc/util/utilities";
import { addLocalTags, parseLocalTags, removeLocalTag } from "@/misc/util/localMedia";
import { getCreatorTags, useSiteLabels } from "@/misc/util/siteLabels";
import { originModeOf } from "@/misc/util/postOrigin";
import { useSiteModeStore } from "@/services";
import TagWithMenu from "@/Tag/TagWithMenu.vue";
import type { ScoredPost } from "@/worker/AnalyzeService";
import type { EnhancedPost } from "@/worker/ApiService";
import type { Post } from "@/worker/api";
import type { PropType } from "vue";
import { computed, defineComponent, ref, watch } from "vue";

const isScoredPost = (post: Post): post is ScoredPost => '__score' in post;

/** Max artist/creator chips on a feed card before collapsing. */
const CREATOR_TAG_LIMIT = 6;

const artistColor = getTagColorFromCategory("artist");

export default defineComponent({
  props: {
    post: {
      type: Object as PropType<Post>,
      required: true,
    },
  },
  setup(props) {
    const { creatorCategory } = useSiteLabels();
    const siteMode = useSiteModeStore();
    const isLocal = computed(() => siteMode.isLocal);
    const isInkbunny = computed(
      () => originModeOf(props.post as EnhancedPost, siteMode.activeMode) === "inkbunny",
    );
    const isFurAffinity = computed(
      () => originModeOf(props.post as EnhancedPost, siteMode.activeMode) === "furaffinity",
    );
    const creatorTags = computed(() => getCreatorTags(props.post.tags));
    const creatorsExpanded = ref(false);
    watch(
      () => props.post.id,
      () => {
        creatorsExpanded.value = false;
      },
    );
    const visibleCreatorTags = computed(() =>
      creatorsExpanded.value
        ? creatorTags.value
        : creatorTags.value.slice(0, CREATOR_TAG_LIMIT),
    );
    const hiddenCreatorCount = computed(() =>
      Math.max(0, creatorTags.value.length - CREATOR_TAG_LIMIT),
    );
    const enhanced = computed(() => props.post as EnhancedPost);
    const inkbunnyPagecount = computed(
      () => enhanced.value.__meta?.inkbunny?.pagecount || 1,
    );
    const localPath = computed(
      () => enhanced.value.__meta?.localPath || props.post.sources?.[0] || "",
    );
    const localExtraTags = computed(
      () => enhanced.value.__meta?.localExtraTags || [],
    );
    const localDerivedGeneral = computed(() => {
      const extras = new Set(localExtraTags.value);
      return (props.post.tags.general || []).filter((name) => !extras.has(name));
    });
    const tagDraft = ref("");
    const applyExtrasToPost = (extras: string[]) => {
      const post = enhanced.value;
      if (!post.__meta) return;
      post.__meta.localExtraTags = extras;
      const derived = parseLocalTags(localPath.value).generalTags;
      post.tags.general = [...new Set([...derived, ...extras])];
    };
    const onAddLocalTags = async () => {
      if (!localPath.value || !tagDraft.value.trim()) return;
      const extras = await addLocalTags(localPath.value, tagDraft.value);
      applyExtrasToPost(extras);
      tagDraft.value = "";
    };
    const onRemoveLocalTag = async (name: string) => {
      if (!localPath.value) return;
      const extras = await removeLocalTag(localPath.value, name);
      applyExtrasToPost(extras);
    };
    const filename = computed(() => {
      if (props.post.description) return props.post.description;
      const source = props.post.sources?.[0];
      if (!source) return "";
      return source.split("/").pop() || source;
    });
    const fileSize = computed(() => prettyBytes(props.post.file.size));
    const score = computed(() => {
      if (isScoredPost(props.post)) {
        return props.post.__score;
      }
      return null;
    });
    return {
      fileSize,
      score,
      artistColor,
      creatorTags,
      creatorCategory,
      visibleCreatorTags,
      hiddenCreatorCount,
      creatorsExpanded,
      isLocal,
      isInkbunny,
      isFurAffinity,
      inkbunnyPagecount,
      filename,
      localDerivedGeneral,
      localExtraTags,
      tagDraft,
      onAddLocalTags,
      onRemoveLocalTag,
    };
  },
  components: { DateDisplay, TagWithMenu },
});
</script>

<style scoped>
.local-tag-input {
  display: inline-flex;
  max-width: 160px;
  vertical-align: middle;
}
</style>
