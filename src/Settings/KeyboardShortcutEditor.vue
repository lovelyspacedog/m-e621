<template>
  <v-data-table disable-sort :headers="headers" :items="rows">
    <template #top>
      <div class="pa-2 d-flex flex-wrap ga-2">
        <v-dialog v-model="dialog" max-width="500px">
          <template #activator="{ props }">
            <v-btn color="primary" block v-bind="props">
              New Shortcut
            </v-btn>
          </template>
          <v-card>
            <v-card-title>
              <span>{{ formTitle }}</span>
            </v-card-title>

            <v-card-text>
              <v-container>
                <v-row>
                  <v-col cols="12" sm="6">
                    <v-select :items="actions" v-model="editedItem.action" label="Action" />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-text-field v-model="editedItem.sequence" label="Recorded sequence" readonly />
                  </v-col>
                  <v-col cols="12">
                    <keyboard-shortcut-recorder @recorded="editedItem.sequence = $event" />
                  </v-col>
                  <v-col v-if="saveConflict" cols="12">
                    <v-alert density="compact" type="warning" variant="tonal">
                      Sequence “{{ editedItem.sequence }}” is already used by another shortcut.
                    </v-alert>
                  </v-col>
                </v-row>
              </v-container>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn color="primary" variant="text" @click="close">Cancel</v-btn>
              <v-btn color="primary" variant="text" :disabled="!!saveConflict" @click="save">
                Save
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
        <v-btn color="primary" variant="outlined" block @click="confirmReset = true">
          Restore defaults
        </v-btn>
        <v-dialog v-model="confirmReset" max-width="440">
          <v-card>
            <v-card-title>Restore default shortcuts?</v-card-title>
            <v-card-text>
              Replaces your keyboard shortcuts with the built-in defaults.
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" @click="confirmReset = false">Cancel</v-btn>
              <v-btn color="primary" variant="text" @click="doReset">Restore</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
        <v-dialog v-model="dialogDelete" max-width="500px">
          <v-card>
            <v-card-title>
              Are you sure you want to delete this item?
            </v-card-title>
            <v-card-actions>
              <v-spacer />
              <v-btn color="primary" variant="text" @click="closeDelete"> Cancel </v-btn>
              <v-btn color="primary" variant="text" @click="deleteItemConfirm">
                OK
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </div>
    </template>
    <template #item.sequence="{ item }">
      <span :class="{ 'text-warning': item.conflict }">{{ item.sequence }}</span>
      <v-chip v-if="item.conflict" class="ml-2" size="x-small" color="warning" label>
        conflict
      </v-chip>
    </template>
    <template #item.buttons="{ item }">
      <v-btn icon @click="editItem(item)">
        <v-icon>mdi-pencil</v-icon>
      </v-btn>
      <v-btn icon @click="deleteItem(item)">
        <v-icon>mdi-delete</v-icon>
      </v-btn>
    </template>
  </v-data-table>
</template>

<script lang="ts">
import type { Action, Shortcut } from "@/services/types";
import {
  computed,
  defineComponent,
  nextTick,
  ref,
  watch,
} from "vue";
import { clone } from "lodash";
import KeyboardShortcutRecorder from "./KeyboardShortcutRecorder.vue";
import { useShortcutStore } from "@/services";
import type { DataTableHeader } from "vuetify";

type ShortcutRow = Shortcut & { conflict: boolean; index: number };

export default defineComponent({
  props: {},
  components: { KeyboardShortcutRecorder },
  setup() {
    const shortcutStore = useShortcutStore();
    const headers: DataTableHeader[] = [
      { title: "Action", value: "action" },
      { title: "Sequence", value: "sequence" },
      { title: "", value: "buttons", align: "end" },
    ];
    const sequenceCounts = computed(() => {
      const counts = new Map<string, number>();
      for (const s of shortcutStore.shortcuts) {
        const key = (s.sequence || "").trim().toLowerCase();
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      return counts;
    });
    const rows = computed<ShortcutRow[]>(() =>
      shortcutStore.shortcuts.map((s, index) => {
        const key = (s.sequence || "").trim().toLowerCase();
        return {
          ...s,
          index,
          conflict: !!key && (sequenceCounts.value.get(key) || 0) > 1,
        };
      }),
    );
    const editedItem = ref<Shortcut>({ action: "go_to_posts", sequence: "" });
    const defaultItem: Shortcut = { action: "go_to_posts", sequence: "" };
    const dialog = ref(false);
    const dialogDelete = ref(false);
    const confirmReset = ref(false);
    const editedIndex = ref(-1);
    const formTitle = computed(() =>
      editedIndex.value === -1 ? "New Item" : "Edit Item",
    );
    const saveConflict = computed(() => {
      const key = (editedItem.value.sequence || "").trim().toLowerCase();
      if (!key) return false;
      return shortcutStore.shortcuts.some((s, i) => {
        if (i === editedIndex.value) return false;
        return (s.sequence || "").trim().toLowerCase() === key;
      });
    });
    watch(dialog, () => dialog.value || close());
    watch(dialogDelete, () => dialogDelete.value || closeDelete());
    const editItem = (item: ShortcutRow) => {
      editedIndex.value = item.index;
      editedItem.value = clone({
        action: item.action,
        sequence: item.sequence,
      });
      dialog.value = true;
    };
    const deleteItem = (item: ShortcutRow) => {
      editedIndex.value = item.index;
      editedItem.value = clone({
        action: item.action,
        sequence: item.sequence,
      });
      dialogDelete.value = true;
    };
    const deleteItemConfirm = () => {
      shortcutStore.deleteShortcut(editedIndex.value);
      closeDelete();
    };
    const close = async () => {
      dialog.value = false;
      await nextTick();
      editedItem.value = clone(defaultItem);
      editedIndex.value = -1;
    };
    const closeDelete = async () => {
      dialogDelete.value = false;
      await nextTick();
      editedItem.value = clone(defaultItem);
      editedIndex.value = -1;
    };
    const save = () => {
      if (!editedItem.value.sequence?.trim()) return;
      if (saveConflict.value) return;
      if (editedIndex.value > -1) {
        shortcutStore.updateShortcut(editedIndex.value, editedItem.value);
      } else {
        shortcutStore.addShortcut(clone(editedItem.value));
      }
      close();
    };
    const doReset = () => {
      shortcutStore.resetShortcuts();
      confirmReset.value = false;
    };

    const actions: Action[] = [
      "go_to_posts",
      "go_to_settings",
      "navigate_back",
      "navigate_forward",
      "focus_search",
      "fullscreen_exit",
      "fullscreen_next_post",
      "fullscreen_previous_post",
      "fullscreen_slideshow_toggle",
      "fullscreen_add_favorite",
      "fullscreen_remove_favorite",
      "fullscreen_toggle_favorite",
      "fullscreen_open_source",
    ];

    return {
      headers,
      rows,
      editedItem,
      defaultItem,
      dialog,
      dialogDelete,
      confirmReset,
      editedIndex,
      formTitle,
      saveConflict,
      editItem,
      deleteItem,
      deleteItemConfirm,
      close,
      closeDelete,
      save,
      doReset,
      actions,
    };
  },
});
</script>
