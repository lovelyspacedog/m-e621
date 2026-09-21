<template>
  <v-dialog
    :model-value="modelValue"
    max-width="720"
    scrollable
    scrim="primary"
    @update:model-value="onDialogUpdate"
  >
    <v-card color="secondary">
      <v-card-title class="d-flex align-center">
        <v-btn
          v-if="showTosBack"
          icon
          variant="text"
          class="mr-1"
          aria-label="Back to TOS list"
          @click="selectedTosId = null"
        >
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-icon class="mr-2">{{ titleIcon }}</v-icon>
        {{ dialogTitle }}
        <v-spacer />
        <v-btn
          icon
          variant="text"
          :aria-label="`Close ${dialogTitle}`"
          @click="emit('update:modelValue', false)"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-tabs
        v-model="tab"
        color="primary"
        align-tabs="title"
        class="px-2"
      >
        <v-tab value="about">About</v-tab>
        <v-tab value="changelog">Changelog</v-tab>
        <v-tab value="tos">TOS</v-tab>
      </v-tabs>

      <v-card-text class="dialog-body">
        <v-tabs-window v-model="tab">
          <v-tabs-window-item value="about">
            <div class="d-flex flex-column align-center text-center mb-4">
              <app-logo type="face" size="72" class="mb-2" />
              <h3 class="text-h5 mb-1">{{ APP_NAME }}</h3>
              <p class="text-body-2 text-medium-emphasis mb-0">
                Version {{ versionLabel }}
              </p>
            </div>
            <p class="text-body-2 mb-3">
              {{ APP_NAME }} is a personal, AI-assisted fork of
              <a
                class="text-primary text-decoration-underline"
                target="_blank"
                rel="noopener"
                href="https://github.com/avoonix/material-e621"
                >Material e621</a
              >.
              It browses multiple imageboards and furry news (Flayrah + Dogpatch Press) from one client,
              with Federated merge, Local folder browsing where available, and
              tools like pools, suggester, and analyzer.
            </p>
            <p class="text-body-2 mb-3">
              Last changed with commit
              <a
                class="text-primary text-decoration-underline"
                :href="`https://github.com/lovelyspacedog/m-e621/commit/${commit.hash}`"
                target="_blank"
                rel="noopener"
                >{{ commit.hash.substring(0, 7) }}</a
              >
              on {{ commitDate }} ({{ commitDateRelative }}) from branch
              <strong>{{ branch }}</strong>.
            </p>
            <p class="text-body-2 mb-3">
              Source is AGPL-3.0 on
              <a
                class="text-primary text-decoration-underline"
                href="https://github.com/lovelyspacedog/m-e621"
                target="_blank"
                rel="noopener"
                >GitHub</a
              >.
              Experimental — not affiliated with the supported sites or upstream
              maintainers. Adult content; follow each site’s age requirements and
              terms.
            </p>
            <p class="text-body-2 text-medium-emphasis mb-0">
              For a stable e621-only client, use upstream Material e621.
            </p>
          </v-tabs-window-item>

          <v-tabs-window-item value="changelog">
            <p class="text-body-2 text-medium-emphasis mb-6">{{ changelogIntro }}</p>
            <section
              v-for="section in changelogSections"
              :key="section.date"
              class="changelog-section mb-6"
            >
              <h3 class="text-h6 mb-1">{{ section.title }}</h3>
              <div class="text-caption text-medium-emphasis mb-3">
                {{ formatDate(section.date) }}
              </div>
              <ul class="bullet-list">
                <li v-for="(item, idx) in section.items" :key="idx">{{ item }}</li>
              </ul>
            </section>
          </v-tabs-window-item>

          <v-tabs-window-item value="tos">
            <template v-if="!selectedTos">
              <p class="text-body-2 text-medium-emphasis mb-4">{{ tosIntro }}</p>
              <v-list bg-color="transparent" class="tos-list pa-0">
                <v-list-item
                  v-for="entry in tosSummaries"
                  :key="entry.id"
                  :title="entry.name"
                  :subtitle="entry.sourceLabel"
                  rounded="lg"
                  class="tos-list-item mb-1"
                  @click="selectedTosId = entry.id"
                >
                  <template #append>
                    <v-icon icon="mdi-chevron-right" />
                  </template>
                </v-list-item>
              </v-list>
            </template>

            <template v-else>
              <p v-if="selectedTos.note" class="text-body-2 text-medium-emphasis mb-4">
                {{ selectedTos.note }}
              </p>
              <section
                v-for="(section, sIdx) in selectedTos.sections"
                :key="sIdx"
                class="tos-section mb-5"
              >
                <h3 class="text-subtitle-1 font-weight-bold mb-2">{{ section.heading }}</h3>
                <p
                  v-for="(para, pIdx) in section.paragraphs || []"
                  :key="`p-${pIdx}`"
                  class="text-body-2 mb-2"
                >
                  {{ para }}
                </p>
                <ul v-if="section.bullets?.length" class="bullet-list">
                  <li v-for="(bullet, bIdx) in section.bullets" :key="bIdx">{{ bullet }}</li>
                </ul>
              </section>
              <v-btn
                v-if="selectedTos.sourceUrl"
                variant="tonal"
                color="primary"
                :href="selectedTos.sourceUrl"
                target="_blank"
                rel="noopener"
                class="mt-2"
              >
                <v-icon start>mdi-open-in-new</v-icon>
                View original
              </v-btn>
            </template>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card-text>

      <v-card-actions>
        <v-btn
          v-if="tab === 'about'"
          variant="text"
          color="primary"
          href="https://github.com/lovelyspacedog/m-e621"
          target="_blank"
          rel="noopener"
        >
          <v-icon start>mdi-open-in-new</v-icon>
          GitHub
        </v-btn>
        <v-btn
          v-else-if="tab === 'changelog'"
          variant="text"
          color="primary"
          href="https://github.com/lovelyspacedog/m-e621/commits/master"
          target="_blank"
          rel="noopener"
        >
          <v-icon start>mdi-open-in-new</v-icon>
          Full commit history
        </v-btn>
        <v-btn
          v-else-if="selectedTos?.sourceUrl"
          variant="text"
          color="primary"
          :href="selectedTos.sourceUrl"
          target="_blank"
          rel="noopener"
        >
          <v-icon start>mdi-open-in-new</v-icon>
          View original
        </v-btn>
        <v-spacer />
        <v-btn
          variant="text"
          color="primary"
          @click="emit('update:modelValue', false)"
        >
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { formatDistanceToNow } from "date-fns";
import AppLogo from "@/App/AppLogo.vue";
import { APP_NAME } from "@/misc/util/brand";
import { getGitBranchInfo, getGitInfo } from "@/misc/util/git";
import { changelogIntro, changelogSections } from "./changelog";
import { tosIntro, tosSummaries } from "./tosSummaries";

defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const tab = ref<"about" | "changelog" | "tos">("about");
const selectedTosId = ref<string | null>(null);

const commit = getGitInfo()[0];
const branch = getGitBranchInfo();
const commitDate = computed(() =>
  commit.date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
);
const commitDateRelative = computed(() =>
  formatDistanceToNow(commit.date, { addSuffix: true }),
);
const versionLabel = computed(() => commit.hash.substring(0, 7));

const selectedTos = computed(
  () => tosSummaries.find((entry) => entry.id === selectedTosId.value) ?? null,
);

const showTosBack = computed(() => tab.value === "tos" && !!selectedTos.value);

const dialogTitle = computed(() => {
  if (tab.value === "tos") {
    return selectedTos.value?.name ?? "Terms of Service";
  }
  if (tab.value === "about") return "About";
  if (tab.value === "changelog") return "Changelog";
  return "Info";
});

const titleIcon = computed(() => {
  if (tab.value === "tos") {
    return selectedTos.value ? "mdi-file-document-outline" : "mdi-scale-balance";
  }
  if (tab.value === "about") return "mdi-information-outline";
  return "mdi-newspaper-variant-outline";
});

watch(tab, (next) => {
  if (next !== "tos") selectedTosId.value = null;
});

const onDialogUpdate = (open: boolean) => {
  emit("update:modelValue", open);
  if (!open) {
    selectedTosId.value = null;
    tab.value = "about";
  }
};

const formatDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};
</script>

<style scoped>
.dialog-body {
  max-height: min(70vh, 640px);
}
.bullet-list {
  margin: 0;
  padding-left: 1.25rem;
}
.bullet-list li {
  margin-bottom: 0.35rem;
}
.bullet-list li::marker {
  color: rgb(var(--v-theme-primary));
}
.tos-list-item {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
</style>
