<template>
  <v-expansion-panel value="u18chan">
    <v-expansion-panel-title>
      <account-panel-title
        title="u18chan"
        :status="status"
        :connected="hasIdentity"
        :probe="probe"
      />
    </v-expansion-panel-title>
    <v-expansion-panel-text>
      <p class="text-caption text-medium-emphasis mb-3">
        u18chan has no account login — posts are anonymous. Optional name
        (use <code>Name#trip</code> for a tripcode) and deletion password are
        stored for the compose forms. Cub Index is not available.
      </p>
      <v-text-field
        variant="filled"
        label="Posting name (optional)"
        type="text"
        v-model="fields.username"
        autocomplete="username"
      />
      <v-text-field
        variant="filled"
        :append-icon="showPass ? 'mdi-eye-off' : 'mdi-eye'"
        :type="showPass ? 'text' : 'password'"
        label="Deletion password"
        v-model="fields.apiKey"
        @click:append="showPass = !showPass"
        autocomplete="new-password"
      />
      <v-switch
        class="mt-2"
        color="accent"
        hide-details
        :model-value="siteMode.u18chanIncludeGore"
        label="Include u18chan Gore Index"
        @update:model-value="onGore"
      />
      <p class="text-caption text-medium-emphasis mt-1 mb-0">
        Off by default. When on, Gore Index appears in the u18chan sidebar.
      </p>
    </v-expansion-panel-text>
  </v-expansion-panel>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import AccountPanelTitle from "../AccountPanelTitle.vue";
import { emptyAuth } from "../accountAuth";
import { useAccountFields } from "../useAccountFields";
import { useSiteModeStore } from "@/services";
import { profileHasAuthMaterial } from "@/services/siteProfiles";

const siteMode = useSiteModeStore();
const fields = useAccountFields("u18chan");
const showPass = ref(false);
const probe = reactive(emptyAuth());

const hasIdentity = computed(() =>
  profileHasAuthMaterial("u18chan", {
    username: fields.username,
    apiKey: fields.apiKey,
  }),
);

const status = computed(() => {
  if (!hasIdentity.value) return "Guest posting (no identity saved)";
  if (fields.username) return `Posting as ${fields.username}`;
  return "Deletion password saved";
});

const onGore = (value: boolean | null) => {
  siteMode.setU18chanIncludeGore(!!value);
};
</script>
