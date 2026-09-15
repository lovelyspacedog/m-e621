<template>
  <div>
    <v-list-item>
      <v-list-item-title class="text-overline">Saved searches</v-list-item-title>
      <template #append>
        <v-btn
          icon
          size="small"
          variant="text"
          aria-label="Add group"
          title="Add group"
          @click="promptCreateGroup"
        >
          <v-icon>mdi-folder-plus-outline</v-icon>
        </v-btn>
        <v-btn icon size="small" variant="text" aria-label="Add saved search" @click="openAdd()">
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </template>
    </v-list-item>

    <draggable
      :model-value="savedSearches.groups"
      item-key="id"
      handle=".group-drag-handle"
      :animation="150"
      @update:model-value="onGroupsReorder"
    >
      <template #item="{ element: group }">
        <div class="saved-search-group-block">
          <v-list-item
            v-if="hasCustomGroups"
            class="saved-search-group"
            @click="savedSearches.setGroupCollapsed(group.id, !group.collapsed)"
          >
            <template #prepend>
              <div class="d-flex align-center ga-1">
                <v-icon
                  class="group-drag-handle"
                  size="small"
                  @click.prevent.stop
                >
                  mdi-drag-vertical
                </v-icon>
                <v-icon size="small">
                  {{ group.collapsed ? "mdi-chevron-right" : "mdi-chevron-down" }}
                </v-icon>
              </div>
            </template>
            <v-list-item-title class="text-body-2 font-weight-medium">
              {{ group.name }}
            </v-list-item-title>
            <template #append>
              <span class="text-caption text-medium-emphasis mr-1">
                {{ savedSearches.entriesInGroup(group.id).length }}
              </span>
              <v-menu location="bottom end">
                <template #activator="{ props: menuProps }">
                  <v-btn
                    icon
                    size="x-small"
                    variant="text"
                    aria-label="Group actions"
                    v-bind="menuProps"
                    @click.prevent.stop
                  >
                    <v-icon size="small">mdi-dots-vertical</v-icon>
                  </v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item @click="openAdd(group.id)">
                    <template #prepend>
                      <v-icon>mdi-plus</v-icon>
                    </template>
                    <v-list-item-title>Add search here</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    :disabled="!canMoveGroup(group.id, -1)"
                    @click="savedSearches.moveGroup(group.id, -1)"
                  >
                    <template #prepend>
                      <v-icon>mdi-arrow-up</v-icon>
                    </template>
                    <v-list-item-title>Move up</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    :disabled="!canMoveGroup(group.id, 1)"
                    @click="savedSearches.moveGroup(group.id, 1)"
                  >
                    <template #prepend>
                      <v-icon>mdi-arrow-down</v-icon>
                    </template>
                    <v-list-item-title>Move down</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    v-if="group.id !== ungroupedId"
                    @click="promptRenameGroup(group.id, group.name)"
                  >
                    <template #prepend>
                      <v-icon>mdi-pencil</v-icon>
                    </template>
                    <v-list-item-title>Rename group</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    v-if="group.id !== ungroupedId"
                    @click="savedSearches.deleteGroup(group.id)"
                  >
                    <template #prepend>
                      <v-icon>mdi-delete</v-icon>
                    </template>
                    <v-list-item-title>Delete group</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </template>
          </v-list-item>

          <div
            v-show="!hasCustomGroups || !group.collapsed"
            :class="{ 'saved-search-group-body': hasCustomGroups }"
          >
            <draggable
              :model-value="savedSearches.entriesInGroup(group.id)"
              :item-key="entryKey"
              handle=".drag-handle"
              :animation="150"
              @update:model-value="(next) => onGroupReorder(group.id, next)"
            >
              <template #item="{ element }">
                <v-list-item :to="toSearch(element.tags)" exact density="compact">
                  <template #prepend>
                    <v-icon class="drag-handle" size="small" @click.prevent.stop>
                      mdi-drag-vertical
                    </v-icon>
                  </template>
                  <v-list-item-title>{{ element.name }}</v-list-item-title>
                  <template #append>
                    <v-menu location="bottom end">
                      <template #activator="{ props: menuProps }">
                        <v-btn
                          icon
                          size="x-small"
                          variant="text"
                          aria-label="Saved search actions"
                          v-bind="menuProps"
                          @click.prevent.stop
                        >
                          <v-icon size="small">mdi-dots-vertical</v-icon>
                        </v-btn>
                      </template>
                      <v-list density="compact">
                        <v-list-item @click="openEdit(element.id)">
                          <template #prepend>
                            <v-icon>mdi-pencil</v-icon>
                          </template>
                          <v-list-item-title>Edit</v-list-item-title>
                        </v-list-item>
                        <v-list-item
                          :disabled="!canMoveInGroup(element.id, -1)"
                          @click="savedSearches.moveEntryInGroup(element.id, -1)"
                        >
                          <template #prepend>
                            <v-icon>mdi-arrow-up</v-icon>
                          </template>
                          <v-list-item-title>Move up</v-list-item-title>
                        </v-list-item>
                        <v-list-item
                          :disabled="!canMoveInGroup(element.id, 1)"
                          @click="savedSearches.moveEntryInGroup(element.id, 1)"
                        >
                          <template #prepend>
                            <v-icon>mdi-arrow-down</v-icon>
                          </template>
                          <v-list-item-title>Move down</v-list-item-title>
                        </v-list-item>
                        <template v-if="hasCustomGroups">
                          <v-list-subheader>Move to group</v-list-subheader>
                          <v-list-item
                            v-for="dest in savedSearches.groups"
                            :key="dest.id"
                            :disabled="dest.id === element.groupId"
                            @click="savedSearches.moveEntryToGroup(element.id, dest.id)"
                          >
                            <template #prepend>
                              <v-icon>mdi-folder-move-outline</v-icon>
                            </template>
                            <v-list-item-title>{{ dest.name }}</v-list-item-title>
                          </v-list-item>
                        </template>
                        <v-list-item @click="savedSearches.deleteEntryById(element.id)">
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
            <v-list-item
              v-if="hasCustomGroups && savedSearches.entriesInGroup(group.id).length === 0"
              density="compact"
            >
              <v-list-item-title class="text-medium-emphasis text-caption">
                No searches in this group
              </v-list-item-title>
            </v-list-item>
          </div>
        </div>
      </template>
    </draggable>

    <v-list-item v-if="savedSearches.entries.length === 0">
      <v-list-item-title class="text-medium-emphasis">
        No saved searches
      </v-list-item-title>
    </v-list-item>

    <v-dialog v-model="dialog" max-width="480">
      <v-card>
        <v-card-title>{{ editingId == null ? "Add saved search" : "Edit saved search" }}</v-card-title>
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
            class="mb-3"
            @keydown.enter="save"
          />
          <v-select
            v-if="hasCustomGroups"
            v-model="formGroupId"
            :items="groupSelectItems"
            item-title="title"
            item-value="value"
            label="Group"
            hide-details
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
import { useSiteModeStore } from "@/services/SiteModeStore";
import {
  UNGROUPED_SAVED_SEARCH_GROUP_ID,
  type SavedSearchEntry,
  type SavedSearchGroup,
} from "@/services/types";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import Draggable from "vuedraggable";

