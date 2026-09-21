<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <div v-if="errorMessage" class="text-center text-error pa-4">
          {{ errorMessage }}
          <div class="mt-4">
            <v-btn variant="tonal" :to="{ name: 'FavoritesAnalyzer' }">
              Back
            </v-btn>
          </div>
        </div>

        <template v-else-if="profile">
          <div class="d-flex flex-wrap align-center ga-2 mb-4">
            <h2 class="text-h6 mb-0">{{ heading }}</h2>
            <v-chip size="small" variant="tonal">
              {{ sampleSize }} favs sampled
            </v-chip>
            <v-spacer />
            <v-btn-toggle
              v-model="limitChoice"
              density="compact"
              variant="outlined"
              divided
              mandatory
            >
              <v-btn
                v-for="n in SAMPLE_LIMITS"
                :key="n"
                :value="n"
                size="small"
              >
                {{ n }}
              </v-btn>
            </v-btn-toggle>
            <v-btn
              size="small"
              variant="tonal"
              :to="suggesterLink"
            >
              Open in Post Suggester
            </v-btn>
            <v-btn size="small" variant="text" @click="copyTopTags">
              Copy top tags
            </v-btn>
            <v-btn size="small" variant="text" @click="exportJson">
              Export JSON
            </v-btn>
            <v-btn size="small" variant="text" @click="refresh">
              Refresh
            </v-btn>
          </div>

          <div class="d-flex flex-wrap align-center ga-2 mb-4">
            <v-switch
              v-model="useBlacklist"
              density="compact"
              hide-details
              label="Apply blacklist"
              color="primary"
            />
            <v-switch
              v-model="hideMeta"
              density="compact"
              hide-details
              label="Hide meta / lore / invalid"
              color="primary"
            />
            <v-btn-toggle
              v-model="sortMode"
              density="compact"
              variant="outlined"
              divided
              mandatory
            >
              <v-btn value="count" size="small">By count</v-btn>
              <v-btn value="alpha" size="small">A–Z</v-btn>
            </v-btn-toggle>
          </div>

          <div v-if="overviewTags.length" class="mb-6">
            <div class="text-overline mb-2">Top across categories</div>
            <div class="d-flex flex-wrap ga-1">
              <v-chip
                v-for="tag in overviewTags"
                :key="`${tag.category}:${tag.name}`"
                size="small"
                :color="chipColor(tag.category)"
                class="overview-chip"
                :style="chipStyle(tag.count, overviewMax)"
                @click="searchTag(tag.name)"
              >
                {{ tag.name }}
                <span class="text-caption ml-1 opacity-70">
                  {{ tag.count }}
                </span>
              </v-chip>
            </div>
          </div>

          <v-chip-group
            v-model="activeCategories"
            column
            multiple
            class="mb-4"
          >
            <v-chip
              v-for="cat in allCategories"
              :key="cat"
              :value="cat"
              filter
              variant="outlined"
              size="small"
            >
              {{ cat }}
            </v-chip>
          </v-chip-group>

          <div v-if="!visibleSections.length" class="text-medium-emphasis">
            No tags in this sample.
          </div>

          <div
            v-for="section in visibleSections"
            :key="section.category"
            class="mb-6"
          >
            <h3 class="text-subtitle-1 mb-2 text-capitalize">
              {{ section.category }}
              <span class="text-caption text-medium-emphasis">
                ({{ section.tags.length }})
              </span>
            </h3>
            <v-list density="compact" class="bg-transparent">
              <v-list-item
                v-for="tag in previewTags(section)"
                :key="tag.name"
              >
                <template #prepend>
                  <div class="rank-bar-wrap mr-3">
                    <div
                      class="rank-bar"
                      :style="{ width: `${(tag.count / section.max) * 100}%` }"
                    />
                  </div>
                </template>
                <v-list-item-title>
                  <TagLabel
                    :tag="{ name: tag.name, category: section.category }"
                    class="cursor-pointer"
                    @click="searchTag(tag.name)"
                  />
                </v-list-item-title>
                <template #append>
                  <span class="text-caption text-medium-emphasis mr-2">
                    {{ tag.count }}
                    <span v-if="sampleSize">
                      ({{ pct(tag.count) }}%)
                    </span>
                  </span>
                  <TagMenu
                    :tag="{ name: tag.name, category: section.category }"
                  />
                </template>
              </v-list-item>
            </v-list>
            <v-btn
              v-if="section.tags.length > INITIAL_VISIBLE"
              size="small"
              variant="text"
              class="mt-1"
              @click="toggleExpanded(section.category)"
            >
              {{
                expanded[section.category]
                  ? "Show less"
                  : `Show all ${section.tags.length}`
              }}
            </v-btn>
          </div>
        </template>

        <div v-else class="text-center pa-8">
          <progress-message :value="progress" />
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { computed, reactive, ref, toRaw, watch } from "vue";
import type {
  FavoriteTagsResult,
  IProgressEvent,
} from "@/worker/AnalyzeService";
import { getAnalyzeService } from "@/worker/services";
import * as Comlink from "comlink";
import { useRoute, useRouter } from "vue-router";
import ProgressMessage from "@/Suggester/ProgressMessage.vue";
import {
  useAccountStore,
  useBlacklistStore,
  usePostsStore,
  useSiteModeStore,
  useSnackbarStore,
  useUrlStore,
} from "@/services";
import { useMainStore } from "@/services/state";
import { useHead } from "@unhead/vue";
import TagLabel from "@/Tag/TagLabel.vue";
import TagMenu from "@/Tag/TagMenu.vue";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";
import { buildUnifiedFetchArgs } from "@/misc/util/postOrigin";
import { publishPartialChildWarnings } from "@/misc/util/favoriteChildWarnings";
import {
  canLoadOwnFavorites,
  probeFaHostCookiesAvailable,
} from "@/misc/util/favoriteAuthGate";
import { getLocalPostsPage } from "@/misc/util/localMedia";
import {
  buildFavoriteTagsResult,
} from "@/misc/util/suggestionScoring";
import { isPostBlacklisted } from "@/worker/blacklist";
import { getTagColorFromCategory } from "@/misc/util/utilities";
import type { EnhancedPost } from "@/worker/ApiService";

