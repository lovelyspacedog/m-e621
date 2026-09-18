/**
 * Desktop Settings overlay — keep the current page mounted; mobile keeps
 * full-page /settings* routes.
 */
import { computed, inject, reactive, type InjectionKey } from "vue";
import type { RouteLocationRaw, Router } from "vue-router";

export type SettingsOverlayNav = {
  active: boolean;
  section: string;
  hash: string;
  navigate: (section: string, hash?: string) => void;
  back: (to?: string | { name: string; path?: string }) => void;
};

export const SETTINGS_OVERLAY_NAV_KEY: InjectionKey<SettingsOverlayNav> =
  Symbol("settingsOverlayNav");

const SETTINGS_ROUTE_NAMES = new Set([
  "Settings",
  "AccountSettings",
  "PostSettings",
  "BlacklistSettings",
  "AppearanceSettings",
  "Themes",
  "HistorySettings",
  "RestoreSettings",
  "Infos",
  "ShortcutSettings",
]);

const NAME_TO_SECTION: Record<string, string> = {
  Settings: "hub",
  AccountSettings: "account",
  PostSettings: "posts",
  BlacklistSettings: "blacklist",
  AppearanceSettings: "appearance",
  Themes: "appearance/themes",
  HistorySettings: "history",
  RestoreSettings: "restore",
  Infos: "info",
  ShortcutSettings: "shortcuts",
};

const SECTION_TO_ROUTE: Record<string, { name: string; path: string }> = {
  hub: { name: "Settings", path: "/settings" },
  account: { name: "AccountSettings", path: "/settings/account" },
  posts: { name: "PostSettings", path: "/settings/posts" },
  blacklist: { name: "BlacklistSettings", path: "/settings/blacklist" },
  appearance: { name: "AppearanceSettings", path: "/settings/appearance" },
  "appearance/themes": { name: "Themes", path: "/settings/appearance/themes" },
  history: { name: "HistorySettings", path: "/settings/history" },
  restore: { name: "RestoreSettings", path: "/settings/restore" },
  info: { name: "Infos", path: "/settings/info" },
  shortcuts: { name: "ShortcutSettings", path: "/settings/shortcuts" },
};

const state = reactive({
  open: false,
  section: "hub",
  hash: "",
});

let router: Router | null = null;
let getMobile: () => boolean = () => false;
/** Avoid feedback loops when the route guard / watcher drives open state. */
let syncingQuery = false;

export const settingsOverlayState = state;

export const isSettingsOverlayOpen = computed(() => state.open);

export function installSettingsOverlay(r: Router, mobile: () => boolean) {
  router = r;
  getMobile = mobile;
}

export function isSettingsRouteName(name: unknown): boolean {
  return typeof name === "string" && SETTINGS_ROUTE_NAMES.has(name);
}

export function sectionFromSettingsPath(path: string): string {
  const cleaned = path.replace(/\/+$/, "") || "/";
  if (cleaned === "/settings") return "hub";
  if (!cleaned.startsWith("/settings/")) return "hub";
  const rest = cleaned.slice("/settings/".length);
  return rest || "hub";
}

export function sectionFromRouteName(name: unknown): string {
  if (typeof name !== "string") return "hub";
  return NAME_TO_SECTION[name] ?? "hub";
}

export function routeLocationForSection(
  section: string,
  hash?: string,
): RouteLocationRaw {
  const key = section || "hub";
  const dest = SECTION_TO_ROUTE[key] ?? SECTION_TO_ROUTE.hub;
  return {
    name: dest.name,
    hash: hash ? (hash.startsWith("#") ? hash : `#${hash}`) : undefined,
  };
}

export function queryValueForSection(section: string): string {
  return section && section !== "hub" ? section : "hub";
}

