<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <settings-page-title section="shortcuts" title="Keyboard Shortcuts" color="black" />
        <settings-group>
          <settings-row stack>
            <keyboard-shortcut-editor />
          </settings-row>
        </settings-group>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import SettingsPageTitle from "./SettingsPageTitle.vue";
import SettingsGroup from "./SettingsGroup.vue";
import SettingsRow from "./SettingsRow.vue";
import KeyboardShortcutEditor from "./KeyboardShortcutEditor.vue";
import { useHead } from "@unhead/vue";

useHead({ title: "Keyboard Shortcuts" });
</script>
