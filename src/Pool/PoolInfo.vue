<template>
  <v-fade-transition mode="out-in">
    <div v-if="pool" key="content">
      <v-card color="transparent" elevation="0" style="max-width: 50vw">
        <v-card-title class="flex-column align-baseline">
          <span style="line-height: initial">{{ displayName }}</span>
          <small class="text-caption" style="line-height: initial">
            {{ pool.post_count }} Posts &bull; created by {{ pool.creator_name }}
            <span v-if="pool.category"> &bull; {{ pool.category }}</span>
          </small>
          <small
            v-if="datesCaption"
            class="text-caption text-medium-emphasis"
            style="line-height: initial"
          >
            {{ datesCaption }}
          </small>
        </v-card-title>
        <v-card-text style="max-height: 20vh; overflow-y: auto">
          <DText :text="pool.description || 'No description'" />
        </v-card-text>
        <v-card-actions>
          <v-btn
            v-if="showBrowse"
            color="accent"
            variant="text"
            :to="{ name: 'Pool', params: { id: poolId } }"
          >
            Browse pool
          </v-btn>
          <v-btn
            color="accent"
            variant="text"
            :href="siteUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open on site
          </v-btn>
        </v-card-actions>
      </v-card>
    </div>
    <div v-else-if="loading" key="loading">
      <AppLogo type="loader" />
    </div>
    <div v-else-if="error" key="error" class="text-medium-emphasis">
      {{ error }}
    </div>
  </v-fade-transition>
</template>

<script lang="ts">
import AppLogo from "@/App/AppLogo.vue";
import DText from "@/Parser/DText.vue";
import { useSiteModeStore, useUrlStore } from "@/services";
import type { Pool } from "@/worker/api";
import { getApiService } from "@/worker/services";
import { computed, defineComponent, onMounted, ref, watch } from "vue";

const formatDate = (value: Date | string | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default defineComponent({
  props: {
    poolId: {
      type: Number,
      required: true,
    },
    showBrowse: {
      type: Boolean,
      default: true,
    },
  },
  emits: {
    loaded: (_pool: Pool) => true,
    error: (_message: string) => true,
  },
  setup(props, { emit }) {
    const urlStore = useUrlStore();
    const siteMode = useSiteModeStore();
    const pool = ref<Pool>();
    const loading = ref(false);
    const error = ref<string | null>(null);

    const displayName = computed(() =>
      (pool.value?.name || "").replace(/_/g, " "),
    );
    const siteUrl = computed(
      () => `${urlStore.e621Url}pools/${props.poolId}`,
    );
    const datesCaption = computed(() => {
      if (!pool.value) return null;
      const created = formatDate(pool.value.created_at);
      const updated = formatDate(pool.value.updated_at);
      const parts: string[] = [];
      if (created) parts.push(`created ${created}`);
      if (updated && updated !== created) parts.push(`updated ${updated}`);
      return parts.length ? parts.join(" · ") : null;
    });

    const getInfo = async () => {
      try {
        loading.value = true;
        error.value = null;
        pool.value = undefined;
        const service = await getApiService();
        const result = await service.getPool({
          id: props.poolId,
          baseUrl: urlStore.e621Url,
          mode: siteMode.activeMode,
        });
        pool.value = result;
        emit("loaded", result);
      } catch (err: any) {
        const message = err?.message || String(err);
        error.value = message;
        emit("error", message);
      } finally {
        loading.value = false;
      }
    };

    onMounted(() => {
      getInfo();
    });
    watch(
      () => props.poolId,
      () => {
        getInfo();
      },
    );

    return {
      pool,
      loading,
      error,
      displayName,
      siteUrl,
      datesCaption,
    };
  },
  components: { DText, AppLogo },
});
</script>
