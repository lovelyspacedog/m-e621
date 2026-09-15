<template>
  <v-table class="text-caption post-info-table" density="compact">
    <tbody>
      <tr v-if="originLabel">
        <th>Site</th>
        <td class="post-info-value">{{ originLabel }}</td>
      </tr>
      <tr v-if="isLocal">
        <th>Path</th>
        <td class="post-info-value">{{ post.sources[0] || "—" }}</td>
      </tr>
      <tr v-else>
        <th>ID</th>
        <td class="post-info-value">{{ post.id }}</td>
      </tr>
      <tr v-if="creatorTags.length">
        <th>{{ creatorLabel }}</th>
        <td class="post-info-value">
          <TagWithMenu
            small
            v-for="name in creatorTags"
            :key="name"
            :tag="{ name, category: creatorCategory }"
          />
        </td>
      </tr>
      <tr v-if="post.uploader_name && isFurbooru">
        <th>Uploader</th>
        <td class="post-info-value">{{ post.uploader_name }}</td>
      </tr>
      <tr v-if="post.pools?.length">
        <th>Pools</th>
        <td class="post-info-value">
          <TagWithMenu
            small
            v-for="pool in post.pools"
            :key="pool"
            :tag="{ name: `pool:${pool}`, category: 'pool' }"
          />
        </td>
      </tr>
      <tr v-if="!isLocal">
        <th>{{ isInkbunny || isFurAffinity ? "Views" : "Score" }}</th>
        <td class="post-info-value">
          <div class="d-flex align-center justify-end ga-1 flex-wrap">
            <span v-if="isInkbunny || isFurAffinity">
              {{ post.score.total || "—" }}
            </span>
            <span v-else>
              {{ post.score.total }}
              ({{ post.score.up }} up − {{ post.score.down }} down)
            </span>
            <template v-if="!isInkbunny && !isFurAffinity">
              <v-btn
                size="x-small"
                variant="text"
                icon="mdi-arrow-up-bold"
                :color="voteScore === 1 ? 'success' : undefined"
                @click="castVote(voteScore === 1 ? 0 : 1)"
              />
              <v-btn
                size="x-small"
                variant="text"
                icon="mdi-arrow-down-bold"
                :color="voteScore === -1 ? 'error' : undefined"
                @click="castVote(voteScore === -1 ? 0 : -1)"
              />
            </template>
          </div>
        </td>
      </tr>
      <tr v-if="!isLocal">
        <th>Comments</th>
        <td class="post-info-value">{{ post.comment_count }}</td>
      </tr>
      <tr v-if="!isLocal && !isFurbooru && !isInkbunny && !isFurAffinity">
        <th>Notes</th>
        <td class="post-info-value">{{ post.has_notes ? "Yes" : "No" }}</td>
      </tr>
      <tr v-if="!isLocal && parentId">
        <th>Parent</th>
        <td class="post-info-value">
          <TagWithMenu small :tag="{ name: `id:${parentId}`, category: 'meta' }" />
        </td>
      </tr>
      <tr v-if="!isLocal && childIds.length">
        <th>Children</th>
        <td class="post-info-value">
          <TagWithMenu
            small
            v-for="childId in childIds"
            :key="childId"
            :tag="{ name: `id:${childId}`, category: 'meta' }"
          />
        </td>
      </tr>
      <tr v-if="!isLocal">
        <th>Favorites</th>
        <td class="post-info-value">{{ post.fav_count }}</td>
      </tr>
      <tr>
        <th>File size</th>
        <td class="post-info-value">
          <template v-if="post.file.size > 0">
            {{ fileSize }}
            ({{ post.file.size.toLocaleString() }} B)
          </template>
          <template v-else>—</template>
        </td>
      </tr>
      <tr>
        <th>Dimensions</th>
        <td class="post-info-value">
          {{ post.file.width }}×{{ post.file.height }}
          ({{ megapixel }} MP)
          <span v-if="post.file.ext" class="text-medium-emphasis"> · {{ post.file.ext }}</span>
        </td>
      </tr>
      <tr v-if="!isLocal && post.file.md5">
        <th>{{ hashLabel }}</th>
        <td class="post-info-value post-info-hash">{{ post.file.md5 }}</td>
      </tr>
      <tr v-if="!isLocal">
        <th>Rating</th>
        <td class="post-info-value">{{ ratingLabel }}</td>
      </tr>
      <tr>
        <th>Sources</th>
        <td class="post-info-value">
          <template v-if="post.sources?.length">
            <div v-for="(source, idx) in post.sources" :key="idx" class="post-info-source">
              <a target="_blank" rel="noopener" :href="source">{{ source }}</a>
            </div>
          </template>
          <template v-else>—</template>
        </td>
      </tr>
    </tbody>
  </v-table>
