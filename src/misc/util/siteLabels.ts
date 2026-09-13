import { computed } from "vue";
import { useMainStore } from "@/services/state";
import type { PostTags } from "@/worker/api/returnTypes";

export const useSiteLabels = () => {
  const main = useMainStore();
  const isE6ai = computed(() => main.activeMode === "e6ai");
  const creatorLabel = computed(() => (isE6ai.value ? "Director" : "Artist"));
  const creatorLabelPlural = computed(() =>
    isE6ai.value ? "Directors" : "Artists",
  );
  const creatorCategory = computed(() =>
    isE6ai.value ? "director" : "artist",
  );
  const creatorPath = computed(() =>
    isE6ai.value ? "directors" : "artists",
  );
  return {
    isE6ai,
    creatorLabel,
    creatorLabelPlural,
    creatorCategory,
    creatorPath,
  };
};

export const getCreatorTags = (tags?: PostTags): string[] =>
  tags?.director?.length ? tags.director : tags?.artist || [];

export const isCreatorCategory = (category?: string) =>
  category === "artist" || category === "director";
