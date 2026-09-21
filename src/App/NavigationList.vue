<template>
  <v-list class="pa-0" :class="section === 'primary' ? 'mt-3' : section === 'all' ? 'mt-3' : 'mt-1'">
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
      <v-list-item
        v-if="!siteMode.isNews"
        :active="posts.sfwOnly"
        @click="posts.sfwOnly = !posts.sfwOnly"
      >
        <template #prepend>
          <v-icon>{{ posts.sfwOnly ? "mdi-shield-check" : "mdi-shield-outline" }}</v-icon>
        </template>
        <v-list-item-title>SFW only</v-list-item-title>
        <template #append>
          <v-switch
            :model-value="posts.sfwOnly"
            color="accent"
            hide-details
            density="compact"
            @click.stop
            @update:model-value="(v: boolean | null) => { posts.sfwOnly = !!v }"
          />
        </template>
      </v-list-item>
      <saved-search-nav />
      <template v-for="option in trailingBeforeTools" :key="option.resolved">
        <v-list-item
          v-if="option.to.name === 'Settings'"
          @click="openSettings({ name: 'Settings' })"
        >
          <template #prepend>
            <v-icon>{{ option.icon }}</v-icon>
          </template>
          <v-list-item-title>{{ option.name }}</v-list-item-title>
        </v-list-item>
        <v-list-item v-else :to="option.to" :exact="option.exact">
          <template #prepend>
            <v-badge
              v-if="option.badge"
              :content="option.badge > 99 ? '99+' : option.badge"
              color="primary"
              floating
            >
              <v-icon>{{ option.icon }}</v-icon>
            </v-badge>
            <v-icon v-else>{{ option.icon }}</v-icon>
          </template>
          <v-list-item-title>{{ option.name }}</v-list-item-title>
        </v-list-item>
        <!-- Federated Pools page injects site toggles between Pools and Tools -->
        <portal-target
          v-if="option.to.name === 'Pools'"
          name="sidebar-pool-sites"
        />
      </template>

      <v-list-group v-if="toolItems.length" value="tools" fluid>
        <template #activator="{ props }">
          <v-list-item v-bind="props" :active="toolsGroupActive">
            <template #prepend>
              <v-icon>mdi-toolbox-outline</v-icon>
            </template>
            <v-list-item-title>Tools</v-list-item-title>
          </v-list-item>
        </template>
        <v-list-item
          v-for="tool in toolItems"
          :key="tool.resolved"
          :to="tool.to"
          :exact="tool.exact"
          density="compact"
        >
          <template #prepend>
            <v-icon size="small">{{ tool.icon }}</v-icon>
          </template>
          <v-list-item-title>{{ tool.name }}</v-list-item-title>
        </v-list-item>
      </v-list-group>

      <template v-for="option in trailingAfterTools" :key="option.resolved">
        <v-list-item
          v-if="option.to.name === 'Settings'"
          @click="openSettings({ name: 'Settings' })"
        >
          <template #prepend>
            <v-icon>{{ option.icon }}</v-icon>
          </template>
          <v-list-item-title>{{ option.name }}</v-list-item-title>
        </v-list-item>
        <v-list-item v-else :to="option.to" :exact="option.exact">
          <template #prepend>
            <v-icon>{{ option.icon }}</v-icon>
          </template>
          <v-list-item-title>{{ option.name }}</v-list-item-title>
        </v-list-item>
      </template>
    </template>
  </v-list>
</template>

<script setup lang="ts">
import {
  useHomeNavigationItem,
  useToolNavigationItems,
  useTrailingNavigationItems,
} from "../App/navigation";
import SavedSearchNav from "./SavedSearchNav.vue";
import SiteModeSwitcher from "./SiteModeSwitcher.vue";
import { openSettings } from "@/Settings/settingsOverlay";
import { usePostsStore, useSiteModeStore } from "@/services";
import { computed } from "vue";
import { useRoute } from "vue-router";

const posts = usePostsStore();
const siteMode = useSiteModeStore();
const route = useRoute();

withDefaults(
  defineProps<{
    /** primary = Home + Site; secondary = saved searches + trailing; all = both */
    section?: "primary" | "secondary" | "all";
  }>(),
  { section: "all" },
);

const home = useHomeNavigationItem();
const trailing = useTrailingNavigationItems();
const toolItems = useToolNavigationItems();

const trailingBeforeTools = computed(() =>
  trailing.value.filter(
    (o) => o.to.name !== "Settings" && o.to.name !== "Starred",
  ),
);
const trailingAfterTools = computed(() =>
  trailing.value.filter(
    (o) => o.to.name === "Starred" || o.to.name === "Settings",
  ),
);

const toolRouteNames = computed(
  () => new Set(toolItems.value.map((t) => t.to.name)),
);
const toolsGroupActive = computed(() =>
  toolRouteNames.value.has(String(route.name)),
);
</script>
