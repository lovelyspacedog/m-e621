import { useMainStore } from "./state";
import localforage from "localforage";
// TODO: remove localforage and implement persistance ourselves
import type {
  FavoriteTagEntry,
  FavoriteTagGroup,
  ISettingsServiceState
} from "./types";
import {
  DataSaverType,
  FullscreenZoomUiMode,
  SITE_MODE_URLS,
  UNGROUPED_FAVORITE_GROUP_ID,
} from "./types";
import clone from "clone";
import { nextTick, reactive, toRaw } from "vue";
import {
  defaultSettings,
  focusSearchShortcut,
  fullscreenFavoriteShortcuts,
  fullscreenSlideshowShortcut,
} from "./defaultSettings";
import { debug } from "@/misc/util/debug";
import {
  applyActiveProfileToMirrors,
  createEmptySiteProfile,
  profileFromMirrors,
  syncMirrorsToActiveProfile,
} from "./siteProfiles";

localforage.config({
  description: "",
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
  name: "material-e621",
  storeName: "material_e621",
});

const log = debug("app:PersistanceService");

const toPlain = (value: unknown): unknown => {
  const raw = toRaw(value);
  if (Array.isArray(raw)) return raw.map(toPlain);
  if (raw && typeof raw === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(raw as object)) {
      out[key] = toPlain((raw as Record<string, unknown>)[key]);
    }
    return out;
  }
  return raw;
};