const savedSearches = useSavedSearchStore();
const siteMode = useSiteModeStore();
const route = useRoute();
const ungroupedId = UNGROUPED_SAVED_SEARCH_GROUP_ID;

const entryKey = (entry: SavedSearchEntry) => entry.id;

const hasCustomGroups = computed(() => savedSearches.groups.length > 1);

const groupSelectItems = computed(() =>
  savedSearches.groups.map((g) => ({ title: g.name, value: g.id })),
);

const dialog = ref(false);
const editingId = ref<string | null>(null);
const formName = ref("");
const formTags = ref("");
const formGroupId = ref(ungroupedId);

const canSave = computed(() => formName.value.trim().length > 0);

const currentQueryTags = () => {
  const raw = route.query.tags;
  if (typeof raw !== "string") return [];
  return parseSavedSearchTags(raw);
};

const toSearch = (tags: string[]) =>
  siteMode.isTailspace
    ? {
        name: "TailspacePosts",
        query: {
          tags: tags.join(" "),
        },
      }
    : {
        name: "Posts",
        query: {
          tags: tags.join(" "),
        },
      };

const onGroupReorder = (groupId: string, next: SavedSearchEntry[]) => {
  savedSearches.replaceGroupEntries(groupId, next);
};

const onGroupsReorder = (next: SavedSearchGroup[]) => {
  savedSearches.replaceGroups(next);
};

const canMoveGroup = (groupId: string, direction: -1 | 1) => {
  const idx = savedSearches.groups.findIndex((g) => g.id === groupId);
  return idx + direction >= 0 && idx + direction < savedSearches.groups.length;
};

const canMoveInGroup = (entryId: string, direction: -1 | 1) => {
  const entry = savedSearches.entries.find((e) => e.id === entryId);
  if (!entry) return false;
  const siblings = savedSearches.entriesInGroup(entry.groupId);
  const idx = siblings.findIndex((e) => e.id === entryId);
  return idx + direction >= 0 && idx + direction < siblings.length;
};

const promptCreateGroup = () => {
  const name = window.prompt("New group name");
  if (name == null) return;
  savedSearches.createGroup(name);
};

const promptRenameGroup = (groupId: string, current: string) => {
  const name = window.prompt("Rename group", current);
  if (name == null) return;
  savedSearches.renameGroup(groupId, name);
};

const openAdd = (groupId?: string) => {
  const tags = currentQueryTags();
  editingId.value = null;
  formName.value = tags.join(" ");
  formTags.value = tags.join(" ");
  formGroupId.value = groupId || ungroupedId;
  dialog.value = true;
};

const openEdit = (id: string) => {
  const entry = savedSearches.entries.find((e) => e.id === id);
  if (!entry) return;
  editingId.value = id;
  formName.value = entry.name;
  formTags.value = entry.tags.join(" ");
  formGroupId.value = entry.groupId;
  dialog.value = true;
};

const save = () => {
  if (!canSave.value) return;
  const tags = parseSavedSearchTags(formTags.value);
  const name = formName.value.trim();
  const groupId = formGroupId.value || ungroupedId;
  if (editingId.value == null) {
    savedSearches.addEntry(tags, name, groupId);
  } else {
    savedSearches.updateEntryById(editingId.value, { name, tags, groupId });
  }
  dialog.value = false;
};
</script>

<style scoped>
.drag-handle,
.group-drag-handle {
  cursor: grab;
}
.drag-handle:active,
.group-drag-handle:active {
  cursor: grabbing;
}
.saved-search-group {
  min-height: 36px;
  opacity: 0.95;
}
.saved-search-group-body {
  padding-left: 8px;
}
</style>
