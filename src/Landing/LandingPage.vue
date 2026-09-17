<template>
  <!-- Single root required: router-view uses <Transition mode="out-in">.
       Multi-root fragments never finish leave → blank v-main (Scent Marks). -->
  <div class="landing-page">
    <section class="landing-hero v-toolbar elevation-0 bg-primary d-flex">
      <div class="w-100 d-flex flex-column align-center justify-center fill-height py-10 px-4">
        <app-logo v-view-transition-name="'applogo'" type="face" size="160" />
        <h1 class="mb-2 text-h1 text-center">m-e621</h1>
        <p class="text-h6 text-center landing-tagline mb-4">
          {{ tagline }}
        </p>
        <site-mode-switcher class="mb-5" variant="chips" :navigate-on-change="false" />
        <div v-if="showTagSearch" class="landing-search mb-4">
          <tag-search
            v-view-transition-name="'tagsearch'"
            class="landing-search-field"
            :tags="tags"
            @add-tag="addTag"
            @remove-tag="removeTag"
            @confirm-search="router.push(query)"
            :label="searchLabel"
          />
        </div>
        <p v-else class="text-body-2 text-center mb-4 landing-search-hint">
          Tailspace uses its own browse feed — pick a site above or open posts.
        </p>
        <div class="d-flex flex-wrap justify-center align-center ga-3">
          <v-btn size="x-large" color="secondary" variant="flat" :to="query"> Browse posts </v-btn>
          <v-btn
            size="large"
            color="white"
            variant="outlined"
            class="landing-hero-link"
            :to="{ name: 'ScentMarks' }"
          >
            Scent Marks
          </v-btn>
          <v-btn
            size="large"
            color="white"
            variant="outlined"
            class="landing-hero-link"
            @click="changelogOpen = true"
          >
            Changelog &amp; TOS
          </v-btn>
        </div>
        <ChangelogDialog v-model="changelogOpen" />
      </div>
    </section>
    <MigrationInfo />
    <FurryDictionarySnippet />
    <section class="mt-8 mb-2">
      <v-container>
        <v-row justify="center">
          <v-col cols="12" md="8" lg="6">
            <h2 class="text-h4 text-center mb-4">What it does</h2>
            <ul class="landing-capabilities">
              <li v-for="item in capabilities" :key="item">{{ item }}</li>
            </ul>
          </v-col>
        </v-row>
      </v-container>
    </section>
    <About />
    <section class="ma-1 mb-6">
      <v-row wrap justify="center" align="start">
        <v-col cols="12" class="pt-5">
          <div class="text-center">
            <h2 class="text-h4">Latest updates</h2>
            <p class="text-center text-medium-emphasis text-body-2 mt-1 mb-0">
              Recent commits from this fork and upstream Material e621
            </p>
          </div>
        </v-col>
        <v-col cols="12" md="6" xl="4" class="py-5">
          <h3 class="text-h6 text-center mb-3">Tony Pup</h3>
          <commit-timeline :limit="3" source="fork" />
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
          <commit-timeline :limit="3" source="upstream" />
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
        <v-col cols="12" class="pb-2">
          <div class="d-flex flex-wrap justify-center ga-2">
            <v-btn color="primary" variant="tonal" @click="changelogOpen = true">
              Changelog &amp; TOS
            </v-btn>
          </div>
        </v-col>
      </v-row>
    </section>
    <Footer />
  </div>
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
import FurryDictionarySnippet from "./FurryDictionarySnippet.vue";
import { computed, ref } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";
import MigrationInfo from "./MigrationInfo.vue";
import { useSiteModeStore } from "@/services/SiteModeStore";

const router = useRouter();
const siteMode = useSiteModeStore();
const changelogOpen = ref(false);

useHead({
  title: "m-e621",
  titleTemplate: null,
});

const tagline = computed(() =>
  siteMode.supportsLocalMode
    ? "Browse nine imageboards and a local folder from one client."
    : "Browse nine imageboards from one client.",
);

const capabilities = computed(() => [
  siteMode.supportsLocalMode
    ? "Nine remote sites plus Federated date-merge and a Local folder browser"
    : "Nine remote sites plus Federated date-merge",
  "Independent accounts, blacklists, and preferences per site",
  "Saved posts across federated sites in one list",
  "Pools, comics, and fullscreen story / PDF / RTF / DOCX reading where supported",
  "Post Suggester and Favorite Analyzer outside Tailspace",
  "Uploads, site forums, and account admin stay on each origin site",
]);

const showTagSearch = computed(() => !siteMode.isTailspace);
const searchLabel = computed(() => (siteMode.isLocal ? "Fuzzy search …" : "Search tags …"));

const tags = ref<string[]>([]);
const query = computed<RouteLocationRaw>(() =>
  siteMode.isTailspace
    ? { name: "TailspacePosts" }
    : {
        name: "Posts",
        query: tags.value.length ? { tags: tags.value.join(" ") } : {},
      },
);
const addTag = (tag: string) => tags.value.push(tag);
const removeTag = (tag: string) => {
  const i = tags.value.indexOf(tag);
  if (i >= 0) tags.value.splice(i, 1);
};
</script>

<style scoped>
.landing-hero {
  min-height: min(70vh, 36rem);
}

.landing-tagline {
  max-width: 36rem;
  line-height: 1.35;
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

.landing-search-hint {
  max-width: 28rem;
  opacity: 0.9;
}

/* Outlined white + tinted fill stays readable on solid primary and Transparent Zen. */
.landing-hero-link {
  background-color: rgba(0, 0, 0, 0.34) !important;
  border-width: 2px !important;
  font-weight: 600;
}

.landing-capabilities {
  margin: 0;
  padding-left: 1.25rem;
}

.landing-capabilities li {
  margin-bottom: 0.5rem;
}

.landing-capabilities li::marker {
  color: rgb(var(--v-theme-primary));
}
</style>
