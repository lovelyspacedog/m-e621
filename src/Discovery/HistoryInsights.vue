<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex flex-wrap align-center ga-2 mb-4">
          <h1 class="text-h5 mb-0">History Insights</h1>
          <v-spacer />
          <v-chip size="small" variant="tonal"
            >{{ history.entries.length }} searches</v-chip
          >
        </div>

        <p class="text-body-2 text-medium-emphasis mb-4">
          Tags ranked by how often they appear in your browse history (unique
          per search). This is what you look for — not what you favorite.
        </p>

        <v-alert
          v-if="!history.entries.length"
          type="info"
          density="compact"
          class="mb-4"
        >
          History is empty. Run a few searches on Posts first.
        </v-alert>

        <v-list v-else lines="one" border rounded>
          <v-list-item
            v-for="row in ranked"
            :key="row.name"
            @click="searchTag(row.name)"
          >
            <v-list-item-title>{{ row.name }}</v-list-item-title>
            <template #append>
              <span class="text-medium-emphasis">{{ row.count }}</span>
            </template>
          </v-list-item>
        </v-list>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.historyInsights"
      title="History Insights"
      v-model="tipOpen"
    >
      <p class="mb-0">
        Counts tags across your saved search history entries. Use it to spot
        themes you browse often even when you do not favorite them. Open a tag
        to search Posts.
      </p>
    </TipDialog>
  </v-container>
</template>

<script setup lang="ts">
import { useHistoryStore } from "@/services";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import { rankHistoryTags } from "@/misc/util/discoveryTools";
import { useHead } from "@unhead/vue";
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";

useHead({ title: "History Insights" });

const history = useHistoryStore();
const router = useRouter();
const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.historyInsights);

const ranked = computed(() => rankHistoryTags(history.entries, 100));

const searchTag = (tag: string) => {
  router.push({ name: "Posts", query: { tags: tag } });
};

onMounted(() => tryOpen());
</script>
