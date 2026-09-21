<template>
  <!-- Single root required: router-view uses <Transition mode="out-in">.
       Multi-root fragments never finish leave → blank v-main (Scent Marks). -->
  <div class="landing-page">
    <section class="landing-hero v-toolbar elevation-0 bg-primary d-flex">
      <div class="w-100 d-flex flex-column align-center justify-center fill-height py-10 px-4">
        <app-logo v-view-transition-name="'applogo'" type="face" size="160" />
        <h1 class="mb-2 text-h1 text-center">{{ APP_NAME }}</h1>
        <p
          class="text-h6 text-center landing-splash mb-4"
          role="button"
          tabindex="0"
          title="Click for another splash"
          aria-live="polite"
          :aria-label="splashFull || undefined"
          @click="rerollSplash"
          @keydown.enter.prevent="rerollSplash"
          @keydown.space.prevent="rerollSplash"
        >
          <span>{{ splashTyped }}</span
          ><span
            v-if="splashShowCursor"
            class="landing-splash-cursor"
            aria-hidden="true"
            >▍</span
          >
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
          {{
            siteMode.isNews
              ? "News uses its own feed — pick a site above or browse headlines."
              : "Tailspace uses its own browse feed — pick a site above or open posts."
          }}
        </p>
        <div class="d-flex flex-wrap justify-center align-center ga-3">
          <v-btn size="x-large" color="secondary" variant="flat" :to="query">
            {{ siteMode.isNews ? "Browse news" : "Browse posts" }}
          </v-btn>
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
            @click="infoOpen = true"
          >
            Info
          </v-btn>
          <v-btn
            size="large"
            color="white"
            variant="outlined"
            class="landing-hero-link landing-hero-settings"
            aria-label="Settings"
            @click="openSettings()"
          >
            <v-icon icon="mdi-cog" />
          </v-btn>
        </div>
        <InfoDialog v-model="infoOpen" />
      </div>
    </section>
    <MigrationInfo />
    <section class="mt-8 mb-2">
      <v-container>
        <v-row justify="center">
          <v-col cols="12" md="8" lg="6">
            <div class="landing-text-panel landing-tagline-panel">
              <p class="text-h6 text-center mb-0">{{ tagline }}</p>
            </div>
          </v-col>
        </v-row>
      </v-container>
    </section>
    <section class="mt-4 mb-2">
      <v-container>
        <v-row justify="center">
          <v-col cols="12" md="8" lg="6">
            <div class="landing-text-panel">
              <h2 class="text-h4 text-center mb-4">What it does</h2>
              <ul class="landing-capabilities">
                <li v-for="item in capabilities" :key="item">{{ item }}</li>
              </ul>
            </div>
          </v-col>
        </v-row>
      </v-container>
    </section>
    <TagWikiSnippet />
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
            variant="tonal"
            @click="openCommitHistory('fork')"
          >
            Show more
          </v-btn>
          <v-btn
            block
            class="mt-2"
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
            variant="tonal"
            @click="openCommitHistory('upstream')"
          >
            Show more
          </v-btn>
          <v-btn
            block
            class="mt-2"
            color="primary"
            href="https://github.com/avoonix/material-e621/commits/master"
            target="_blank"
            rel="noopener"
          >
            more on GitHub
          </v-btn>
        </v-col>
        <CommitHistoryDialog
          v-model="commitHistoryOpen"
          :source="commitHistorySource"
          :title="commitHistoryTitle"
        />
        <v-col cols="12" class="pb-2">
          <div class="d-flex flex-wrap justify-center align-center ga-2">
            <v-btn color="primary" variant="tonal" @click="infoOpen = true">
              Info
            </v-btn>
            <v-btn
              color="primary"
              variant="tonal"
              aria-label="Settings"
              @click="openSettings()"
            >
              <v-icon icon="mdi-cog" />
            </v-btn>
          </div>
        </v-col>
      </v-row>
    </section>
    <Footer @open-info="infoOpen = true" @open-settings="openSettings()" />
  </div>
</template>

<script setup lang="ts">
import AppLogo from "../App/AppLogo.vue";
import SiteModeSwitcher from "../App/SiteModeSwitcher.vue";
import CommitTimeline from "@/About/CommitTimeline.vue";
import { useHead } from "@unhead/vue";
import TagSearch from "@/Tag/TagSearch.vue";
import About from "./About.vue";
import InfoDialog from "./InfoDialog.vue";
import CommitHistoryDialog from "./CommitHistoryDialog.vue";
import Footer from "./Footer.vue";
import TagWikiSnippet from "./TagWikiSnippet.vue";
import { pickLandingSplash } from "./splashes";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";
import MigrationInfo from "./MigrationInfo.vue";
import { useSiteModeStore } from "@/services/SiteModeStore";
import { APP_NAME } from "@/misc/util/brand";
import { openSettings } from "@/Settings/settingsOverlay";

