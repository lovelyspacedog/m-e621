<template>
  <v-container class="fill-height">
    <v-row align="center">
      <v-col class="text-center" cols="12" md="8" offset-md="2">
        <v-expand-transition>
          <v-btn
            v-if="tags.length"
            :to="query"
            class="mb-3"
            block
            color="primary"
          >
            View dashboard of {{ tags[0] }}
          </v-btn>
        </v-expand-transition>
        <tag-search
          :label="`Search ${creatorLabel}`"
          :tags="tags"
          @add-tag="addTag"
          @remove-tag="removeTag"
        />
        <div v-if="recentArtists.length" class="mt-6 text-left">
          <div class="text-subtitle-2 mb-2">Recent artists</div>
          <div class="d-flex flex-wrap ga-2">
            <v-chip
              v-for="name in recentArtists"
              :key="name"
              color="primary"
              variant="outlined"
              :to="{ name: 'DashboardResult', params: { name } }"
              closable
              @click:close.prevent="removeRecent(name)"
            >
              {{ name }}
            </v-chip>
          </div>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { useArtistDashboardStore } from "@/services";
import { useSiteLabels } from "@/misc/util/siteLabels";
import { useHead } from "@unhead/vue";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import type { RouteLocationRaw } from "vue-router";
import TagSearch from "../Tag/TagSearch.vue";

const { creatorLabel } = useSiteLabels();
useHead({ title: computed(() => `${creatorLabel.value} Dashboard`) });

const dashboardStore = useArtistDashboardStore();
const { recentArtists } = storeToRefs(dashboardStore);
const { removeRecent } = dashboardStore;

const tags = ref<string[]>([]);
const query = computed<RouteLocationRaw>(() => ({
  name: "DashboardResult",
  params: { name: tags.value[0] },
}));
const addTag = (tag: string) => (tags.value = [tag]);
const removeTag = () => (tags.value = []);
</script>
