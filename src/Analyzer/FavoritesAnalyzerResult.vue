<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col ref="container">
        <div v-if="result">
          <div v-for="cloud in result.wordPositions" :key="cloud.category">
            <h3 class="mt-8 mb-2">
              {{ cloud.category }}
            </h3>
            <v-virtual-scroll :items="cloud.result" height="320" item-height="48">
              <template v-slot:default="{ item }">
                <v-list-item>
                  <v-list-item-title>
                    <TagLabel :tag="{ name: item.text, category: cloud.category, }" />
                  </v-list-item-title>
                  <template v-slot:append>
                    <!-- <v-btn icon="mdi-pencil" size="x-small" variant="tonal"></v-btn> -->
                    {{ item.size }}
                  </template>
                </v-list-item>
              </template>
            </v-virtual-scroll>
          </div>
        </div>
        <progress-message :value="progress" v-else />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  watchEffect,
} from "vue";
import type { IAnalyzeTagsArgs, IAnalyzeTagsResult, IProgressEvent } from "@/worker/AnalyzeService";
import { getAnalyzeService } from "@/worker/services";
import { cloneDeep, debounce } from "lodash";
import * as Comlink from "comlink";
import { useRoute } from "vue-router";
import ProgressMessage from "@/Suggester/ProgressMessage.vue";
import { useAccountStore, useUrlStore, useSiteModeStore } from "@/services";
import { useHead } from "@unhead/vue";
import TagLabel from "@/Tag/TagLabel.vue";
import { resolveFavoriteTagsQuery } from "@/misc/util/favoriteQuery";

useHead({ title: "Favorite Analyzer" });

const route = useRoute();
const progress = ref<IProgressEvent>();
const urlStore = useUrlStore();
const siteMode = useSiteModeStore();
const account = useAccountStore();

const args = computed<IAnalyzeTagsArgs>(() => {
  const username = route.query?.name?.toString() || "";
  const resolved = resolveFavoriteTagsQuery({
    mode: siteMode.activeMode,
    username,
  });
  return {
    height: window.innerHeight * 0.66,
    tags: resolved.tags,
    postLimit: 1000,
    baseUrl: urlStore.e621Url,
    mode: siteMode.activeMode,
    auth: account.auth,
    userId: account.userId,
  };
});

const result = ref<IAnalyzeTagsResult>();

let generation = 0;
const analyze = debounce(async (a: IAnalyzeTagsArgs, gen: number) => {
  const service = await getAnalyzeService();
  const r = await service.analyzeTags(
    a,
    Comlink.proxy((progressEvent) => {
      progress.value = progressEvent;
    }),
  );
  // Discard stale responses (user changed name while request was in flight)
  if (gen !== generation) return;
  result.value = r;
}, 500);

watchEffect(() => {
  const username = route.query?.name?.toString();
  // Don't run when the name query param is absent
  if (!username) return;
  const a = cloneDeep(args.value);
  analyze(a, ++generation);
});
</script>