class PersistanceService {
  private applying = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private main: ReturnType<typeof useMainStore>) { }

  /** Queue a save after the current Pinia/Vue flush. Never walk reactive state
   *  inside $subscribe — JSON.stringify of proxies re-triggers the deep watcher
   *  and freezes the tab (Chrome "Page Unresponsive"). */
  private scheduleSave() {
    if (this.applying || this.saveTimer != null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveState();
    }, 0);
  }

  public async saveState() {
    if (this.applying) return;
    // Detached snapshot only — never write back into the live store here.
    const snapshot = JSON.parse(
      JSON.stringify(toPlain(this.main.$state)),
    ) as ISettingsServiceState;
    syncMirrorsToActiveProfile(snapshot);
    await this.saveToLocalStorage("state", snapshot);
    log("saved state");
  }
  public async loadState() {
    const savedState = await this.getFromLocalStorage<ISettingsServiceState>(
      "state",
    );
    if (savedState?.snackbar) {
      savedState.snackbar = null;
    }
    if (savedState) {
      this.setState(savedState);
    }
  }
  public async stateToFile() {
    const snapshot = JSON.parse(JSON.stringify(this.getState())) as ISettingsServiceState;
    syncMirrorsToActiveProfile(snapshot);
    return new File([JSON.stringify(snapshot)], "material-e621-settings.json", {
      type: "text/plain",
    });
  }
  public async loadStateFromFile(file: File) {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        const fileContent = event?.target?.result;
        if (typeof fileContent !== "string") {
          return reject("file content must be a string");
        }
        const settings = JSON.parse(fileContent);
        // TODO: test if correct
        this.setState(settings);
        return resolve();
      };

      reader.readAsText(file, "utf");
    });
  }

  public async persist() {
    await this.loadState();
    this.main.$subscribe(() => {
      this.scheduleSave();
    });
  }

  public resetStateToDefault() {
    this.setState(clone(defaultSettings));
  }

  private serializeState() {
    return JSON.stringify(this.main.$state);
  }

  public getState() {
    return toRaw(this.main.$state);
  }

  public setState(newState: ISettingsServiceState) {
    this.applying = true;
    this.applyMigrationsAndReplace(newState);
    // Pinia $subscribe is async (flush: pre). Keep the gate up until watchers run.
    nextTick(() => {
      this.applying = false;
    });
  }

  private applyMigrationsAndReplace(newState: ISettingsServiceState) {
    // migrations
    if (!newState.configVersion) {
      newState.configVersion = 1;
      newState.configVersion = 1; // to satisfy ts
    }
    if (newState.configVersion < 2) {
      newState.shortcuts = reactive(clone(defaultSettings.shortcuts));
      newState.configVersion = 2;
    }
    if (newState.configVersion < 3) {
      newState.favorites = reactive(clone(defaultSettings.favorites));
      newState.configVersion = 3;
    }
    if (newState.configVersion < 4) {
      newState.posts.lazyLoadImages = defaultSettings.posts.lazyLoadImages
      newState.configVersion = 4;
    }
    if (newState.configVersion < 5) {
      newState.shortcuts.push(focusSearchShortcut);
      newState.configVersion = 5;
    }
    if (newState.configVersion < 6) {
      // remove need for fallbacks in stores
      if (!newState.appearance.toolbar) {
        newState.appearance.toolbar = defaultSettings.appearance.toolbar;
      }
      if (typeof newState.posts.fullscreenZoomUiMode !== "number") {
        newState.posts.fullscreenZoomUiMode = defaultSettings.posts.fullscreenZoomUiMode;
      }
      if (!newState.posts.dataSaver) {
        newState.posts.dataSaver = DataSaverType.auto;
      }
      newState.configVersion = 6;
    }
    if (newState.configVersion < 7) {
      newState.shortcuts.push(...fullscreenFavoriteShortcuts);
      newState.configVersion = 7;
    }
    if (newState.configVersion < 8) {
      newState.posts.autoLoadNext = defaultSettings.posts.autoLoadNext;
      newState.configVersion = 8;
    }
    if (newState.configVersion < 9) {
      newState.misc = reactive(clone(defaultSettings.misc));
      newState.configVersion = 9;
    }
    if (newState.configVersion < 10) {
      newState.searches = reactive(clone(defaultSettings.searches));
      newState.configVersion = 10;
    }
    if (newState.configVersion < 11) {
      const old = newState.blacklist.tags as unknown as string[];
      newState.blacklist.tags = reactive(old.map(tag => [tag]));
      newState.appearance.hideGithubInfo = defaultSettings.appearance.hideGithubInfo;
      newState.blacklist.hideServerSideBlacklisted = defaultSettings.blacklist.hideServerSideBlacklisted;
      newState.configVersion = 11;
    }
    if (newState.configVersion < 12) {
      newState.appearance.hideMigrationInfo = defaultSettings.appearance.hideMigrationInfo;
      newState.configVersion = 12;
    }
    if (newState.configVersion < 13) {
      newState.posts.fullWidthFeed = defaultSettings.posts.fullWidthFeed;
      newState.posts.slideshowIntervalMs = defaultSettings.posts.slideshowIntervalMs;
      if (!newState.shortcuts.some((s) => s.action === "fullscreen_slideshow_toggle")) {
        newState.shortcuts.push(clone(fullscreenSlideshowShortcut));
      }

      const fav = newState.favorites as {
        groups?: FavoriteTagGroup[];
        tags:
          | FavoriteTagEntry[]
          | { [category: string]: { [tag: string]: true | string } };
      };
      if (!Array.isArray(fav.groups) || !Array.isArray(fav.tags)) {
        const oldMap =
          fav.tags && !Array.isArray(fav.tags)
            ? (fav.tags as { [category: string]: { [tag: string]: true | string } })
            : {};
        const groups: FavoriteTagGroup[] = [
          {
            id: UNGROUPED_FAVORITE_GROUP_ID,
            name: "Ungrouped",
            collapsed: false,
            order: 0,
          },
        ];
        const tags: FavoriteTagEntry[] = [];
        let groupOrder = 1;
        for (const [category, tagMap] of Object.entries(oldMap)) {
          const groupId = `migrated-${category}`;
          groups.push({
            id: groupId,
            name: category,
            collapsed: false,
            order: groupOrder++,
          });
          let tagOrder = 0;
          for (const [name, display] of Object.entries(tagMap || {})) {
            tags.push({
              id: `tag-${category}-${encodeURIComponent(name)}`,
              name,
              category,
              display: typeof display === "string" ? display : undefined,
              groupId,
              order: tagOrder++,
            });
          }
        }
        newState.favorites = reactive({ groups, tags });
      }
      newState.configVersion = 13;
    }
    if (newState.configVersion < 14) {
      newState.posts.saveLocal = reactive(clone(defaultSettings.posts.saveLocal));
      const ensureButton = (list: typeof newState.posts.buttons) => {
        if (!list.includes("save_local")) list.push("save_local");
      };
      ensureButton(newState.posts.fullscreenButtons);
      ensureButton(newState.posts.detailsButtons);
      newState.configVersion = 14;
    }
    if (newState.configVersion < 15) {
      if (!newState.posts.buttons.includes("save_local")) {
        newState.posts.buttons.push("save_local");
      }
      newState.configVersion = 15;
    }
    if (newState.configVersion < 16) {
      const mode =
        newState.misc?.urls?.e621?.includes("e6ai") ? "e6ai" as const : "e621" as const;
      newState.activeMode = mode;
      newState.profiles = {
        e621: createEmptySiteProfile("e621"),
        e6ai: createEmptySiteProfile("e6ai"),
      };
      // Current flat fields become the active mode's profile (usually e621).
      newState.profiles[mode] = profileFromMirrors({
        ...newState,
        activeMode: mode,
        profiles: newState.profiles,
      } as ISettingsServiceState);
      if (mode === "e621") {
        newState.profiles.e6ai = createEmptySiteProfile("e6ai");
      } else {
        newState.profiles.e621 = createEmptySiteProfile("e621");
        // Keep default Hot/Popular on e621 for when user switches back.
        newState.profiles.e621.searches = clone(defaultSettings.profiles.e621.searches);
      }
      newState.configVersion = 16;
    }

    // Ensure profiles exist even if a partial export skipped them.
    if (!newState.profiles?.e621 || !newState.profiles?.e6ai) {
      newState.activeMode = newState.activeMode || "e621";
      newState.profiles = {
        e621: newState.profiles?.e621 || createEmptySiteProfile("e621"),
        e6ai: newState.profiles?.e6ai || createEmptySiteProfile("e6ai"),
      };
      if (!newState.profiles.e621.account) {
        newState.profiles.e621 = profileFromMirrors({
          ...newState,
          activeMode: "e621",
          profiles: newState.profiles,
        } as ISettingsServiceState);
      }
    }
    if (!newState.activeMode) {
      newState.activeMode = "e621";
    }
    // Normalize base URLs
    newState.profiles.e621.baseUrl =
      newState.profiles.e621.baseUrl || SITE_MODE_URLS.e621;
    newState.profiles.e6ai.baseUrl =
      newState.profiles.e6ai.baseUrl || SITE_MODE_URLS.e6ai;

    applyActiveProfileToMirrors(newState);
    // Official Vercel proxy only allows avoonix origins; use same-origin /api/.
    if (
      !newState.misc?.urls?.proxy ||
      newState.misc.urls.proxy.includes("material-e621-proxy.vercel.app")
    ) {
      newState.misc.urls.proxy = "/api/";
    }
    this.main.$state = newState;
  }

  private saveToLocalStorage<T>(key: string, value: T): Promise<T> {
    return localforage.setItem<T>(key, value);
  }
  private getFromLocalStorage<T>(key: string): Promise<T | null> {
    return localforage.getItem<T>(key);
  }
  private deleteFromLocalStorage(key: string): Promise<void> {
    return localforage.removeItem(key);
  }
}

let persistanceService: PersistanceService | null = null;

export const usePersistanceService = () => {
  if (!persistanceService)
    persistanceService = new PersistanceService(useMainStore());
  return persistanceService;
};
