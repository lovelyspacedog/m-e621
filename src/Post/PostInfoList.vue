<template>
  <v-table class="text-caption" density="compact">
    <tbody>
      <tr align="right" v-if="isLocal">
        <th>Path:</th>
        <td>{{ post.sources[0] || "—" }}</td>
      </tr>
      <tr align="right" v-else>
        <th>ID:</th>
        <td>{{ post.id }}</td>
      </tr>
      <tr align="right" v-if="creatorTags.length">
        <th>{{ creatorLabel }}:</th>
        <td>
          <TagWithMenu small v-for="name in creatorTags" :key="name"
            :tag="{ name, category: creatorCategory }" />
        </td>
      </tr>
      <tr align="right" v-if="post.pools?.length">
        <th>Pools:</th>
        <td>
          <TagWithMenu small v-for="pool in post.pools" :key="pool" :tag="{ name: `pool:${pool}`, category: 'pool' }" />
        </td>
      </tr>
      <tr align="right" v-if="!isLocal">
        <th>Score:</th>
        <td class="d-flex align-center justify-end ga-1 flex-wrap">
          <span>
            {{ post.score.total }}
            ({{ post.score.up }} up - {{ post.score.down }} down)
          </span>
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
        </td>
      </tr>
      <tr align="right" v-if="!isLocal">
        <th>Comments:</th>
        <td>{{ post.comment_count }}</td>
      </tr>
      <tr align="right" v-if="!isLocal">
        <th>Notes:</th>
        <td>{{ post.has_notes ? "Yes" : "No" }}</td>
      </tr>
      <tr align="right" v-if="!isLocal && parentId">
        <th>Parent:</th>
        <td>
          <TagWithMenu small :tag="{ name: `id:${parentId}`, category: 'meta' }" />
        </td>
      </tr>
      <tr align="right" v-if="!isLocal && childIds.length">
        <th>Children:</th>
        <td>
          <TagWithMenu
            small
            v-for="childId in childIds"
            :key="childId"
            :tag="{ name: `id:${childId}`, category: 'meta' }"
          />
        </td>
      </tr>
      <tr align="right" v-if="!isLocal">
        <th>Favorites:</th>
        <td>{{ post.fav_count }}</td>
      </tr>
      <tr align="right">
        <th>File size:</th>
        <td>
          {{ fileSize }}
          ({{ post.file.size }} B)
        </td>
      </tr>
      <tr align="right">
        <th>Dimensions:</th>
        <td>
          {{ post.file.width }}x{{ post.file.height }} ({{ megapixel }} Megapixel)
        </td>
      </tr>
      <tr align="right" v-if="!isLocal">
        <th>Hash:</th>
        <td>{{ post.file.md5 }}</td>
      </tr>
      <tr align="right" v-if="!isLocal">
        <th>Rating:</th>
        <td>{{ post.rating }}</td>
      </tr>
      <tr align="right">
        <th>Sources:</th>
        <td>
          <a target="_blank" :href="source" v-for="(source, idx) in post.sources" :key="idx">
            {{ source }}
          </a>
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

const props = defineProps({
  post: {
    type: Object as PropType<Post>,
    required: true,
  },
});

const emit = defineEmits<{
  "set-post-vote": [{ postId: number; score: 1 | -1 | 0 }];
}>();

const { creatorLabel, creatorCategory } = useSiteLabels();
const isLocal = computed(() => useSiteModeStore().isLocal);
const creatorTags = computed(() => getCreatorTags(props.post.tags));
const fileSize = computed(() => prettyBytes(props.post.file.size));
const megapixel = computed(() => Math.round(((props.post.file.width * props.post.file.height) / 1000000) * 100) / 100);
const parentId = computed(() => props.post.relationships?.parent_id || null);
const childIds = computed(() => props.post.relationships?.children || []);
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
  emit("set-post-vote", { postId: props.post.id, score });
  // Roll back the optimistic highlight if the server did not change the score
  // within 5 seconds (network failure, deduplication, etc.).
  setTimeout(() => {
    if (props.post.score.total === prevTotal && voteScore.value === score) {
      voteScore.value = prevScore;
    }
  }, 5000);
};
</script>