useHead({ title: "Favorite Analyzer" });

const SAMPLE_LIMITS = [320, 960, 1920] as const;
const INITIAL_VISIBLE = 12;
const HIDDEN_BY_DEFAULT = new Set(["meta", "lore", "invalid"]);

const route = useRoute();
const router = useRouter();
const progress = ref<IProgressEvent>();
const errorMessage = ref<string | null>(null);
const profile = ref<FavoriteTagsResult | null>(null);
const sampleSize = ref(0);
const hostFaCookiesAvailable = ref(false);
const urlStore = useUrlStore();
const siteMode = useSiteModeStore();
const account = useAccountStore();
const blacklist = useBlacklistStore();
const postsStore = usePostsStore();
const snackbar = useSnackbarStore();
const main = useMainStore();

const username = computed(() => route.query?.name?.toString() || "");
const needsUsername = computed(() =>
  modeSupportsOtherUserFavorites(siteMode.activeMode),
);

const refreshFaHostCookies = async () => {
  if (siteMode.activeMode !== "furaffinity") {
    hostFaCookiesAvailable.value = false;
    return;
  }
  hostFaCookiesAvailable.value = await probeFaHostCookiesAvailable();
};

watch(
  () => siteMode.activeMode,
  () => {
    void refreshFaHostCookies();
  },
  { immediate: true },
);

const limitChoice = ref<number>(
  Number(route.query.limit) || 1920,
);
const useBlacklist = ref(route.query.bl === "1");
const hideMeta = ref(true);
const sortMode = ref<"count" | "alpha">("count");
const expanded = reactive<Record<string, boolean>>({});
const activeCategories = ref<string[]>([]);

