<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <settings-page-title
          section="restore"
          title="Backup and Restore"
          color="blue-darken-1"
          :chips="navChips"
        />

        <settings-group
          title="Backup"
          description="Download your settings as JSON. Full backup includes starred tags, blacklist, saved searches, and credentials for every site — do not share it. Sanitized export strips API keys and session cookies."
          anchor="backup"
        >
          <settings-row>
            <v-spacer />
            <v-btn variant="text" color="accent" @click="download(false)"> download </v-btn>
            <v-btn variant="text" color="accent" @click="download(true)">
              download sanitized
            </v-btn>
          </settings-row>
        </settings-group>

        <settings-group title="Restore" anchor="restore">
          <form>
            <settings-row>
              <v-spacer />
              <input
                ref="fileInput"
                class="file-btn"
                name="file"
                type="file"
                accept="application/json,.json"
                @change="onFilePicked"
              />
              <v-btn variant="text" color="accent" @click="openFileInput"> upload </v-btn>
              <v-btn variant="text" color="error" @click="confirmReset = true">
                reset to default
              </v-btn>
            </settings-row>
          </form>
        </settings-group>

        <v-dialog v-model="confirmReset" max-width="480">
          <v-card>
            <v-card-title>Reset all settings?</v-card-title>
            <v-card-text class="text-left">
              This replaces everything with defaults: credentials, blacklists, starred tags, saved
              searches, history, and appearance. This cannot be undone unless you have a backup.
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" @click="confirmReset = false">Cancel</v-btn>
              <v-btn color="error" variant="text" @click="doReset">Reset</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-dialog v-model="confirmImport" max-width="520">
          <v-card>
            <v-card-title>Restore from backup?</v-card-title>
            <v-card-text v-if="importPreview" class="text-left">
              <p class="mb-2">
                This replaces your current settings with the uploaded file. Folder grants for Local /
                Save Locally are not included in backups.
              </p>
              <ul class="pl-4 mb-0">
                <li>configVersion: {{ importPreview.configVersion ?? "unknown" }}</li>
                <li>Active mode: {{ importPreview.activeMode }}</li>
                <li>
                  Sites with credentials in file:
                  {{ importPreview.credentialSiteCount }}
                </li>
                <li>Blacklist rows: {{ importPreview.blacklistEntries }}</li>
                <li>History entries: {{ importPreview.historyEntries }}</li>
                <li>Saved searches: {{ importPreview.savedSearchEntries }}</li>
                <li>Saved posts: {{ importPreview.savedPosts }}</li>
                <li>Watched pools: {{ importPreview.watchedPools }}</li>
              </ul>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" @click="cancelImport">Cancel</v-btn>
              <v-btn color="error" variant="text" :loading="importing" @click="doImport">
                Restore
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { usePersistanceService, useSnackbarStore } from "@/services";
import type { SettingsImportPreview } from "@/services/PersistanceService";
import { ref } from "vue";
import SettingsGroup from "./SettingsGroup.vue";
import SettingsPageTitle, { type SettingsNavChip } from "./SettingsPageTitle.vue";
import SettingsRow from "./SettingsRow.vue";
import { downloadjs } from "./download";
import { useHead } from "@unhead/vue";

useHead({
  title: "Backup and Restore",
});

const navChips: SettingsNavChip[] = [
  { label: "Backup", anchor: "backup" },
  { label: "Restore", anchor: "restore" },
];

const snackbar = useSnackbarStore();
const persistanceService = usePersistanceService();
const fileInput = ref<HTMLInputElement>();
const confirmReset = ref(false);
const confirmImport = ref(false);
const importing = ref(false);
const importPreview = ref<SettingsImportPreview | null>(null);
const pendingFile = ref<File | null>(null);

const download = async (sanitizeCredentials: boolean) => {
  const file = await persistanceService.stateToFile({ sanitizeCredentials });
  downloadjs(file, file.name, file.type);
};

const onFilePicked = async () => {
  const file = fileInput.value?.files?.[0];
  if (!file) return;
  try {
    importPreview.value = await persistanceService.peekStateFromFile(file);
    pendingFile.value = file;
    confirmImport.value = true;
  } catch (err) {
    snackbar.addMessage(
      err instanceof Error ? err.message : "Could not read settings file",
    );
    clearFileInput();
  }
};

const cancelImport = () => {
  confirmImport.value = false;
  importPreview.value = null;
  pendingFile.value = null;
  clearFileInput();
};

const doImport = async () => {
  const file = pendingFile.value;
  if (!file) return;
  importing.value = true;
  try {
    await persistanceService.loadStateFromFile(file);
    snackbar.addMessage("successfully restored settings");
    cancelImport();
  } catch (err) {
    snackbar.addMessage(
      err instanceof Error ? err.message : "Could not restore settings",
    );
  } finally {
    importing.value = false;
  }
};

const doReset = () => {
  persistanceService.resetStateToDefault();
  confirmReset.value = false;
  snackbar.addMessage("successfully reset settings");
};

const openFileInput = () => {
  fileInput.value?.click();
};

const clearFileInput = () => {
  if (fileInput.value) fileInput.value.value = "";
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
