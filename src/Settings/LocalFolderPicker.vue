<template>
  <div>
    <div class="text-left text-caption text-medium-emphasis px-1 mb-2">
      {{ status }}
    </div>
    <div class="d-flex flex-wrap ga-2">
      <v-btn
        color="accent"
        variant="tonal"
        :disabled="!directoryPickerSupported"
        @click="onChooseFolder"
      >
        Choose save folder
      </v-btn>
      <v-btn
        variant="text"
        :disabled="!posts.saveLocalDirectoryName"
        @click="onClearFolder"
      >
        Clear folder
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { invalidateLocalMediaIndex } from "@/misc/util/localMedia";
import {
  clearSavedDirectoryHandle,
  pickSaveDirectory,
  supportsDirectoryPicker,
} from "@/misc/util/saveLocal";
import { usePostsStore, useSnackbarStore } from "@/services";
import { computed } from "vue";

const emit = defineEmits<{
  (e: "changed"): void;
}>();

const posts = usePostsStore();
const snackbar = useSnackbarStore();
const directoryPickerSupported = supportsDirectoryPicker();

const status = computed(() => {
  if (!directoryPickerSupported) {
    return "This browser cannot open a local folder (Firefox/Zen). Use Chromium.";
  }
  if (posts.saveLocalDirectoryName) {
    return `Using folder: ${posts.saveLocalDirectoryName}`;
  }
  return "No folder chosen — Local mode and Save Locally need one.";
});

const onChooseFolder = async () => {
  try {
    const handle = await pickSaveDirectory();
    invalidateLocalMediaIndex();
    snackbar.addMessage(`Save folder set to ${handle.name}`);
    emit("changed");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    snackbar.addMessage(
      err instanceof Error ? err.message : "Could not choose folder",
    );
  }
};

const onClearFolder = async () => {
  await clearSavedDirectoryHandle();
  invalidateLocalMediaIndex();
  snackbar.addMessage("Save folder cleared");
  emit("changed");
};
</script>
