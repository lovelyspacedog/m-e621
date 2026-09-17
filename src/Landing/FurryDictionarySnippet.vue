<template>
  <section v-if="entry" class="mt-6 mb-2">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="8" lg="6">
          <h2 class="text-h4 text-center mb-1">From The Furry Dictionary</h2>
          <p class="text-center text-medium-emphasis text-body-2 mb-4">
            A random slang entry each visit — definitions from
            <a
              class="text-primary text-decoration-underline"
              :href="homeUrl"
              target="_blank"
              rel="noopener"
              >the-furry-dictionary.avoonix.com</a
            >
          </p>
          <div class="dictionary-entry text-center">
            <p class="text-h5 mb-2">
              <a
                class="text-primary text-decoration-underline"
                :href="entryUrl"
                target="_blank"
                rel="noopener"
                >{{ entry.slug }}</a
              >
            </p>
            <p class="text-body-1 mb-3 dictionary-definition">{{ entry.preview.text }}</p>
            <div
              v-if="entry.categories.length"
              class="d-flex flex-wrap justify-center ga-2 mb-3"
            >
              <v-chip
                v-for="cat in entry.categories"
                :key="cat"
                size="small"
                variant="tonal"
                color="primary"
              >
                {{ cat }}
              </v-chip>
            </div>
            <v-btn
              color="primary"
              variant="tonal"
              :href="entryUrl"
              target="_blank"
              rel="noopener"
            >
              Open entry
            </v-btn>
          </div>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  dictionaryEntryUrl,
  dictionaryHomeUrl,
  fetchRandomFurryDictionaryEntry,
  type FurryDictionaryEntry,
} from "./furryDictionaryApi";

const entry = ref<FurryDictionaryEntry | null>(null);
const homeUrl = dictionaryHomeUrl();
const entryUrl = computed(() =>
  entry.value ? dictionaryEntryUrl(entry.value.slug) : homeUrl,
);

onMounted(async () => {
  try {
    entry.value = await fetchRandomFurryDictionaryEntry();
  } catch {
    entry.value = null;
  }
});
</script>

<style scoped>
.dictionary-definition {
  max-width: 36rem;
  margin-inline: auto;
  line-height: 1.45;
}
</style>
