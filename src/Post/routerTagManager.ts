import { useRoute } from "vue-router";
import { useRouterQueryHelpers } from "@/misc/util/utilities";
import { computed, ref, watch } from "vue";

export const useRouterTagManager = () => {
  const { updateRouterQuery } = useRouterQueryHelpers();
  const route = useRoute();
  const tempTags = ref<string[]>([]);
  const tags = computed<string[]>({
    get() {
      if (!route.query.tags) {
        return [];
      }
      const raw = route.query.tags;
      const tags = Array.isArray(raw) ? raw[0] : raw;
      if (typeof tags !== "string") return [];
      return tags.split(" ").filter((t) => t);
    },
    set(value) {
      updateRouterQuery({
        tags: value.join(" "),
      });
    },
  });
  watch(tags, () => (tempTags.value = [...tags.value]), { immediate: true });
  const updateQuery = () => {
    console.log("updating query");
    tags.value = [...tempTags.value]
  }
  const addTag = (tag: string) => {
    tempTags.value = [...tempTags.value, (tag)];
  };
  const removeTag = (tag: string) => {
    console.log("removing", tag, "from", tempTags.value);
    tempTags.value = tempTags.value.filter((t) => t !== tag);
  };
  const setTags = (tags: string[]) => {
    tempTags.value = [...tags];
  };
  return {
    tags: tempTags,
    query: tags,
    addTag,
    removeTag,
    updateQuery,
    setTags,
  };
};
