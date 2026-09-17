<template>
  <section class="v-toolbar elevation-0 bg-primary d-flex" :style="{ height: '75vh' }">
    <div class="w-100 d-flex flex-column align-center justify-center fill-height">

      <app-logo v-view-transition-name="'applogo'" type="face" size="200" />
      <h1 class="mb-2 text-h1 text-center">m-e621</h1>
      <div class="text-h5 landing-tagline">
        <span>A {{ adjective }} frontend for</span>
        <site-mode-switcher variant="inline" :navigate-on-change="false" />
      </div>
      <div class="landing-search">
        <tag-search
          v-view-transition-name="'tagsearch'"
          class="landing-search-field"
          :tags="tags"
          @add-tag="addTag"
          @remove-tag="removeTag"
          @confirm-search="router.push(query)"
          label="Search Tags ..."
        />
      </div>
      <div class="ma-5 d-flex flex-wrap justify-center ga-3">
        <v-btn size="x-large" color="secondary" variant="outlined" :to="query">
          Browse posts
        </v-btn>
        <v-btn
          size="x-large"
          color="secondary"
          variant="outlined"
          @click="changelogOpen = true"
        >
          Changelog
        </v-btn>
      </div>
      <ChangelogDialog v-model="changelogOpen" />
    </div>
  </section>
  <MigrationInfo />
  <About />
  <section class="ma-1">
    <v-row wrap justify="center" align="start">
      <v-col cols="12" class="pt-5">
        <div class="text-center">
          <h2 class="text-h4">Latest updates</h2>
        </div>
      </v-col>
      <v-col cols="12" md="6" xl="4" class="py-5">
        <h3 class="text-h6 text-center mb-3">Tony Pup</h3>
        <commit-timeline dense :limit="3" source="fork" />
        <v-btn
          block
          class="mt-0"
          color="primary"
          href="https://github.com/lovelyspacedog/m-e621/commits/master"
          target="_blank"
          rel="noopener"
        >
          more on GitHub
        </v-btn>
      </v-col>
      <v-col cols="12" md="6" xl="4" class="py-5">
        <h3 class="text-h6 text-center mb-3">Avoonix</h3>
        <commit-timeline dense :limit="3" source="upstream" />
        <v-btn
          block
          class="mt-0"
          color="primary"
          href="https://github.com/avoonix/material-e621/commits/master"
          target="_blank"
          rel="noopener"
        >
          more on GitHub
        </v-btn>
      </v-col>
    </v-row>
  </section>
  <Footer />
</template>

<script setup lang="ts">
import AppLogo from "../App/AppLogo.vue";
import SiteModeSwitcher from "../App/SiteModeSwitcher.vue";
import CommitTimeline from "@/About/CommitTimeline.vue";
import { useHead } from "@unhead/vue";
import TagSearch from "@/Tag/TagSearch.vue";
import About from "./About.vue";
import ChangelogDialog from "./ChangelogDialog.vue";
import Footer from "./Footer.vue";
import { computed, ref } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";
import MigrationInfo from "./MigrationInfo.vue";
import { useSiteModeStore } from "@/services/SiteModeStore";

const router = useRouter();
const siteMode = useSiteModeStore();
const changelogOpen = ref(false);

const chooseRandom = (arr: string[]) =>
  arr[Math.floor(Math.random() * arr.length)];

useHead({
  title: "m-e621",
  titleTemplate: null,
});

const adjective = chooseRandom([
  "modern",
  "delightful",
  "customizable",
  "stylish",
  "handy",
]);

const tags = ref<string[]>([]);
const query = computed<RouteLocationRaw>(() =>
  siteMode.isTailspace
    ? { name: "TailspacePosts" }
    : {
        name: "Posts",
        query: { tags: tags.value.join(" ") },
      },
);
const addTag = (tag: string) => tags.value.push(tag);
const removeTag = (tag: string) => {
  const i = tags.value.indexOf(tag);
  if (i >= 0) tags.value.splice(i, 1);
};
</script>

<style scoped>
.landing-tagline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  column-gap: 0.5em;
  row-gap: 0.35em;
  margin-bottom: 0.75rem;
  text-align: center;
}

.landing-search {
  width: min(90vw, 640px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.landing-search-field {
  flex: 1 1 auto;
  width: 100%;
}
</style>