const router = useRouter();
const siteMode = useSiteModeStore();
const infoOpen = ref(false);
const commitHistoryOpen = ref(false);
const commitHistorySource = ref<"fork" | "upstream">("fork");
const commitHistoryTitle = computed(() =>
  commitHistorySource.value === "fork" ? "Tony Pup commits" : "Avoonix commits",
);
const openCommitHistory = (source: "fork" | "upstream") => {
  commitHistorySource.value = source;
  commitHistoryOpen.value = true;
};

useHead({
  title: APP_NAME,
  titleTemplate: null,
});

/** Descriptive copy — sits above What it does, not under the logo. */
const tagline = computed(() =>
  siteMode.supportsLocalMode
    ? "Browse nine imageboards, furry news, and a local folder from one client."
    : "Browse nine imageboards and furry news from one client.",
);

/** One-shot typewriter: types in, stays on screen (no erase cycle). */
const TYPE_MS = 28;
const CURSOR_HOLD_MS = 1200;
const splashFull = ref("");
const splashTyped = ref("");
const splashShowCursor = ref(false);
let typeTimer: ReturnType<typeof setInterval> | null = null;
let cursorHoldTimer: ReturnType<typeof setTimeout> | null = null;

const clearSplashTimers = () => {
  if (typeTimer) {
    clearInterval(typeTimer);
    typeTimer = null;
  }
  if (cursorHoldTimer) {
    clearTimeout(cursorHoldTimer);
    cursorHoldTimer = null;
  }
};

const finishSplashTyping = () => {
  clearSplashTimers();
  splashTyped.value = splashFull.value;
  cursorHoldTimer = setTimeout(() => {
    splashShowCursor.value = false;
    cursorHoldTimer = null;
  }, CURSOR_HOLD_MS);
};

const startSplashTypewriter = (exclude?: string) => {
  clearSplashTimers();
  splashFull.value = pickLandingSplash(exclude);
  const preferReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (preferReducedMotion || splashFull.value.length === 0) {
    splashTyped.value = splashFull.value;
    splashShowCursor.value = false;
    return;
  }
  splashTyped.value = "";
  splashShowCursor.value = true;
  let pos = 0;
  typeTimer = setInterval(() => {
    pos += 1;
    splashTyped.value = splashFull.value.slice(0, pos);
    if (pos >= splashFull.value.length) {
      finishSplashTyping();
    }
  }, TYPE_MS);
};

const rerollSplash = () => {
  startSplashTypewriter(splashFull.value || undefined);
};

onMounted(() => startSplashTypewriter());
onUnmounted(clearSplashTimers);

const capabilities = computed(() => [
  siteMode.supportsLocalMode
    ? "Nine imageboards, News (Flayrah + Dogpatch Press), Federated date-merge (Search or Following), and a Local folder library"
    : "Nine imageboards, News (Flayrah + Dogpatch Press), and Federated date-merge (Search or Following)",
  "Federated chips multi-select which sites merge; independent accounts, blacklists, and prefs per site",
  "Saved posts across origins, watched pools with new-page badges, and starred tag groups",
  "Feed Layout: full-width, grid, or compact cards; infinite scroll or page buttons",
  "Pools and Tailspace comics readers; fullscreen stories, PDF, RTF, and DOCX where supported",
  "Post Suggester and Favorite Analyzer (not on Tailspace or News); Fluffle reverse-image search",
  "Comments, votes, favorites, and following where each site allows them",
  "Uploads, forums, and account admin stay on each origin site",
]);

const showTagSearch = computed(
  () => !siteMode.isTailspace && !siteMode.isNews,
);
const searchLabel = computed(() => (siteMode.isLocal ? "Fuzzy search …" : "Search tags …"));

const tags = ref<string[]>([]);
const query = computed<RouteLocationRaw>(() =>
  siteMode.isTailspace
    ? { name: "TailspacePosts" }
    : siteMode.isNews
      ? { name: "NewsFeed" }
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

.landing-splash {
  max-width: 36rem;
  min-height: 1.35em;
  line-height: 1.35;
  cursor: pointer;
  user-select: none;
}

.landing-splash-cursor {
  display: inline-block;
  margin-left: 0.05em;
  font-weight: 400;
  opacity: 0.85;
  animation: landing-splash-blink 0.9s step-end infinite;
}

@keyframes landing-splash-blink {
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-splash-cursor {
    animation: none;
  }
}

.landing-tagline-panel {
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

/* Gear-only control: same height as sibling size="large" text buttons. */
.landing-hero-settings {
  min-width: unset;
  aspect-ratio: 1;
  padding-inline: 0;
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
