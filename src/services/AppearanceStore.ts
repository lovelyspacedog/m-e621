import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";
import type { ISettingsServiceState } from "./types";
import { systemPrefersDark } from "@/misc/util/systemColorScheme";

export type ColorScheme = "system" | "dark" | "light";

export const useAppearanceStore = defineStore("appearance", () => {
  const main = useMainStore();

  const primaryColor = computed({
    get() {
      return main.appearance.primary;
    },
    set(value) {
      main.appearance.primary = value;
    },
  });

  const secondaryColor = computed({
    get() {
      return main.appearance.secondary;
    },
    set(value) {
      main.appearance.secondary = value;
    },
  });

  const accentColor = computed({
    get() {
      return main.appearance.accent;
    },
    set(value) {
      main.appearance.accent = value;
    },
  });

  const backgroundColor = computed({
    get() {
      return main.appearance.background;
    },
    set(value) {
      main.appearance.background = value;
    },
  });

  const toolbarColor = computed({
    get() {
      return main.appearance.toolbar;
    },
    set(value) {
      main.appearance.toolbar = value;
    },
  });

  const sidebarColor = computed({
    get() {
      return main.appearance.sidebar;
    },
    set(value) {
      main.appearance.sidebar = value;
    },
  });

  const colorScheme = computed({
    get(): ColorScheme {
      const scheme = main.appearance.colorScheme;
      if (scheme === "system" || scheme === "dark" || scheme === "light") {
        return scheme;
      }
      return main.appearance.dark ? "dark" : "light";
    },
    set(value: ColorScheme) {
      main.appearance.colorScheme = value;
      if (value === "dark") main.appearance.dark = true;
      else if (value === "light") main.appearance.dark = false;
      else main.appearance.dark = systemPrefersDark();
    },
  });

  /** Effective dark flag (resolves `"system"` against the OS). */
  const dark = computed({
    get() {
      if (colorScheme.value === "system") return systemPrefersDark();
      if (colorScheme.value === "light") return false;
      if (colorScheme.value === "dark") return true;
      return main.appearance.dark;
    },
    set(value: boolean) {
      main.appearance.dark = value;
      main.appearance.colorScheme = value ? "dark" : "light";
    },
  });

  /** Sync stored `dark` when OS preference changes under `"system"`. */
  const syncSystemDark = () => {
    if (main.appearance.colorScheme !== "system") return;
    main.appearance.dark = systemPrefersDark();
  };

  const fullscreenTransition = computed({
    get() {
      return main.appearance.transition.fullscreen;
    },
    set(value) {
      main.appearance.transition.fullscreen = value;
    },
  });

  const routeTransition = computed({
    get() {
      return main.appearance.transition.route;
    },
    set(value) {
      main.appearance.transition.route = value;
    },
  });

  const ratingStripe = computed({
    get() {
      return main.appearance.coloredRatingStripe;
    },
    set(value) {
      main.appearance.coloredRatingStripe = value;
    },
  });

  const navigationType = computed({
    get() {
      return main.appearance.navigationType;
    },
    set(value) {
      main.appearance.navigationType = value;
    },
  });

  const logoStyle = computed({
    get() {
      return main.appearance.logoStyle;
    },
    set(value) {
      main.appearance.logoStyle = value;
    },
  });

  const logoStyles = computed<
    ISettingsServiceState["appearance"]["logoStyle"][]
  >(() => ["face", "text"]);

  const hideInstallPrompt = computed({
    get() {
      return main.appearance.hideInstallPrompt;
    },
    set(value) {
      main.appearance.hideInstallPrompt = value;
    },
  });

  const hideGithubInfo = computed({
    get() {
      return main.appearance.hideGithubInfo;
    },
    set(value) {
      main.appearance.hideGithubInfo = value;
    },
  });

  const hideMigrationInfo = computed({
    get() {
      return main.appearance.hideMigrationInfo;
    },
    set(value) {
      main.appearance.hideMigrationInfo = value;
    },
  });

  const isTipDismissed = (tipId: string) =>
    !!main.appearance.dismissedTips?.[tipId];

  const dismissTip = (tipId: string) => {
    if (!main.appearance.dismissedTips) {
      main.appearance.dismissedTips = {};
    }
    main.appearance.dismissedTips[tipId] = true;
  };

  /** Re-enable all tip dialogs dismissed via “Don't show this again”. */
  const resetTips = () => {
    main.appearance.dismissedTips = {};
  };

  const pawCursor = computed({
    get() {
      return main.appearance.pawCursor;
    },
    set(value) {
      main.appearance.pawCursor = value;
    },
  });

  const applyTheme = (theme: Theme) => {
    primaryColor.value = theme.primary;
    secondaryColor.value = theme.secondary;
    accentColor.value = theme.accent;
    backgroundColor.value = theme.background;
    sidebarColor.value = theme.sidebar;
    toolbarColor.value = theme.toolbar;
    dark.value = theme.dark;
  };

  const theme = computed<Theme>(() => ({
    primary: primaryColor.value,
    secondary: secondaryColor.value,
    accent: accentColor.value,
    background: backgroundColor.value,
    sidebar: sidebarColor.value,
    toolbar: toolbarColor.value,
    dark: dark.value,
  }));

  return {
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor,
    toolbarColor,
    sidebarColor,
    dark,
    colorScheme,
    syncSystemDark,
    fullscreenTransition,
    routeTransition,
    ratingStripe,
    navigationType,
    logoStyle,
    logoStyles,
    hideInstallPrompt,
    applyTheme,
    theme,
    hideGithubInfo,
    hideMigrationInfo,
    isTipDismissed,
    dismissTip,
    resetTips,
    pawCursor,
  };
});

export interface Theme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  sidebar: string;
  toolbar: string;
  dark: boolean;
}

export type ThemeItem = Theme & { name: string };
