<template>
  <v-app :class="{ 'paw-cursor': appearance.pawCursor }">
    <v-navigation-drawer v-if="!minimalHeader" :color="theme.sidebar" v-model="drawer" floating
      :width="mobile ? 300 : 400" class="pa-2 app-sidebar">
      <div class="sidebar-sticky">
        <div class="d-flex align-center">
          <router-link to="/" class="sidebar-logo-link flex-grow-1 min-w-0">
            <app-logo v-view-transition-name="'applogo'" :type="logoStyle" />
          </router-link>
          <v-btn
            v-if="mobile"
            icon
            variant="text"
            aria-label="Close menu"
            @click="drawer = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
        <navigation-list section="primary" />
      </div>
      <div class="sidebar-scroll">
        <navigation-list section="secondary" />
        <portal-target name="sidebar-suggestions" />
      </div>
    </v-navigation-drawer>
    <v-app-bar v-view-transition-name="'appbar'" :color="minimalHeader ? theme.primary : theme.toolbar"
      :flat="minimalHeader" :floating="navMode == 'floating'" :class="{
        'ma-2': navMode == 'floating',
        'mb-3': navMode == 'floating',
        primary: minimalHeader,
      }" class="padded-toolbar">
      <v-menu location="bottom right" close-delay="0"
        v-if="navMode == 'floating' && !minimalHeader">
        <template #activator="{ props }">
          <v-btn v-bind="props" icon>
            <v-icon>mdi-menu</v-icon>
          </v-btn>
        </template>
        <navigation-list />
      </v-menu>
      <v-slide-x-transition>
        <!-- Match useDisplay().mobile (md / <960), not hidden-lg-and-up (<1280) -->
        <v-app-bar-nav-icon
          v-if="mobile && navMode == 'sidebar' && !minimalHeader"
          @click.stop="drawer = !drawer"
        />
      </v-slide-x-transition>
      <history-nav-buttons v-if="!minimalHeader && !mobile" class="mr-1" />
      <portal-target name="toolbar">
        <v-toolbar-title>{{ appName }}</v-toolbar-title>
      </portal-target>
      <v-spacer />
      <v-tooltip v-if="!minimalHeader" text="SFW only (safe rating)" location="bottom">
        <template #activator="{ props: tipProps }">
          <v-btn
            v-bind="tipProps"
            icon
            variant="text"
            :color="posts.sfwOnly ? 'success' : undefined"
            :aria-label="posts.sfwOnly ? 'SFW only on' : 'SFW only off'"
            :aria-pressed="posts.sfwOnly"
            @click="posts.sfwOnly = !posts.sfwOnly"
          >
            <v-icon>{{ posts.sfwOnly ? "mdi-shield-check" : "mdi-shield-outline" }}</v-icon>
          </v-btn>
        </template>
      </v-tooltip>
      <navigation-toolbar v-if="navMode === 'toolbar'" />
      <install-menu v-if="!minimalHeader" />
    </v-app-bar>
    <main-content />
    <pwa-update-banner />
    <app-snackbar />
    <TipDialog
      :tip-id="TIP_IDS.federatedMode"
      title="Federated mode"
      v-model="federatedTipOpen"
    >
      <p class="mb-3">
        Federated merges posts from several sites into one feed. On the landing
        site chips, tap a site to include or exclude it from the search (at least
        one must stay on). Local, Tailspace, and Flayrah stay greyed out — they
        are not part of Federated search.
      </p>
      <p class="mb-0">
        Tap Federated or the close icon to leave and return to your previous
        site. Use the sidebar later if you want Following instead of Search.
      </p>
    </TipDialog>
    <SettingsOverlay />
  </v-app>
</template>

<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { computed, nextTick, onMounted, ref, watch } from "vue";
import AppLogo from "./App/AppLogo.vue";
import AppSnackbar from "./App/AppSnackbar.vue";
import HistoryNavButtons from "./App/HistoryNavButtons.vue";
import InstallMenu from "./App/InstallMenu.vue";
import MainContent from "./App/MainContent.vue";
import NavigationList from "./App/NavigationList.vue";
import NavigationToolbar from "./App/NavigationToolbar.vue";
import PwaUpdateBanner from "./App/PwaUpdateBanner.vue";
import TipDialog from "./misc/TipDialog.vue";
import { TIP_IDS } from "./misc/tipIds";
import { useTipOpen } from "./misc/useTipOpen";
import { getAppName } from "./misc/util/utilities";
import { useAppearanceStore, useMainStore, usePersistanceService, usePostsStore, useShortcutService, useSiteModeStore } from "./services";
import { useHead } from '@unhead/vue';
import { useDisplay } from 'vuetify';
import { useSyncedTheme } from "./misc/util/syncTheme";
import { installOfflineSaveQueueListeners, flushOfflineSaveQueue } from "./misc/util/offlineSaveQueue";
import SettingsOverlay from "./Settings/SettingsOverlay.vue";
import {
  applySettingsOverlay,
  closeSettings,
  installSettingsOverlay,
  isSettingsQuerySyncing,
  queryValueForSection,
  routeLocationForSection,
  sectionFromSettingsPath,
  settingsOverlayState,
} from "./Settings/settingsOverlay";