watch(limitChoice, (n) => {
  const cur = Number(route.query.limit) || 1920;
  if (cur === n) return;
  router.replace({ query: { ...route.query, limit: String(n) } });
});

watch(useBlacklist, (on) => {
  const cur = route.query.bl === "1";
  if (cur === on) return;
  const next = { ...route.query };
  if (on) next.bl = "1";
  else delete next.bl;
  router.replace({ query: next });
});

watch(
  () =>
    [
      route.query.name,
      limitChoice.value,
      useBlacklist.value,
      siteMode.activeMode,
    ] as const,
  () => {
    analyze();
  },
  { immediate: true },
);

const heading = computed(() => {
  if (siteMode.activeMode === "local") return "Library favorites";
  if (siteMode.activeMode === "unified") return "Federated favorites";
  if (needsUsername.value && username.value) {
    return `Favorites for ${username.value}`;
  }
  return "Your favorites";
});

const suggesterLink = computed(() => ({
  name: "SuggesterResult" as const,
  query:
    needsUsername.value && username.value
      ? { name: username.value }
      : {},
}));

type RankedTag = { name: string; count: number; category: string };
type Section = {
  category: string;
  tags: RankedTag[];
  max: number;
};

const rankedSections = computed<Section[]>(() => {
  if (!profile.value) return [];
  const sections: Section[] = [];
  for (const [category, tags] of Object.entries(profile.value.counts)) {
    if (!tags) continue;
    if (hideMeta.value && HIDDEN_BY_DEFAULT.has(category)) continue;
    const list: RankedTag[] = Object.entries(tags)
      .filter(([, count]) => !!count)
      .map(([name, count]) => ({
        name,
        count: count!,
        category,
      }));
    if (sortMode.value === "alpha") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => b.count - a.count);
    }
    if (!list.length) continue;
    sections.push({
      category,
      tags: list,
      max: Math.max(...list.map((t) => t.count)),
    });
  }
  if (sortMode.value === "count") {
    sections.sort((a, b) => b.tags[0].count - a.tags[0].count);
  } else {
    sections.sort((a, b) => a.category.localeCompare(b.category));
  }
  return sections;
});

const allCategories = computed(() =>
  rankedSections.value.map((s) => s.category),
);

watch(
  allCategories,
  (cats) => {
    activeCategories.value = [...cats];
  },
  { immediate: true },
);

const visibleSections = computed(() => {
  const selected = new Set(activeCategories.value);
  if (!selected.size) return rankedSections.value;
  return rankedSections.value.filter((s) => selected.has(s.category));
});

const overviewTags = computed(() => {
  const flat = rankedSections.value.flatMap((s) => s.tags);
  flat.sort((a, b) => b.count - a.count);
  return flat.slice(0, 10);
});

const overviewMax = computed(() => overviewTags.value[0]?.count || 1);

const pct = (count: number) =>
  sampleSize.value
    ? Math.round((count / sampleSize.value) * 1000) / 10
    : 0;

const chipColor = (category: string) =>
  getTagColorFromCategory(category) || undefined;

const chipStyle = (count: number, max: number) => ({
  fontSize: `${0.75 + (count / max) * 0.35}rem`,
});

const previewTags = (section: Section) =>
  expanded[section.category]
    ? section.tags
    : section.tags.slice(0, INITIAL_VISIBLE);

const toggleExpanded = (category: string) => {
  expanded[category] = !expanded[category];
};

const searchTag = (name: string) => {
  router.push({
    name: siteMode.isTailspace
      ? "TailspacePosts"
      : siteMode.isNews
        ? "NewsFeed"
        : "Posts",
    query: { tags: name },
  });
};

const copyTopTags = async () => {
  const tags = overviewTags.value.map((t) => t.name).join(" ");
  await navigator.clipboard.writeText(tags);
};

