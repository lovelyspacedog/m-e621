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
        {{ isSave ? "Choose save folder" : "Choose browse folder" }}
      </v-btn>
      <v-btn
        variant="text"
        :disabled="!directoryName"
        @click="onClearFolder"
      >
        Clear folder
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  clearLocalDirectoryHandle,
  pickLocalDirectory,
} from "@/misc/util/localMedia";
import {
  clearSavedDirectoryHandle,
  pickSaveDirectory,
  supportsDirectoryPicker,
} from "@/misc/util/saveLocal";
import { usePostsStore, useSnackbarStore } from "@/services";
import { computed } from "vue";

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
const directoryPickerSupported = supportsDirectoryPicker();
const isSave = computed(() => props.purpose === "save");
const directoryName = computed(() =>
  isSave.value ? posts.saveLocalDirectoryName : posts.localDirectoryName,
);

const status = computed(() => {
  if (!directoryPickerSupported) {
    return "This browser cannot open a local folder (Firefox/Zen). Use Chromium.";
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
    const handle = isSave.value
      ? await pickSaveDirectory()
      : await pickLocalDirectory();
    snackbar.addMessage(
      isSave.value
        ? `Save folder set to ${handle.name}`
        : `Local browse folder set to ${handle.name}`,
    );
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
</script>
