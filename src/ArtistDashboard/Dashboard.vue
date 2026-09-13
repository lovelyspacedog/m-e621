<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" md="8" offset-md="2">
        <v-expand-transition>
          <v-btn :to="query" class="mb-3" block color="primary" v-if="tags.length">View dashboard of {{ tags[0] }}</v-btn>
        </v-expand-transition>
        <tag-search :label="`Search ${creatorLabel}`" :tags="tags" @add-tag="addTag" @remove-tag="removeTag" />
        <!-- <v-text-field
            v-model="username"
            append-icon="mdi-send"
            @click:append="submit"
            label="Artist Tag"
          /> -->
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import TagSearch from "../Tag/TagSearch.vue";
import { useHead } from "@unhead/vue";
import { useSiteLabels } from "@/misc/util/siteLabels";
import type { RouteLocationRaw } from "vue-router";

const { creatorLabel } = useSiteLabels();
useHead({ title: computed(() => `${creatorLabel.value} Dashboard`) });

const tags = ref<string[]>([]);
const query = computed<RouteLocationRaw>(() => ({
  name: "DashboardResult",
  params: { name: tags.value[0] }
}));
const addTag = (tag: string) => tags.value = [tag];
const removeTag = () => tags.value = [];
</script>