const exportJson = () => {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          mode: siteMode.activeMode,
          username: username.value || null,
          sampleSize: sampleSize.value,
          counts: profile.value?.counts,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `favorite-analyzer-${siteMode.activeMode}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

let generation = 0;

const fetchLocalPages = async (
  tags: string[],
  postLimit: number,
  onProgress?: (got: number) => void,
) => {
  const posts: EnhancedPost[] = [];
  let page = 1;
  const pageLimit = postsStore.postListFetchLimit || 30;
  while (posts.length < postLimit) {
    const { posts: batch, status } = await getLocalPostsPage(
      page,
      pageLimit,
      tags,
    );
    if (status !== "ok" && status !== "empty") break;
    posts.push(...batch);
    onProgress?.(posts.length);
    page += 1;
    if (batch.length < pageLimit) break;
  }
  return posts.slice(0, postLimit);
};

const analyze = async () => {
  const thisGen = ++generation;
  errorMessage.value = null;
  profile.value = null;
  sampleSize.value = 0;
  progress.value = { message: "starting", progress: 0 };

  try {
    const ownOk = canLoadOwnFavorites({
      mode: siteMode.activeMode,
      apiKey: account.auth?.api_key,
      hostFaCookiesAvailable: hostFaCookiesAvailable.value,
    });
    if (needsUsername.value && !username.value.trim() && !ownOk) {
      errorMessage.value =
        "Enter a username, or sign in to analyze your favorites.";
      return;
    }
    if (
      !needsUsername.value &&
      siteMode.activeMode !== "local" &&
      siteMode.activeMode !== "unified" &&
      !ownOk
    ) {
      errorMessage.value = "Sign in for this site to analyze favorites.";
      return;
    }

    const limit = (SAMPLE_LIMITS as readonly number[]).includes(limitChoice.value)
      ? limitChoice.value
      : 1920;
    const bl = useBlacklist.value ? toRaw(blacklist.tags) : undefined;

    if (siteMode.isLocal) {
      progress.value = { message: "loading local favorites", progress: 0 };
      let favPosts = await fetchLocalPages(["type:favorited"], limit, (n) => {
        progress.value = {
          message: `local favorites ${n}`,
          progress: Math.min(1, n / limit),
        };
      });
      if (bl?.length) {
        favPosts = favPosts.filter((p) => !isPostBlacklisted(p, bl));
      }
      if (thisGen !== generation) return;
      profile.value = buildFavoriteTagsResult(favPosts);
      sampleSize.value = favPosts.length;
      progress.value = { message: "done", progress: 1 };
      return;
    }

    const service = await getAnalyzeService();
    const unified =
      siteMode.activeMode === "unified"
        ? buildUnifiedFetchArgs(main.$state, {
            forceAllEnabledChildren: true,
          })
        : undefined;
    const r = await service.getFavoriteTags(
      username.value,
      urlStore.e621Url,
      Comlink.proxy((progressEvent) => {
        progress.value = progressEvent;
      }),
      siteMode.activeMode,
      toRaw(account.auth),
      toRaw(account.userId),
      unified ? toRaw(unified) : undefined,
      limit,
      bl,
      toRaw(postsStore.sfwOnly),
    );
    if (thisGen !== generation) return;
    profile.value = r;
    sampleSize.value = r.favoriteKeys?.length || 0;
    publishPartialChildWarnings(r.warnings, (msg) =>
      snackbar.addMessage(msg),
    );
    progress.value = { message: "done", progress: 1 };
  } catch (err: unknown) {
    if (thisGen !== generation) return;
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
};

const refresh = () => {
  analyze();
};
</script>

<style scoped>
.rank-bar-wrap {
  width: 48px;
  height: 8px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  overflow: hidden;
  align-self: center;
}
.rank-bar {
  height: 100%;
  background: rgb(var(--v-theme-primary));
  border-radius: 4px;
  min-width: 2px;
}
.overview-chip {
  cursor: pointer;
}
.cursor-pointer {
  cursor: pointer;
}
</style>
