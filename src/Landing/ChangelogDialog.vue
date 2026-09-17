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
        <v-tab value="changelog">Changelog</v-tab>
        <v-tab value="tos">TOS</v-tab>
      </v-tabs>

      <v-card-text class="dialog-body">
        <v-tabs-window v-model="tab">
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
          v-if="tab === 'changelog'"
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
          v-else-if="selectedTos"
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
import { changelogIntro, changelogSections } from "./changelog";
import { tosIntro, tosSummaries } from "./tosSummaries";

defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const tab = ref<"changelog" | "tos">("changelog");
const selectedTosId = ref<string | null>(null);

const selectedTos = computed(
  () => tosSummaries.find((entry) => entry.id === selectedTosId.value) ?? null,
);

const showTosBack = computed(() => tab.value === "tos" && !!selectedTos.value);

const dialogTitle = computed(() => {
  if (tab.value === "tos") {
    return selectedTos.value?.name ?? "Terms of Service";
  }
  return "Changelog";
});

const titleIcon = computed(() => {
  if (tab.value === "tos") {
    return selectedTos.value ? "mdi-file-document-outline" : "mdi-scale-balance";
  }
  return "mdi-newspaper-variant-outline";
});

watch(tab, (next) => {
  if (next !== "tos") selectedTosId.value = null;
});

const onDialogUpdate = (open: boolean) => {
  emit("update:modelValue", open);
  if (!open) {
    selectedTosId.value = null;
    tab.value = "changelog";
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
