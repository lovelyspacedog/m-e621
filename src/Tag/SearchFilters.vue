<template>
  <v-list-item>
    <div class="d-flex flex-column flex-md-row fill-width" style="gap: 8px;">
      <v-select v-model="sortBy" item-title="name" item-value="tag" hide-details variant="outlined" label="Sort by"
        :items="sortTagItems" class="fill-width shrink" />
      <v-select
        v-if="showRatingFilter"
        v-model="rating"
        item-title="name"
        item-value="tag"
        hide-details
        variant="outlined"
        label="Rating"
        :items="ratingTagItems"
        multiple
        class="fill-width shrink"
      />
    </div>
  </v-list-item>
</template>

<script lang="ts">
// https://e621.net/help/cheatsheet
const e621SortTags = [
  { tag: null, name: "Date (newest first) - Default" }, // default
  { tag: "order:random", name: "Random" },
  { tag: "order:id", name: "Date (oldest first)" },
  { tag: "order:rank", name: "Hot (hottest first)" },
  { tag: "order:change", name: "Change (most recent first)" },

  { tag: "order:score", name: "Score (highest first)" },
  { tag: "order:score_asc", name: "Score (lowest first)" },
  { tag: "order:favcount", name: "Favorites (most first)" },
  { tag: "order:favcount_asc", name: "Favorites (least first)" },
  { tag: "order:tagcount", name: "Tags (most first)" },
  { tag: "order:tagcount_asc", name: "Tags (least first)" },
  { tag: "order:comment_count", name: "Comments (most first)" },
  { tag: "order:comment_count_asc", name: "Comments (least first)" },
  { tag: "order:comment_bumped", name: "Comments (newest first)" },
  { tag: "order:comment_bumped_asc", name: "Comments (oldest first)" },
  { tag: "order:mpixels", name: "Resolution (largest first)" },
  { tag: "order:mpixels_asc", name: "Resolution (smallest first)" },
  { tag: "order:filesize", name: "Filesize (largest first)" },
  { tag: "order:filesize_asc", name: "Filesize (smallest first)" },
  { tag: "order:landscape", name: "Aspect Ratio (widest first)" },
  { tag: "order:portrait", name: "Aspect Ratio (tallest first)" },
  { tag: "order:duration", name: "Video Duration (longest first)" },
  { tag: "order:duration_asc", name: "Video Duration (shortest first)" },

  { tag: "order:chartags", name: "Character Tags (most first)" },
  { tag: "order:chartags_asc", name: "Character Tags (least first)" },
  { tag: "order:arttags", name: "Artist Tags (most first)" },
  { tag: "order:arttags_asc", name: "Artist Tags (least first)" },
  { tag: "order:gentags", name: "General Tags (most first)" },
  { tag: "order:gentags_asc", name: "General Tags (least first)" },
  { tag: "order:copytags", name: "Copyright Tags (most first)" },
  { tag: "order:copytags_asc", name: "Copyright Tags (least first)" },
  { tag: "order:spectags", name: "Species Tags (most first)" },
  { tag: "order:spectags_asc", name: "Species Tags (least first)" },
  { tag: "order:metatags", name: "Meta Tags (most first)" },
  { tag: "order:metatags_asc", name: "Meta Tags (least first)" },
  { tag: "order:lortags", name: "Lore Tags (most first)" },
  { tag: "order:lortags_asc", name: "Lore Tags (least first)" },
];

/** Subset mapped by furbooru.mapOrderTags */
const furbooruSortTags = [
  { tag: null, name: "Relevance / default" },
  { tag: "order:random", name: "Random" },
  { tag: "order:id", name: "ID (oldest first)" },
  { tag: "order:id_desc", name: "ID (newest first)" },
  { tag: "order:rank", name: "Wilson score" },
  { tag: "order:score", name: "Score (highest first)" },
  { tag: "order:score_asc", name: "Score (lowest first)" },
  { tag: "order:favcount", name: "Favorites (most first)" },
  { tag: "order:favcount_asc", name: "Favorites (least first)" },
  { tag: "order:comment_count", name: "Comments (most first)" },
  { tag: "order:comment_count_asc", name: "Comments (least first)" },
  { tag: "order:mpixels", name: "Resolution (largest first)" },
  { tag: "order:mpixels_asc", name: "Resolution (smallest first)" },
  { tag: "order:filesize", name: "Filesize (largest first)" },
  { tag: "order:filesize_asc", name: "Filesize (smallest first)" },
  { tag: "order:duration", name: "Duration (longest first)" },
  { tag: "order:duration_asc", name: "Duration (shortest first)" },
];

