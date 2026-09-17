import { useMainStore } from "./state";
import localforage from "localforage";
// TODO: remove localforage and implement persistance ourselves
import type { FavoriteTagEntry, FavoriteTagGroup, ISettingsServiceState } from "./types";
import { DataSaverType, FullscreenZoomUiMode, SITE_MODE_URLS, UNGROUPED_FAVORITE_GROUP_ID } from "./types";
import clone from "clone";
import { nextTick, reactive, toRaw } from "vue";
import { defaultSettings, focusSearchShortcut, fullscreenFavoriteShortcuts, fullscreenSlideshowShortcut, historyNavigationShortcuts } from "./defaultSettings";
import { debug } from "@/misc/util/debug";
import { applyActiveProfileToMirrors, createEmptySiteProfile, profileFromMirrors, syncMirrorsToActiveProfile } from "./siteProfiles";
import { normalizeSavedSearches } from "./savedSearchNormalize";
import { supportsLocalBrowse } from "@/misc/util/tauriLocalFs";

localforage.config({
  description: "",
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
  name: "material-e621",
  storeName: "material_e621",
});

const log = debug("app:PersistanceService");

/** Plain clone for localforage. Must not run inside deep `$subscribe` (freezes tab). */
export const toPlain = (value: unknown): unknown => {
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

  constructor(private main: ReturnType<typeof useMainStore>) {}

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

  private saveInFlight = false;
  private savePending = false;

  public async saveState() {
    if (this.applying) {
      // Defer until setState finishes so imports/migrations are not dropped (H17).
      this.savePending = true;
      return;
    }
    // Serialize writes: if a save is already in flight, queue exactly one
    // follow-up so we always persist the latest state without races.
    if (this.saveInFlight) {
      this.savePending = true;
      return;
    }
    this.saveInFlight = true;
    try {
      // Sync live mirrors into profiles BEFORE snapshotting. Syncing only the
      // detached copy left profiles[activeMode] stale until mode switch (C4).
      syncMirrorsToActiveProfile(this.main.$state);
      const snapshot = JSON.parse(JSON.stringify(toPlain(this.main.$state))) as ISettingsServiceState;
      // Snackbar is transient UI — never persist (L3).
      snapshot.snackbar = null;
      await this.saveToLocalStorage("state", snapshot);
      log("saved state");
    } finally {
      this.saveInFlight = false;
      if (this.savePending) {
        this.savePending = false;
        void this.saveState();
      }
    }
  }
  public async loadState() {
    const savedState = await this.getFromLocalStorage<ISettingsServiceState>("state");
    if (savedState?.snackbar) {
      savedState.snackbar = null;
    }
    if (savedState) {
      this.setState(savedState);
    }
  }
  public async stateToFile() {
    // Flush mirrors + durable save so the download matches what localforage holds.
    await this.saveState();
    const snapshot = JSON.parse(JSON.stringify(this.getState())) as ISettingsServiceState;
    return new File([JSON.stringify(snapshot, null, 2)], "material-e621-settings.json", {
      type: "application/json",
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
        try {
          const settings = JSON.parse(fileContent);
          // TODO: test if correct
          settings.snackbar = null;
          this.setState(settings);
          return resolve();
        } catch (err) {
          return reject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));

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
    // Keep profiles[activeMode] current for migration/export consumers (C4).
    syncMirrorsToActiveProfile(this.main.$state);
    return toRaw(this.main.$state);
  }

  public setState(newState: ISettingsServiceState) {
    this.applying = true;
    this.applyMigrationsAndReplace(newState);
    // Pinia $subscribe is async (flush: pre). Keep the gate up until watchers run.
    nextTick(() => {
      this.applying = false;
      // Always persist after apply — scheduleSave is suppressed while applying (H17/M1).
      void this.saveState();
    });
  }

  private applyMigrationsAndReplace(newState: ISettingsServiceState) {
    // Schema defaults so partial/corrupt imports do not crash mid-migration (M4).
    if (!newState.posts) newState.posts = reactive(clone(defaultSettings.posts));
    if (!newState.appearance) newState.appearance = reactive(clone(defaultSettings.appearance));
    if (!newState.blacklist) newState.blacklist = reactive(clone(defaultSettings.blacklist));
    if (!Array.isArray(newState.shortcuts)) newState.shortcuts = reactive(clone(defaultSettings.shortcuts));
    if (!newState.favorites) newState.favorites = reactive(clone(defaultSettings.favorites));
    if (!newState.history) newState.history = reactive(clone(defaultSettings.history));
    if (!newState.searches) newState.searches = reactive(clone(defaultSettings.searches));
    if (!newState.misc) newState.misc = reactive(clone(defaultSettings.misc));
    if (!newState.account) newState.account = reactive(clone(defaultSettings.account));

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
      newState.posts.lazyLoadImages = defaultSettings.posts.lazyLoadImages;
      newState.configVersion = 4;
    }
    if (newState.configVersion < 5) {
      if (!newState.shortcuts.some((s) => s.action === focusSearchShortcut.action && s.sequence === focusSearchShortcut.sequence)) {
        newState.shortcuts.push(focusSearchShortcut);
      }
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
      for (const shortcut of fullscreenFavoriteShortcuts) {
        if (!newState.shortcuts.some((s) => s.action === shortcut.action && s.sequence === shortcut.sequence)) {
          newState.shortcuts.push(shortcut);
        }
      }
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
      const raw = newState.blacklist?.tags as unknown;
      if (Array.isArray(raw)) {
        const alreadyNested = raw.length === 0 || raw.every((row) => Array.isArray(row));
        if (!alreadyNested) {
          newState.blacklist.tags = reactive((raw as string[]).map((tag) => [String(tag)]));
        } else {
          newState.blacklist.tags = reactive((raw as string[][]).map((row) => (Array.isArray(row) ? row.map((t) => String(t)) : [String(row)])));
        }
      } else {
        newState.blacklist = reactive({
          ...(newState.blacklist || {}),
          tags: [],
          mode: newState.blacklist?.mode ?? defaultSettings.blacklist.mode,
          hideServerSideBlacklisted: newState.blacklist?.hideServerSideBlacklisted ?? defaultSettings.blacklist.hideServerSideBlacklisted,
        });
      }
      if (!newState.appearance) {
        newState.appearance = reactive(clone(defaultSettings.appearance));
      }
      newState.appearance.hideGithubInfo = defaultSettings.appearance.hideGithubInfo;
      if (newState.blacklist) {
        newState.blacklist.hideServerSideBlacklisted = newState.blacklist.hideServerSideBlacklisted ?? defaultSettings.blacklist.hideServerSideBlacklisted;
      }
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
        tags: FavoriteTagEntry[] | { [category: string]: { [tag: string]: true | string } };
      };
      if (!Array.isArray(fav.groups) || !Array.isArray(fav.tags)) {
        const oldMap = fav.tags && !Array.isArray(fav.tags) ? (fav.tags as { [category: string]: { [tag: string]: true | string } }) : {};
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
      const mode = newState.misc?.urls?.e621?.includes("e6ai") ? ("e6ai" as const) : ("e621" as const);
      newState.activeMode = mode;
      newState.profiles = {
        e621: createEmptySiteProfile("e621"),
        e6ai: createEmptySiteProfile("e6ai"),
        local: createEmptySiteProfile("local"),
        tailspace: createEmptySiteProfile("tailspace"),
        furbooru: createEmptySiteProfile("furbooru"),
        inkbunny: createEmptySiteProfile("inkbunny"),
        furaffinity: createEmptySiteProfile("furaffinity"),
        weasyl: createEmptySiteProfile("weasyl"),
        itaku: createEmptySiteProfile("itaku"),
        sofurry: createEmptySiteProfile("sofurry"),
        unified: createEmptySiteProfile("unified"),
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
    if (newState.configVersion < 17) {
      if (!newState.profiles) {
        newState.profiles = {
          e621: createEmptySiteProfile("e621"),
          e6ai: createEmptySiteProfile("e6ai"),
          local: createEmptySiteProfile("local"),
          tailspace: createEmptySiteProfile("tailspace"),
          furbooru: createEmptySiteProfile("furbooru"),
          inkbunny: createEmptySiteProfile("inkbunny"),
          furaffinity: createEmptySiteProfile("furaffinity"),
          weasyl: createEmptySiteProfile("weasyl"),
          itaku: createEmptySiteProfile("itaku"),
          sofurry: createEmptySiteProfile("sofurry"),
          unified: createEmptySiteProfile("unified"),
        };
      } else {
        newState.profiles.local = newState.profiles.local || createEmptySiteProfile("local");
      }
      newState.configVersion = 17;
    }
    if (newState.configVersion < 18) {
      newState.posts.localDirectoryName = null;
      newState.configVersion = 18;
    }
    if (newState.configVersion < 19) {
      newState.posts.cardAutoNext = false;
      newState.posts.cardAutoNextIntervalMs = newState.posts.slideshowIntervalMs || 15000;
      newState.configVersion = 19;
    }
    if (newState.configVersion < 20) {
      newState.posts.compactCards = false;
      newState.posts.videoVolume = 1;
      newState.posts.videoMuted = true;
      newState.posts.videoPlaybackRate = 1;
      newState.configVersion = 20;
    }
    if (newState.configVersion < 21) {
      // Old vim triad: j=exit, h=prev, l=next → match feed j=next, k=prev.
      const shortcuts = [...(newState.shortcuts || [])];
      const isOldExitJ = (s: { action: string; sequence: string }) => s.sequence === "j" && s.action === "fullscreen_exit";
      const isOldPrevH = (s: { action: string; sequence: string }) => s.sequence === "h" && s.action === "fullscreen_previous_post";
      const isOldNextL = (s: { action: string; sequence: string }) => s.sequence === "l" && s.action === "fullscreen_next_post";
      const hadOldTriad = shortcuts.some((s) => isOldExitJ(s) || isOldPrevH(s) || isOldNextL(s));
      let next = shortcuts.filter((s) => !isOldExitJ(s) && !isOldPrevH(s) && !isOldNextL(s));
      if (hadOldTriad) {
        next = next.filter((s) => s.sequence !== "j" && s.sequence !== "k");
        next.push({ action: "fullscreen_next_post", sequence: "j" }, { action: "fullscreen_previous_post", sequence: "k" });
      }
      newState.shortcuts = reactive(next);
      newState.configVersion = 21;
    }
    if (newState.configVersion < 22) {
      newState.posts.feedLayout = "list";
      newState.configVersion = 22;
    }
    if (newState.configVersion < 23) {
      if (newState.profiles && !newState.profiles.furbooru) {
        newState.profiles.furbooru = createEmptySiteProfile("furbooru");
      }
      newState.configVersion = 23;
    }
    if (newState.configVersion < 24) {
      if (newState.profiles && !newState.profiles.inkbunny) {
        newState.profiles.inkbunny = createEmptySiteProfile("inkbunny");
      }
      newState.configVersion = 24;
    }
    if (newState.configVersion < 25) {
      // Saved searches gain collapsible groups (ids + groupId + order).
      newState.searches = reactive(normalizeSavedSearches(newState.searches)) as ISettingsServiceState["searches"];
      if (newState.profiles) {
        for (const mode of Object.keys(newState.profiles) as Array<keyof typeof newState.profiles>) {
          const profile = newState.profiles[mode];
          if (!profile) continue;
          profile.searches = normalizeSavedSearches(profile.searches);
        }
      }
      newState.configVersion = 25;
    }
    if (newState.configVersion < 26) {
      if (newState.profiles && !newState.profiles.unified) {
        newState.profiles.unified = createEmptySiteProfile("unified");
      }
      newState.configVersion = 26;
    }
    if (newState.configVersion < 27) {
      if (newState.profiles && !newState.profiles.furaffinity) {
        newState.profiles.furaffinity = createEmptySiteProfile("furaffinity");
      }
      if (newState.profiles?.unified?.unifiedSites) {
        if (newState.profiles.unified.unifiedSites.furaffinity === undefined) {
          newState.profiles.unified.unifiedSites.furaffinity = true;
        }
      }
      newState.configVersion = 27;
    }
    if (newState.configVersion < 28) {
      if (!newState.savedPosts) {
        newState.savedPosts = { entries: [] };
      } else if (!Array.isArray(newState.savedPosts.entries)) {
        newState.savedPosts.entries = [];
      }
      const ensureBookmark = (list: typeof newState.posts.buttons) => {
        if (!list.includes("bookmark")) list.push("bookmark");
      };
      ensureBookmark(newState.posts.buttons);
      ensureBookmark(newState.posts.fullscreenButtons);
      ensureBookmark(newState.posts.detailsButtons);
      newState.configVersion = 28;
    }
    if (newState.configVersion < 29) {
      newState.posts.alwaysCollapseToolbar = false;
      newState.configVersion = 29;
    }
    if (newState.configVersion < 30) {
      newState.posts.animateFeedGifs = true;
      newState.posts.autoplayFeedVideo = true;
      newState.posts.autoplayFeedVideoSilent = true;
      newState.configVersion = 30;
    }
    if (newState.configVersion < 31) {
      for (const shortcut of historyNavigationShortcuts) {
        if (!newState.shortcuts.some((s) => s.action === shortcut.action && s.sequence === shortcut.sequence)) {
          newState.shortcuts.push(shortcut);
        }
      }
      newState.configVersion = 31;
    }
    if (newState.configVersion < 32) {
      newState.appearance.pawCursor = defaultSettings.appearance.pawCursor;
      newState.configVersion = 32;
    }
    if (newState.configVersion < 33) {
      newState.watchedPools = { entries: [] };
      newState.configVersion = 33;
    }
    if (newState.configVersion < 34) {
      if (newState.profiles?.unified) {
        if (
          newState.profiles.unified.unifiedFeedSource !== "search" &&
          newState.profiles.unified.unifiedFeedSource !== "following"
        ) {
          newState.profiles.unified.unifiedFeedSource = "search";
        }
      }
      newState.configVersion = 34;
    }
    if (newState.configVersion < 35) {
      if (!newState.posts.playbackPrefs) {
        newState.posts.playbackPrefs = {};
      }
      newState.configVersion = 35;
    }
    if (newState.configVersion < 36) {
      // Sidebar declutter: shorter default tag suggestion list.
      if (newState.posts.sidebarSuggestionLimit === 40) {
        newState.posts.sidebarSuggestionLimit = 12;
      }
      newState.configVersion = 36;
    }
    if (newState.configVersion < 37) {
      // Weasyl / Itaku join the other Unified children as on-by-default.
      if (newState.profiles?.unified?.unifiedSites) {
        newState.profiles.unified.unifiedSites.weasyl = true;
        newState.profiles.unified.unifiedSites.itaku = true;
      }
      newState.configVersion = 37;
    }

    if (!newState.watchedPools || !Array.isArray(newState.watchedPools.entries)) {
      newState.watchedPools = { entries: [] };
    }

    // Ensure profiles exist even if a partial export skipped them.
    if (!newState.profiles) {
      newState.profiles = {
        e621: createEmptySiteProfile("e621"),
        e6ai: createEmptySiteProfile("e6ai"),
        local: createEmptySiteProfile("local"),
        tailspace: createEmptySiteProfile("tailspace"),
        furbooru: createEmptySiteProfile("furbooru"),
        inkbunny: createEmptySiteProfile("inkbunny"),
        furaffinity: createEmptySiteProfile("furaffinity"),
        weasyl: createEmptySiteProfile("weasyl"),
        itaku: createEmptySiteProfile("itaku"),
        sofurry: createEmptySiteProfile("sofurry"),
        unified: createEmptySiteProfile("unified"),
      };
    }
    newState.profiles.e621 = newState.profiles.e621 || createEmptySiteProfile("e621");
    newState.profiles.e6ai = newState.profiles.e6ai || createEmptySiteProfile("e6ai");
    newState.profiles.local = newState.profiles.local || createEmptySiteProfile("local");
    newState.profiles.tailspace = newState.profiles.tailspace || createEmptySiteProfile("tailspace");
    newState.profiles.furbooru = newState.profiles.furbooru || createEmptySiteProfile("furbooru");
    newState.profiles.inkbunny = newState.profiles.inkbunny || createEmptySiteProfile("inkbunny");
    newState.profiles.furaffinity = newState.profiles.furaffinity || createEmptySiteProfile("furaffinity");
    newState.profiles.weasyl = newState.profiles.weasyl || createEmptySiteProfile("weasyl");
    newState.profiles.itaku = newState.profiles.itaku || createEmptySiteProfile("itaku");
    newState.profiles.sofurry = newState.profiles.sofurry || createEmptySiteProfile("sofurry");
    newState.profiles.unified = newState.profiles.unified || createEmptySiteProfile("unified");
    if (!newState.profiles.unified.unifiedSites) {
      newState.profiles.unified.unifiedSites = {
        e621: true,
        e6ai: true,
        furbooru: true,
        inkbunny: true,
        furaffinity: true,
        weasyl: true,
        itaku: true,
        sofurry: true,
      };
    } else if (newState.profiles.unified.unifiedSites.furaffinity === undefined) {
      newState.profiles.unified.unifiedSites.furaffinity = true;
    }
    if (newState.profiles.unified.unifiedSites.weasyl === undefined) {
      newState.profiles.unified.unifiedSites.weasyl = true;
    }
    if (newState.profiles.unified.unifiedSites.itaku === undefined) {
      newState.profiles.unified.unifiedSites.itaku = true;
    }
    if (newState.profiles.unified.unifiedSites.sofurry === undefined) {
      newState.profiles.unified.unifiedSites.sofurry = true;
    }
    if (
      newState.profiles.unified.unifiedFeedSource !== "search" &&
      newState.profiles.unified.unifiedFeedSource !== "following"
    ) {
      newState.profiles.unified.unifiedFeedSource = "search";
    }
    if (!newState.profiles.e621.account) {
      // Do NOT copy active-mode mirrors here: account/blacklist/etc. may
      // reflect a different site (e.g. e6ai at export time).  Merge any
      // partial e621 profile over a clean default instead.
      newState.profiles.e621 = {
        ...createEmptySiteProfile("e621"),
        ...newState.profiles.e621,
      };
    }
    if (
      newState.activeMode !== "e621" &&
      newState.activeMode !== "e6ai" &&
      newState.activeMode !== "local" &&
      newState.activeMode !== "tailspace" &&
      newState.activeMode !== "furbooru" &&
      newState.activeMode !== "inkbunny" &&
      newState.activeMode !== "furaffinity" &&
      newState.activeMode !== "weasyl" &&
      newState.activeMode !== "itaku" &&
      newState.activeMode !== "sofurry" &&
      newState.activeMode !== "unified"
    ) {
      newState.activeMode = "e621";
    }
    // Local mode needs FSA (Chromium) or Tauri. Fall back quietly otherwise.
    if (newState.activeMode === "local" && !supportsLocalBrowse()) {
      newState.activeMode = "e621";
    }
    // Normalize base URLs
    newState.profiles.e621.baseUrl = newState.profiles.e621.baseUrl || SITE_MODE_URLS.e621;
    newState.profiles.e6ai.baseUrl = newState.profiles.e6ai.baseUrl || SITE_MODE_URLS.e6ai;
    newState.profiles.furbooru.baseUrl = newState.profiles.furbooru.baseUrl || SITE_MODE_URLS.furbooru;
    newState.profiles.inkbunny.baseUrl = newState.profiles.inkbunny.baseUrl || SITE_MODE_URLS.inkbunny;
    newState.profiles.furaffinity.baseUrl = newState.profiles.furaffinity.baseUrl || SITE_MODE_URLS.furaffinity;
    if (!newState.profiles.weasyl) {
      newState.profiles.weasyl = createEmptySiteProfile("weasyl");
    }
    newState.profiles.weasyl.baseUrl = newState.profiles.weasyl.baseUrl || SITE_MODE_URLS.weasyl;
    if (!newState.profiles.itaku) {
      newState.profiles.itaku = createEmptySiteProfile("itaku");
    }
    newState.profiles.itaku.baseUrl = newState.profiles.itaku.baseUrl || SITE_MODE_URLS.itaku;
    if (!newState.profiles.sofurry) {
      newState.profiles.sofurry = createEmptySiteProfile("sofurry");
    }
    newState.profiles.sofurry.baseUrl = newState.profiles.sofurry.baseUrl || SITE_MODE_URLS.sofurry;
    if (!newState.profiles.tailspace) {
      newState.profiles.tailspace = createEmptySiteProfile("tailspace");
    }
    newState.profiles.tailspace.baseUrl = newState.profiles.tailspace.baseUrl || SITE_MODE_URLS.tailspace;

    if (newState.posts.localDirectoryName === undefined) {
      newState.posts.localDirectoryName = null;
    }
    if (newState.posts.cardAutoNext === undefined) {
      newState.posts.cardAutoNext = false;
    }
    if (newState.posts.cardAutoNextIntervalMs == null) {
      newState.posts.cardAutoNextIntervalMs = newState.posts.slideshowIntervalMs || 15000;
    }
    if (newState.posts.compactCards === undefined) {
      newState.posts.compactCards = false;
    }
    if (newState.posts.alwaysCollapseToolbar === undefined) {
      newState.posts.alwaysCollapseToolbar = false;
    }
    if (newState.posts.feedLayout !== "list" && newState.posts.feedLayout !== "grid") {
      newState.posts.feedLayout = "list";
    }
    if (newState.posts.videoVolume === undefined) {
      newState.posts.videoVolume = 1;
    }
    if (newState.posts.videoMuted === undefined) {
      newState.posts.videoMuted = true;
    }
    if (newState.posts.videoPlaybackRate == null) {
      newState.posts.videoPlaybackRate = 1;
    }
    if (!newState.posts.playbackPrefs) {
      newState.posts.playbackPrefs = {};
    }
    if (newState.posts.animateFeedGifs === undefined) {
      newState.posts.animateFeedGifs = true;
    }
    if (newState.posts.autoplayFeedVideo === undefined) {
      newState.posts.autoplayFeedVideo = true;
    }
    if (newState.posts.autoplayFeedVideoSilent === undefined) {
      newState.posts.autoplayFeedVideoSilent = true;
    }
    if (newState.posts.saveLocal && newState.posts.saveLocal.openInLocalAfterSave === undefined) {
      newState.posts.saveLocal.openInLocalAfterSave = false;
    }
    applyActiveProfileToMirrors(newState);
    // Official Vercel proxy only allows avoonix origins; use same-origin /api/.
    if (!newState.misc?.urls?.proxy || newState.misc.urls.proxy.includes("material-e621-proxy.vercel.app")) {
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
  if (!persistanceService) persistanceService = new PersistanceService(useMainStore());
  return persistanceService;
};
