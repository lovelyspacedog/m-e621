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
          description="Download your settings as JSON. Includes starred tags, blacklist, saved searches, and credentials for every site — do not share it."
          anchor="backup"
        >
          <settings-row>
            <v-spacer />
            <v-btn variant="text" color="accent" @click="download"> download </v-btn>
          </settings-row>
        </settings-group>

        <settings-group title="Restore" anchor="restore">
          <form>
            <settings-row>
              <v-spacer />
              <input ref="fileInput" class="file-btn" name="file" type="file" @change="restore()" />
              <v-btn variant="text" color="accent" @click="openFileInput"> upload </v-btn>
              <v-btn variant="text" color="accent" @click="reset"> reset to default </v-btn>
            </settings-row>
          </form>
        </settings-group>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { usePersistanceService, useSnackbarStore } from "@/services";
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
const download = async () => {
  const file = await persistanceService.stateToFile();
  downloadjs(file, file.name, file.type);
};
const restore = async () => {
  const file = fileInput.value?.files?.[0];
  if (!file) return;
  await persistanceService.loadStateFromFile(file);
  snackbar.addMessage("successfully restored settings");
};
const reset = () => {
  persistanceService.resetStateToDefault();
  snackbar.addMessage("successfully reset settings");
};
const openFileInput = () => {
  fileInput.value?.click();
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
