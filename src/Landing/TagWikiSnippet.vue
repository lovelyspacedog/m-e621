<template>
  <section v-if="snippet" class="mt-2 mb-2">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="8" lg="6">
          <h2 class="text-h4 text-center mb-1">From the e621 Tag Wiki</h2>
          <p class="text-center text-medium-emphasis text-body-2 mb-4">
            A random tag definition each visit — first paragraph from
            <a
              class="text-primary text-decoration-underline"
              :href="homeUrl"
              target="_blank"
              rel="noopener"
              >e621.net/wiki_pages</a
            >
          </p>
          <div class="wiki-snippet text-center">
            <p class="text-h5 mb-2">
              <a
                class="text-primary text-decoration-underline"
                :href="pageUrl"
                target="_blank"
                rel="noopener"
                >{{ displayTitle }}</a
              >
            </p>
            <p class="text-body-1 mb-3 wiki-paragraph">{{ snippet.paragraph }}</p>
            <div class="d-flex flex-wrap justify-center ga-2">
              <v-btn
                color="primary"
                variant="tonal"
                :href="pageUrl"
                target="_blank"
                rel="noopener"
              >
                Open wiki page
              </v-btn>
              <v-btn
                color="primary"
                variant="tonal"
                :loading="loading"
                :disabled="loading"
                @click="refreshSnippet"
              >
                <v-icon start>mdi-refresh</v-icon>
                Another page
              </v-btn>
            </div>
          </div>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  displayWikiTitle,
  fetchRandomTagWikiSnippet,
  wikiHomeUrl,
  wikiPageUrl,
  type TagWikiSnippet,
} from "./tagWikiSnippetApi";

const snippet = ref<TagWikiSnippet | null>(null);
const loading = ref(false);
const homeUrl = wikiHomeUrl();
const pageUrl = computed(() =>
  snippet.value ? wikiPageUrl(snippet.value.title) : homeUrl,
);
const displayTitle = computed(() =>
  snippet.value ? displayWikiTitle(snippet.value.title) : "",
);

async function loadSnippet(excludeTitle?: string) {
  loading.value = true;
  try {
    const next = await fetchRandomTagWikiSnippet(excludeTitle);
    if (next) snippet.value = next;
  } catch {
    if (!snippet.value) snippet.value = null;
  } finally {
    loading.value = false;
  }
}

function refreshSnippet() {
  void loadSnippet(snippet.value?.title);
}

onMounted(() => {
  void loadSnippet();
});
</script>

<style scoped>
.wiki-paragraph {
  max-width: 36rem;
  margin-inline: auto;
  line-height: 1.45;
}
</style>
