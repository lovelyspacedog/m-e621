<template>
  <div>
    <div>
      <v-chip variant="outlined" class="mr-2 mb-2 no-before-content">
        <v-icon>mdi-thumbs-up-down</v-icon>
        <span class="ml-2">
          {{ post.score.total }}
        </span>
      </v-chip>
      <v-chip variant="outlined" class="mr-2 mb-2 no-before-content">
        <v-icon>mdi-heart</v-icon>
        <span class="ml-2">
          {{ post.fav_count }}
        </span>
      </v-chip>
      <v-chip variant="outlined" class="mr-2 mb-2 no-before-content" v-if="score">
        <v-icon>mdi-counter</v-icon>
        <span class="ml-2">
          {{ score }}
        </span>
      </v-chip>
      <tag-with-menu v-for="name in creatorTags" :key="name" :tag="{ name, category: creatorCategory }" />
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
import { getCreatorTags, useSiteLabels } from "@/misc/util/siteLabels";
import TagWithMenu from "@/Tag/TagWithMenu.vue";
import type { ScoredPost } from "@/worker/AnalyzeService";
import type { Post } from "@/worker/api";
import type { PropType } from "vue";
import { computed, defineComponent } from "vue";

const isScoredPost = (post: any): post is ScoredPost => !!post.__score;

const artistColor = getTagColorFromCategory("artist");

export default defineComponent({
  props: {
    post: {
      type: Object as PropType<Post>,
      required: true,
    },
  },
  setup(props, context) {
    const { creatorCategory } = useSiteLabels();
    const creatorTags = computed(() => getCreatorTags(props.post.tags));
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
    };
  },
  components: { DateDisplay, TagWithMenu },
});
</script>
