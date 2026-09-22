<template>
  <div>
    <div class="text-left text-caption text-medium-emphasis px-1 mb-2">
      {{ status }}
    </div>
    <template v-if="!isSave && directoryNames.length">
      <v-list density="compact" class="folder-list mb-2 pa-0">
        <v-list-item
          v-for="name in directoryNames"
          :key="name"
          class="px-1"
        >
          <v-list-item-title class="text-body-2">{{ name }}</v-list-item-title>
          <template #append>
            <div class="d-flex flex-wrap ga-1">
              <v-btn
                size="small"
                variant="text"
                :loading="exportingLabel === name"
                @click="onExportSidecars(name)"
              >
                Export
              </v-btn>
              <v-btn
                size="small"
                variant="text"
                @click="openImport(name)"
              >
                Import
              </v-btn>
              <v-btn
                size="small"
                variant="text"
                color="error"
                @click="onRemoveFolder(name)"
              >
                Remove
              </v-btn>
            </div>
          </template>
        </v-list-item>
      </v-list>
    </template>
    <div class="d-flex flex-wrap ga-2">
      <v-btn
        color="accent"
        variant="tonal"
        :disabled="!folderPickerSupported"
        @click="onChooseFolder"
      >
        {{
          isSave
            ? "Choose save folder"
            : directoryNames.length
              ? "Add browse folder"
              : "Choose browse folder"
        }}
      </v-btn>
      <v-btn
        variant="text"
        :disabled="isSave ? !directoryName : !directoryNames.length"
        @click="onClearFolder"
      >
        {{ isSave ? "Clear folder" : "Clear all" }}
      </v-btn>
      <template v-if="isSave">
        <!-- Save picker stays single-folder; no sidecar import/export. -->
      </template>
      <input
        ref="fileInput"
        class="file-btn"
        type="file"
        accept="application/json,.json"
        @change="onImportSidecars"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  clearLocalDirectoryHandle,
  exportLocalSidecars,
  getLocalDirectoryHandles,
  importLocalSidecars,
  pickLocalDirectory,
  removeLocalDirectory,
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
import { computed, onMounted, ref } from "vue";

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
const directoryName = computed(() => posts.saveLocalDirectoryName);
const directoryNames = computed(() => posts.localDirectoryNames || []);
const fileInput = ref<HTMLInputElement>();
const exportingLabel = ref<string | null>(null);
const importTargetLabel = ref<string | null>(null);

onMounted(() => {
  if (!isSave.value) {
    void getLocalDirectoryHandles();
  }
});

const status = computed(() => {
  if (!folderPickerSupported.value) {
    return isSave.value
      ? "Save folders need desktop Chromium (File System Access). In Tauri, Save Locally writes into the first Local browse folder; Firefox and most phones download to Downloads."
      : "Local browse needs desktop Chromium (File System Access) or the Tauri desktop app — not available in most mobile browsers.";
  }
  if (isSave.value) {
    if (directoryName.value) {
      return `Using folder: ${directoryName.value}`;
    }
    return "No save folder — downloads go to the browser Downloads folder.";
  }
  if (directoryNames.value.length) {
    return directoryNames.value.length === 1
      ? `Using folder: ${directoryNames.value[0]}`
      : `Using ${directoryNames.value.length} browse folders (combined library; filter with folder:Name).`;
  }
  return "No browse folders — Local mode has nothing to show.";
});

const onChooseFolder = async () => {
  try {
    if (isSave.value) {
      const handle = await pickSaveDirectory();
      snackbar.addMessage(`Save folder set to ${handle.name}`);
    } else {
      await pickLocalDirectory();
      const names = posts.localDirectoryNames;
      const latest = names[names.length - 1] || "folder";
      snackbar.addMessage(
        names.length > 1
          ? `Added Local browse folder ${latest}`
          : `Local browse folder set to ${latest}`,
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

const onRemoveFolder = async (name: string) => {
  await removeLocalDirectory(name);
  snackbar.addMessage(`Removed Local browse folder ${name}`);
  emit("changed");
};

const onClearFolder = async () => {
  if (isSave.value) {
    await clearSavedDirectoryHandle();
    snackbar.addMessage("Save folder cleared");
  } else {
    await clearLocalDirectoryHandle();
    snackbar.addMessage("Local browse folders cleared");
  }
  emit("changed");
};

const onExportSidecars = async (label: string) => {
  exportingLabel.value = label;
  try {
    const data = await exportLocalSidecars(label);
    const json = `${JSON.stringify(data, null, 2)}\n`;
    downloadjs(
      json,
      `me621-local-${data.folder}-tags-favs.json`,
      "application/json",
    );
    snackbar.addMessage(`Exported tags and favorites for ${data.folder}`);
  } catch (err) {
    snackbar.addMessage(
      err instanceof Error ? err.message : "Export failed",
    );
  } finally {
    exportingLabel.value = null;
  }
};

const openImport = (label: string) => {
  importTargetLabel.value = label;
  fileInput.value?.click();
};

const onImportSidecars = async () => {
  const file = fileInput.value?.files?.[0];
  const target = importTargetLabel.value;
  if (!file || !target) return;
  try {
    const parsed = JSON.parse(await file.text()) as LocalSidecarExport;
    await importLocalSidecars(parsed, target);
    snackbar.addMessage(`Imported Local tags and favorites into ${target}`);
    emit("changed");
  } catch (err) {
    snackbar.addMessage(
      err instanceof Error ? err.message : "Import failed",
    );
  } finally {
    importTargetLabel.value = null;
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
.folder-list {
  background: transparent;
}
</style>
