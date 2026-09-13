<template>
  <div>
    <v-list-item>
      <v-list-item-title class="text-overline">Saved searches</v-list-item-title>
      <template #append>
        <v-btn icon size="small" variant="text" aria-label="Add saved search" @click="openAdd">
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </template>
    </v-list-item>
    <draggable
      v-model="entriesModel"
      :item-key="entryKey"
      handle=".drag-handle"
      :animation="150"
    >
      <template #item="{ element, index }">
        <v-list-item :to="toSearch(element.tags)" exact>
          <template #prepend>
            <v-icon class="drag-handle" @click.prevent.stop>mdi-drag-vertical</v-icon>
          </template>
          <v-list-item-title>{{ element.name }}</v-list-item-title>
          <template #append>
            <v-menu location="bottom end">
              <template #activator="{ props: menuProps }">
                <v-btn
                  icon
                  size="small"
                  variant="text"
                  aria-label="Saved search actions"
                  v-bind="menuProps"
                  @click.prevent.stop
                >
                  <v-icon>mdi-dots-vertical</v-icon>
                </v-btn>
              </template>
              <v-list density="compact">
                <v-list-item @click="openEdit(index)">
                  <template #prepend>
                    <v-icon>mdi-pencil</v-icon>
                  </template>
                  <v-list-item-title>Edit</v-list-item-title>
                </v-list-item>
                <v-list-item :disabled="index === 0" @click="savedSearches.moveEntry(index, index - 1)">
                  <template #prepend>
                    <v-icon>mdi-arrow-up</v-icon>
                  </template>
                  <v-list-item-title>Move up</v-list-item-title>
                </v-list-item>
                <v-list-item
                  :disabled="index === savedSearches.entries.length - 1"
                  @click="savedSearches.moveEntry(index, index + 1)"
                >
                  <template #prepend>
                    <v-icon>mdi-arrow-down</v-icon>
                  </template>
                  <v-list-item-title>Move down</v-list-item-title>
                </v-list-item>
                <v-list-item @click="savedSearches.deleteEntry(index)">
                  <template #prepend>
                    <v-icon>mdi-delete</v-icon>
                  </template>
                  <v-list-item-title>Remove</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </template>
        </v-list-item>
      </template>
    </draggable>
    <v-list-item v-if="savedSearches.entries.length === 0">
      <v-list-item-title class="text-medium-emphasis">
        No saved searches
      </v-list-item-title>
    </v-list-item>

    <v-dialog v-model="dialog" max-width="480">
      <v-card>
        <v-card-title>{{ editingIndex == null ? "Add saved search" : "Edit saved search" }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="formName"
            label="Name"
            hide-details="auto"
            class="mb-3"
            @keydown.enter="save"
          />
          <v-text-field
            v-model="formTags"
            label="Tags"
            hint="Space-separated, same as the search bar"
            persistent-hint
            @keydown.enter="save"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="text" :disabled="!canSave" @click="save">
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { parseSavedSearchTags, useSavedSearchStore } from "@/services";
import type { SavedSearchEntry } from "@/services/types";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import Draggable from "vuedraggable";

const savedSearches = useSavedSearchStore();
const route = useRoute();

const entryKey = (entry: SavedSearchEntry) => `${entry.name}\0${entry.tags.join(" ")}`;

const entriesModel = computed({
  get: () => savedSearches.entries,
  set: (next: SavedSearchEntry[]) => {
    savedSearches.replaceEntries(next.map((entry) => ({
      name: entry.name,
      tags: [...entry.tags],
    })));
  },
});

const dialog = ref(false);
const editingIndex = ref<number | null>(null);
const formName = ref("");
const formTags = ref("");

const canSave = computed(() => formName.value.trim().length > 0);

const currentQueryTags = () => {
  const raw = route.query.tags;
  if (typeof raw !== "string") return [];
  return parseSavedSearchTags(raw);
};

const toSearch = (tags: string[]) => ({
  name: "Posts",
  query: {
    tags: tags.join(" "),
  },
});

const openAdd = () => {
  const tags = currentQueryTags();
  editingIndex.value = null;
  formName.value = tags.join(" ");
  formTags.value = tags.join(" ");
  dialog.value = true;
};

const openEdit = (index: number) => {
  const entry = savedSearches.entries[index];
  if (!entry) return;
  editingIndex.value = index;
  formName.value = entry.name;
  formTags.value = entry.tags.join(" ");
  dialog.value = true;
};

const save = () => {
  if (!canSave.value) return;
  const tags = parseSavedSearchTags(formTags.value);
  const name = formName.value.trim();
  if (editingIndex.value == null) {
    savedSearches.addEntry(tags, name);
  } else {
    savedSearches.updateEntry(editingIndex.value, { name, tags });
  }
  dialog.value = false;
};
</script>

<style scoped>
.drag-handle {
  cursor: grab;
}
.drag-handle:active {
  cursor: grabbing;
}
</style>