</template>

<script setup lang="ts">
import type { Post } from "@/worker/api";
import type { PropType } from "vue";
import { computed, ref, watch } from "vue";
import TagWithMenu from "@/Tag/TagWithMenu.vue";
import { prettyBytes } from "@/misc/util/prettyBytes";
import { getCreatorTags, useSiteLabels } from "@/misc/util/siteLabels";
import { useSiteModeStore } from "@/services";
import type { EnhancedPost } from "@/worker/ApiService";
import { originModeOf, unifiedChildLabel } from "@/misc/util/postOrigin";

const props = defineProps({
  post: {
    type: Object as PropType<Post>,
    required: true,
  },
});

const emit = defineEmits<{
  "set-post-vote": [{ postId: number; score: 1 | -1 | 0; originMode?: string }];
}>();

const { creatorLabel, creatorCategory } = useSiteLabels();
const siteMode = useSiteModeStore();
const originMode = computed(() =>
  originModeOf(props.post as EnhancedPost, siteMode.activeMode),
);
const isLocal = computed(() => siteMode.isLocal);
const isFurbooru = computed(() => originMode.value === "furbooru");
const isInkbunny = computed(() => originMode.value === "inkbunny");
const isFurAffinity = computed(() => originMode.value === "furaffinity");
const originLabel = computed(() =>
  (props.post as EnhancedPost).__meta?.originMode
    ? unifiedChildLabel((props.post as EnhancedPost).__meta.originMode!)
    : "",
);
const creatorTags = computed(() => getCreatorTags(props.post.tags));
const fileSize = computed(() => prettyBytes(props.post.file.size));
const megapixel = computed(
  () => Math.round(((props.post.file.width * props.post.file.height) / 1000000) * 100) / 100,
);
const parentId = computed(() => props.post.relationships?.parent_id || null);
const childIds = computed(() => props.post.relationships?.children || []);
const hashLabel = computed(() => (isFurbooru.value ? "SHA-512" : "Hash"));
const ratingLabel = computed(() => {
  switch (props.post.rating) {
    case "s":
      return isInkbunny.value || isFurAffinity.value ? "General" : "Safe";
    case "q":
      return isInkbunny.value || isFurAffinity.value ? "Mature" : "Questionable";
    case "e":
      return isInkbunny.value || isFurAffinity.value ? "Adult" : "Explicit";
    default:
      return props.post.rating || "—";
  }
});

/** Client-only last vote for button highlight (API does not return own vote on posts). */
const voteScore = ref<1 | -1 | 0>(0);

watch(
  () => props.post.id,
  () => {
    voteScore.value = 0;
  },
);

const castVote = (score: 1 | -1 | 0) => {
  const prevScore = voteScore.value;
  const prevTotal = props.post.score.total;
  voteScore.value = score;
  emit("set-post-vote", {
    postId: props.post.id,
    score,
    originMode: (props.post as EnhancedPost).__meta?.originMode,
  });
  // Roll back the optimistic highlight if the server did not change the score
  // within 5 seconds (network failure, deduplication, etc.).
  setTimeout(() => {
    if (props.post.score.total === prevTotal && voteScore.value === score) {
      voteScore.value = prevScore;
    }
  }, 5000);
};
</script>

<style scoped>
.post-info-table :deep(th) {
  width: 7.5rem;
  white-space: nowrap;
  text-align: left;
  vertical-align: top;
  font-weight: 600;
  opacity: 0.75;
  padding-right: 12px !important;
}
.post-info-table :deep(td) {
  text-align: left;
  vertical-align: top;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.post-info-value {
  text-align: left !important;
}
.post-info-hash {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.7rem;
  line-height: 1.35;
}
.post-info-source + .post-info-source {
  margin-top: 4px;
}
.post-info-source a {
  word-break: break-all;
}
</style>