export function parseSettingsTarget(
  to?: RouteLocationRaw | string | null,
): { section: string; hash: string } {
  if (to == null || to === "") {
    return { section: "hub", hash: "" };
  }
  if (typeof to === "string") {
    const [pathPart, hashPart] = to.split("#");
    if (pathPart.startsWith("/settings")) {
      return {
        section: sectionFromSettingsPath(pathPart),
        hash: hashPart || "",
      };
    }
    if (SECTION_TO_ROUTE[pathPart]) {
      return { section: pathPart, hash: hashPart || "" };
    }
    return { section: "hub", hash: hashPart || "" };
  }
  if (typeof to === "object") {
    const name = "name" in to ? to.name : undefined;
    const path = "path" in to && typeof to.path === "string" ? to.path : "";
    const hashRaw = "hash" in to && typeof to.hash === "string" ? to.hash : "";
    const hash = hashRaw.replace(/^#/, "");
    if (typeof name === "string" && NAME_TO_SECTION[name]) {
      return { section: NAME_TO_SECTION[name], hash };
    }
    if (path.startsWith("/settings")) {
      return { section: sectionFromSettingsPath(path), hash };
    }
  }
  return { section: "hub", hash: "" };
}

function stripSettingsQuery() {
  if (!router) return;
  const current = router.currentRoute.value;
  if (!("settings" in current.query)) return;
  const query = { ...current.query };
  delete query.settings;
  syncingQuery = true;
  void router.replace({ query, hash: current.hash }).finally(() => {
    syncingQuery = false;
  });
}

function writeSettingsQuery(section: string) {
  if (!router) return;
  const current = router.currentRoute.value;
  if (current.path.startsWith("/settings")) return;
  const value = queryValueForSection(section);
  if (current.query.settings === value) return;
  syncingQuery = true;
  void router
    .replace({
      query: { ...current.query, settings: value },
      hash: current.hash,
    })
    .finally(() => {
      syncingQuery = false;
    });
}

export function isSettingsQuerySyncing() {
  return syncingQuery;
}

/** Open overlay (desktop) or navigate to settings routes (mobile). */
export function openSettings(to?: RouteLocationRaw | string | null) {
  const { section, hash } = parseSettingsTarget(to);
  if (getMobile()) {
    void router?.push(routeLocationForSection(section, hash || undefined));
    return;
  }
  state.open = true;
  state.section = section || "hub";
  state.hash = hash || "";
  writeSettingsQuery(state.section);
  queueHashScroll(state.hash);
}

/** Apply overlay state without touching the router (used by route guard / query watch). */
export function applySettingsOverlay(section: string, hash = "") {
  state.open = true;
  state.section = section || "hub";
  state.hash = hash || "";
  queueHashScroll(state.hash);
}

export function closeSettings() {
  state.open = false;
  state.hash = "";
  stripSettingsQuery();
}

export function navigateSettings(section: string, hash = "") {
  if (getMobile()) {
    void router?.push(routeLocationForSection(section, hash || undefined));
    return;
  }
  state.open = true;
  state.section = section || "hub";
  state.hash = hash || "";
  writeSettingsQuery(state.section);
  queueHashScroll(state.hash);
}

export function backInSettingsOverlay(
  to: string | { name: string; path?: string } = { name: "Settings" },
) {
  const { section, hash } = parseSettingsTarget(
    typeof to === "string" ? to : to,
  );
  navigateSettings(section, hash);
}

function queueHashScroll(hash: string) {
  if (!hash) return;
  const id = hash.startsWith("settings-") ? hash : `settings-${hash}`;
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export function useSettingsOverlayNav(): SettingsOverlayNav | null {
  return inject(SETTINGS_OVERLAY_NAV_KEY, null);
}

export function createSettingsOverlayNav(): SettingsOverlayNav {
  return {
    get active() {
      return state.open;
    },
    get section() {
      return state.section;
    },
    get hash() {
      return state.hash;
    },
    navigate: navigateSettings,
    back: backInSettingsOverlay,
  };
}

/** Fallback path when a desktop user lands on /settings* directly. */
export function settingsDesktopFallbackPath(
  fromPath: string | undefined,
): string {
  if (fromPath && !fromPath.startsWith("/settings")) return fromPath;
  return "/";
}