const persistance = usePersistanceService();
const appearance = useAppearanceStore();
const posts = usePostsStore();
const shortcutService = useShortcutService();
const siteMode = useSiteModeStore();
const navMode = computed(() => appearance.navigationType);
const theme = computed(() => appearance.theme);
const { open: federatedTipOpen, tryOpenOnEdge: tryFederatedTip } = useTipOpen(
  TIP_IDS.federatedMode,
);

useSyncedTheme();
installOfflineSaveQueueListeners();

const route = useRoute();
const router = useRouter();
const { mobile } = useDisplay();
installSettingsOverlay(router, () => mobile.value);

/** After settings hydrate; avoids demoting before restored activeMode is loaded. */
const settingsHydrated = ref(false);

onMounted(async () => {
  await persistance.persist();
  siteMode.ensureCompatibleActiveMode();
  settingsHydrated.value = true;
  if (route.name === "LandingPage") {
    siteMode.demoteUnifiedOnLanding({ fromBrowsePosts: false });
  }
  // Bind immediately — $subscribe alone waits for the first mutation (M30).
  shortcutService.setUpShortcuts();
  if (navigator.onLine) {
    void flushOfflineSaveQueue();
  }
});

watch(() => siteMode.isUnified, tryFederatedTip);
const logoStyle = computed(() => appearance.logoStyle);

const main = useMainStore();

main.$subscribe(() => {
  shortcutService.setUpShortcuts();
})
watch(main.shortcuts, () => console.log("shortcuts updated"))

useHead({
  title: getAppName(),
})

watch(
  () => [route.query.settings, mobile.value, route.path] as const,
  ([settingsQuery, isMobile, path]) => {
    if (isSettingsQuerySyncing()) return;
    const raw = Array.isArray(settingsQuery) ? settingsQuery[0] : settingsQuery;
    if (typeof raw !== "string" || !raw) return;
    if (isMobile) {
      const section = raw === "hub" ? "hub" : raw;
      const dest = routeLocationForSection(section);
      const query = { ...route.query };
      delete query.settings;
      if (typeof dest === "object" && dest !== null) {
        void router.replace({ ...dest, query });
      } else {
        void router.replace({ path: String(dest), query });
      }
      return;
    }
    if (path.startsWith("/settings")) return;
    applySettingsOverlay(raw === "hub" ? "hub" : raw);
  },
  { immediate: true },
);

watch(mobile, (isMobile, wasMobile) => {
  // Desktop overlay → mobile full-page settings.
  if (isMobile && wasMobile === false && settingsOverlayState.open) {
    const section = settingsOverlayState.section;
    closeSettings();
    void router.push(routeLocationForSection(section));
    return;
  }
  // Mobile /settings* → desktop overlay (resize / rotate to wide).
  if (
    !isMobile &&
    wasMobile === true &&
    route.path.startsWith("/settings")
  ) {
    const section = sectionFromSettingsPath(route.path);
    const hash = (route.hash || "").replace(/^#/, "");
    applySettingsOverlay(section, hash);
    void router.replace({
      path: "/",
      query: { settings: queryValueForSection(section) },
      hash: hash ? `#${hash}` : undefined,
    });
  }
});

const drawer_ = ref(true);
const appName = getAppName();

const minimalHeader = computed(() => !!route.meta?.minimalHeader);

const drawer = computed({
  get: () =>
    Boolean(
      navMode.value == "sidebar" &&
      (drawer_.value || !mobile.value) &&
      !minimalHeader.value
    ),
  set: (val: boolean) => {
    drawer_.value = val;
  },
});

router.afterEach((to, from) => {
  // Mobile temporary drawer must not cover the destination after nav / Settings.
  if (mobile.value) {
    drawer.value = false;
  }
  if (!settingsHydrated.value) return;
  if (to.name !== "LandingPage") return;
  siteMode.demoteUnifiedOnLanding({ fromBrowsePosts: from.name === "Posts" });
});

watch(mobile, (val, prevVal) => {
  if (navMode.value == "sidebar" && val) {
    drawer.value = false;
  }
  if (prevVal && !val) {
    nextTick(() => {
      drawer.value = false;
      nextTick(() => {
        drawer.value = true;
      });
    });
  }
});


</script>

<style lang="css">
@import "@/misc/styles/global.css";

.app-sidebar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.app-sidebar .v-navigation-drawer__content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}
.sidebar-sticky {
  flex: 0 0 auto;
  position: sticky;
  top: 0;
  z-index: 2;
  background: inherit;
  padding-bottom: 4px;
}
.sidebar-logo-link {
  display: block;
  text-decoration: none;
  color: inherit;
}
.sidebar-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
</style>