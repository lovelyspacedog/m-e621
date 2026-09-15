<template>
  <v-dialog :model-value="!!post" max-width="520" scrollable scrim="primary" @update:model-value="onDialogToggle">
    <v-card color="secondary">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-image-search</v-icon>
        Fluffle search
        <v-spacer />
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        <div v-if="loading" class="text-center py-6">
          <v-progress-circular indeterminate color="accent" size="40" />
          <div class="text-medium-emphasis mt-3">Searching…</div>
        </div>
        <div v-else-if="error" class="text-error py-2">{{ error }}</div>
        <div v-else-if="!results.length" class="text-medium-emphasis py-2">
          No exact or probable matches.
        </div>
        <v-list v-else bg-color="transparent" lines="two">
          <v-list-item
            v-for="item in results"
            :key="item.id"
            class="fluffle-result"
            rounded="lg"
            @click="openResult(item.url)"
          >
            <template #prepend>
              <div
                class="fluffle-thumb"
                :style="thumbStyle(item.thumbnail)"
              />
            </template>
            <v-list-item-title>
              {{ item.platform || "Unknown" }}
              <v-chip
                class="ml-2"
                size="x-small"
                :color="item.match === 'exact' ? 'success' : 'warning'"
                variant="flat"
              >
                {{ item.match }}
              </v-chip>
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ authorLabel(item) }}
            </v-list-item-subtitle>
            <template #append>
              <v-btn
                icon
                size="small"
                variant="text"
                title="Copy URL"
                @click.stop="copyResult(item.url)"
              >
                <v-icon size="small">mdi-content-copy</v-icon>
              </v-btn>
              <v-icon size="small" class="ml-1">mdi-open-in-new</v-icon>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { openUrlInNewTab } from "@/misc/util/url";
import {
  searchFluffle,
  type FluffleResult,
  type FluffleThumbnail,
} from "@/misc/util/fluffleSearch";
import { useSnackbarStore } from "@/services";
import type { EnhancedPost } from "@/worker/ApiService";
import type { PropType } from "vue";
import { defineComponent, ref, watch } from "vue";

export default defineComponent({
  name: "FluffleSearchDialog",
  props: {
    post: {
      type: Object as PropType<EnhancedPost | null>,
      default: null,
    },
  },
  emits: ["close"],
  setup(props, { emit }) {
    const snackbar = useSnackbarStore();
    const loading = ref(false);
    const error = ref("");
    const results = ref<FluffleResult[]>([]);

    const close = () => emit("close");

    const onDialogToggle = (open: boolean) => {
      if (!open) close();
    };

    const openResult = (url: string) => {
      if (url) openUrlInNewTab(url);
    };

    const copyResult = async (url: string) => {
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        snackbar.addMessage("Link copied");
      } catch {
        snackbar.addMessage("Failed to copy link");
      }
    };

    const authorLabel = (item: FluffleResult) => {
      const names = (item.authors || []).map((a) => a.name).filter(Boolean);
      return names.length ? names.join(", ") : "Unknown author";
    };

    const thumbStyle = (thumb: FluffleThumbnail | null | undefined) => {
      if (!thumb?.url) {
        return {
          backgroundColor: "rgba(255,255,255,0.08)",
        };
      }
      return {
        backgroundImage: `url(${thumb.url})`,
        backgroundSize: "cover",
        objectPosition: `${thumb.centerX}% ${thumb.centerY}%`,
        backgroundPosition: `${thumb.centerX}% ${thumb.centerY}%`,
      };
    };

    watch(
      () => props.post,
      async (post) => {
        results.value = [];
        error.value = "";
        if (!post) {
          loading.value = false;
          return;
        }
        loading.value = true;
        try {
          results.value = await searchFluffle(post);
        } catch (err) {
          error.value =
            err instanceof Error ? err.message : "Fluffle search failed";
        } finally {
          loading.value = false;
        }
      },
      { immediate: true },
    );

    return {
      loading,
      error,
      results,
      close,
      onDialogToggle,
      openResult,
      copyResult,
      authorLabel,
      thumbStyle,
    };
  },
});
</script>

<style scoped>
.fluffle-result {
  cursor: pointer;
}
.fluffle-thumb {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  margin-right: 12px;
  background-repeat: no-repeat;
  flex-shrink: 0;
}
</style>