/** Subset mapped by inkbunny.mapSearchTags */
const inkbunnySortTags = [
  { tag: null, name: "Default" },
  { tag: "order:newest", name: "Newest first" },
  { tag: "order:score", name: "Score (highest first)" },
  { tag: "order:random", name: "Random" },
];

const localSortTags = [
  { tag: null, name: "Date (newest first) - Default" },
  { tag: "order:random", name: "Random" },
  { tag: "order:id", name: "Date (oldest first)" },
  { tag: "order:name", name: "Name" },
  { tag: "order:filesize", name: "Filesize (largest first)" },
  { tag: "order:duration", name: "Duration (longest first)" },
];

const e621RatingTags = [
  { tag: "rating:safe", name: "Safe" },
  { tag: "rating:questionable", name: "Questionable" },
  { tag: "rating:explicit", name: "Explicit" },
];

/** Philomena uses bare rating tags; keep rating:* aliases for blacklist parity */
const furbooruRatingTags = [
  { tag: "safe", name: "Safe" },
  { tag: "suggestive", name: "Suggestive" },
  { tag: "questionable", name: "Questionable" },
  { tag: "explicit", name: "Explicit" },
];
</script>

<script setup lang="ts">
import type { PropType } from "vue";
import { computed } from "vue";
import { useSiteLabels } from "@/misc/util/siteLabels";
import { useSiteModeStore } from "@/services";

const siteMode = useSiteModeStore();
const { creatorLabel } = useSiteLabels();

const sortTagItems = computed(() => {
  const base = siteMode.isFurbooru
    ? furbooruSortTags
    : siteMode.isInkbunny
      ? inkbunnySortTags
      : siteMode.isLocal
        ? localSortTags
        : e621SortTags;
  return base.map((item) =>
    item.name.startsWith("Artist Tags")
      ? { ...item, name: item.name.replace("Artist", creatorLabel.value) }
      : item,
  );
});

const showRatingFilter = computed(() => !siteMode.isInkbunny && !siteMode.isLocal);
const ratingTagItems = computed(() =>
  siteMode.isFurbooru ? furbooruRatingTags : e621RatingTags,
);

const emit = defineEmits<{
  (e: "add-tag", tag: string): void;
  (e: "remove-tag", tag: string): void;
}>();

const props = defineProps({
  tags: {
    type: Array as PropType<string[]>,
    required: true,
  }
});

const rating = computed<string[]>({
  get() {
    const all = ratingTagItems.value.map((t) => t.tag);
    let result = [...all];
    const includedTags = props.tags.filter((t) =>
      all.includes(t) || t.startsWith("rating:"),
    );
    const excludedTags = props.tags.filter(
      (t) => t.startsWith("-") && (all.includes(t.slice(1)) || t.startsWith("-rating:")),
    );
    if (includedTags.length) {
      result = includedTags.filter((t) => all.includes(t) || t.startsWith("rating:"));
      // Map rating:x → bare tag for Furbooru display when present
      if (siteMode.isFurbooru) {
        result = result.map((t) =>
          t.startsWith("rating:") ? t.slice("rating:".length) : t,
        ).filter((t) => all.includes(t));
      }
    }
    result = result.filter((t) => !excludedTags.includes(`-${t}`) && !excludedTags.includes(`-rating:${t.replace(/^rating:/, "")}`));
    return result;
  },
  set(value) {
    const all = ratingTagItems.value.map((t) => t.tag);
    all.forEach((t) => {
      removeTag(`-${t}`);
      removeTag(t);
      if (!t.startsWith("rating:")) {
        removeTag(`-rating:${t}`);
        removeTag(`rating:${t}`);
      }
    });
    if (!value.length || value.length === all.length) return;
    if (value.length === all.length - 1) {
      const missingTag = all.find((t) => !value.includes(t));
      if (missingTag) addTag(`-${missingTag}`);
      return;
    }
    if (value.length === 1) {
      addTag(value[0]);
      return;
    }
  }
})

const sortBy = computed<string | null>({
  get() {
    return props.tags.find(t => t.startsWith("order:")) || null;
  },
  set(value) {
    props.tags.filter(t => t.startsWith("order:")).forEach(removeTag)
    if (value) {
      addTag(value);
    }
  }
})

const addTag = (tag: string) => emit("add-tag", tag);
const removeTag = (tag: string) => emit("remove-tag", tag);
</script>
