<template>
  <v-toolbar-items>
    <template v-for="option in navigationItems" :key="option.resolved">
      <v-btn
        v-if="option.to.name === 'Settings'"
        variant="text"
        @click="openSettings({ name: 'Settings' })"
      >
        {{ option.name }}
      </v-btn>
      <v-btn
        v-else
        variant="text"
        :to="option.to"
        :exact="option.exact"
      >
        {{ option.name }}
      </v-btn>
    </template>
  </v-toolbar-items>
</template>

<script setup lang="ts">
import { useNavigationItems } from "../App/navigation";
import { openSettings } from "@/Settings/settingsOverlay";

const navigationItems = useNavigationItems();
</script>
