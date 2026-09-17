<template>
  <v-list subheader class="pa-0" :class="section === 'primary' ? 'mt-3' : section === 'all' ? 'mt-3' : 'mt-1'">
    <template v-if="section === 'primary' || section === 'all'">
      <v-list-item :to="home.to" :exact="home.exact">
        <template #prepend>
          <v-icon>{{ home.icon }}</v-icon>
        </template>
        <v-list-item-title>{{ home.name }}</v-list-item-title>
      </v-list-item>
      <site-mode-switcher />
    </template>
    <template v-if="section === 'secondary' || section === 'all'">
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
    </template>
  </v-list>
</template>

<script setup lang="ts">
import { useHomeNavigationItem, useTrailingNavigationItems } from "../App/navigation";
import SavedSearchNav from "./SavedSearchNav.vue";
import SiteModeSwitcher from "./SiteModeSwitcher.vue";

withDefaults(
  defineProps<{
    /** primary = Home + Site; secondary = saved searches + trailing; all = both */
    section?: "primary" | "secondary" | "all";
  }>(),
  { section: "all" },
);

const home = useHomeNavigationItem();
const trailing = useTrailingNavigationItems();
</script>
