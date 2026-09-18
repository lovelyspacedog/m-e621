<template>
  <div>
    <div class="text-left text-caption text-medium-emphasis px-1 mb-2">
      {{ status }}
    </div>
    <div class="d-flex flex-wrap ga-2">
      <v-btn
        color="accent"
        variant="tonal"
        :disabled="!folderPickerSupported"
        @click="onChooseFolder"
      >
        {{ isSave ? "Choose save folder" : "Choose browse folder" }}
      </v-btn>
      <v-btn
        variant="text"
        :disabled="!directoryName"
        @click="onClearFolder"
      >
        Clear folder
      </v-btn>
      <template v-if="!isSave">
        <v-btn
          variant="text"
          :disabled="!directoryName"
          :loading="exporting"
          @click="onExportSidecars"
        >
          Export tags/favs
        </v-btn>
        <v-btn
          variant="text"
          :disabled="!directoryName"
          @click="openImport"
        >
          Import tags/favs
        </v-btn>
        <input
          ref="fileInput"
          class="file-btn"
          type="file"
          accept="application/json,.json"
          @change="onImportSidecars"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  clearLocalDirectoryHandle,
  exportLocalSidecars,
  importLocalSidecars,
  pickLocalDirectory,
  type LocalSidecarExport,
} from "@/misc/util/localMedia";
import {
  clearSavedDirectoryHandle,
  pickSaveDirectory,
  supportsDirectoryPicker,
} from "@/misc/util/saveLocal";
import { supportsLocalBrowse } from "@/misc/util/tauriLocalFs";
import { downloadjs } from "@/Settings/download";
import { usePostsStore, useSnackbarStore } from "@/services";
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    purpose?: "save" | "local";
  }>(),
  { purpose: "local" },
);

const emit = defineEmits<{
  (e: "changed"): void;
}>();

const posts = usePostsStore();
const snackbar = useSnackbarStore();
const isSave = computed(() => props.purpose === "save");
/** Dedicated save-folder picker is Chromium FSA; Tauri Save Locally uses the Local browse root. */
const folderPickerSupported = computed(() =>
  isSave.value ? supportsDirectoryPicker() : supportsLocalBrowse(),
);
const directoryName = computed(() =>
  isSave.value ? posts.saveLocalDirectoryName : posts.localDirectoryName,
);
const fileInput = ref<HTMLInputElement>();
const exporting = ref(false);

const status = computed(() => {
  if (!folderPickerSupported.value) {
    return isSave.value
      ? "Save folders need desktop Chromium (File System Access). In Tauri, Save Locally writes into the Local browse folder; Firefox and most phones download to Downloads."
      : "Local browse needs desktop Chromium (File System Access) or the Tauri desktop app — not available in most mobile browsers.";
  }
  if (directoryName.value) {
    return `Using folder: ${directoryName.value}`;
  }
  return isSave.value
    ? "No save folder — downloads go to the browser Downloads folder."
    : "No browse folder — Local mode has nothing to show.";
});

const onChooseFolder = async () => {
  try {
    if (isSave.value) {
      const handle = await pickSaveDirectory();
      snackbar.addMessage(`Save folder set to ${handle.name}`);
    } else {
      await pickLocalDirectory();
      snackbar.addMessage(
        `Local browse folder set to ${posts.localDirectoryName || "folder"}`,
      );
    }
    emit("changed");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    snackbar.addMessage(
      err instanceof Error ? err.message : "Could not choose folder",
    );
  }
};

const onClearFolder = async () => {
  if (isSave.value) {
    await clearSavedDirectoryHandle();
    snackbar.addMessage("Save folder cleared");
  } else {
    await clearLocalDirectoryHandle();
    snackbar.addMessage("Local browse folder cleared");
  }
  emit("changed");
};

const onExportSidecars = async () => {
  exporting.value = true;
  try {
    const data = await exportLocalSidecars();
    const json = `${JSON.stringify(data, null, 2)}\n`;
    downloadjs(
      json,
      `me621-local-${data.folder}-tags-favs.json`,
      "application/json",
    );
    snackbar.addMessage("Exported Local tags and favorites");
  } catch (err) {
    snackbar.addMessage(
      err instanceof Error ? err.message : "Export failed",
    );
  } finally {
    exporting.value = false;
  }
};

const openImport = () => {
  fileInput.value?.click();
};

const onImportSidecars = async () => {
  const file = fileInput.value?.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()) as LocalSidecarExport;
    await importLocalSidecars(parsed);
    snackbar.addMessage("Imported Local tags and favorites");
    emit("changed");
  } catch (err) {
    snackbar.addMessage(
      err instanceof Error ? err.message : "Import failed",
    );
  } finally {
    if (fileInput.value) fileInput.value.value = "";
  }
};
</script>

<style scoped>
.file-btn {
  opacity: 0;
  position: absolute;
  height: 0;
  width: 0;
}
</style>
