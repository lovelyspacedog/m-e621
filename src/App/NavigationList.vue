<template>
  <v-list subheader class="pa-0 mt-3">
    <v-list-item :to="home.to" :exact="home.exact">
      <template #prepend>
        <v-icon>{{ home.icon }}</v-icon>
      </template>
      <v-list-item-title>{{ home.name }}</v-list-item-title>
    </v-list-item>
    <saved-search-nav />
    <v-list-item
      v-for="option in trailing"
      :key="option.resolved"
      :to="option.to"
      :exact="option.exact"
    >
      <template #prepend>
        <v-icon>{{ option.icon }}</v-icon>
      </template>
      <v-list-item-title>{{ option.name }}</v-list-item-title>
    </v-list-item>
  </v-list>
  <site-mode-switcher />
</template>

<script setup lang="ts">
import { useHomeNavigationItem, useTrailingNavigationItems } from "../App/navigation";
import SavedSearchNav from "./SavedSearchNav.vue";
import SiteModeSwitcher from "./SiteModeSwitcher.vue";

const home = useHomeNavigationItem();
const trailing = useTrailingNavigationItems();
</script>
