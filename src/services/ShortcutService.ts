import mitt from "mitt";
// TODO: implement basic event emitter ourselves
import Mousetrap from "mousetrap";
import { useShortcutStore } from "./ShortcutStore";
import { useUiStore } from "./UiStore";
import { useSiteModeStore } from "./SiteModeStore";
import { useRouter } from "vue-router";

export type Events = {
  focusSearch: void;
  fullscreenNext: void;
  fullscreenPrevious: void;
  fullscreenExit: void;
  fullscreenAddFavorite: void;
  fullscreenRemoveFavorite: void;
  fullscreenToggleFavorite: void;
  fullscreenSlideshowToggle: void;
  fullscreenSlideshowStop: void;
  openPostSource: void;
};

class ShortcutService {
  constructor(private router: ReturnType<typeof useRouter>, private shortcutStore: ReturnType<typeof useShortcutStore>) { }

  public emitter = mitt<Events>();

  public setUpShortcuts() {
    Mousetrap.reset();
    for (const { action, sequence } of this.shortcutStore.shortcuts) {
      Mousetrap.bind(sequence, (e) => {
        switch (action) {
          case "go_to_settings":
            this.router.push({ name: "Settings" });
            break;
          case "go_to_posts": {
            const siteMode = useSiteModeStore();
            this.router.push({
              name: siteMode.isTailspace
                ? "TailspacePosts"
                : siteMode.isFlayrah
                  ? "FlayrahFeed"
                  : "Posts",
            });
            break;
          }
          case "navigate_back": {
            const state = window.history.state as { back?: unknown | null } | null;
            if (state?.back == null) return true;
            this.router.back();
            break;
          }
          case "navigate_forward": {
            const state = window.history.state as { forward?: unknown | null } | null;
            if (state?.forward == null) return true;
            this.router.forward();
            break;
          }
          case "focus_search":
            this.emitter.emit("fullscreenExit"); // search can't be focused otherwise
            this.emitter.emit("focusSearch");
            break;
          case "fullscreen_exit": {
            const ui = useUiStore();
            // Let page handlers (Flayrah `s` save, etc.) run when not fullscreen.
            if (!ui.fullscreenOpen) return true;
            this.emitter.emit("fullscreenExit");
            break;
          }
          case "fullscreen_next_post": {
            const ui = useUiStore();
            if (!ui.fullscreenOpen) return true;
            this.emitter.emit("fullscreenNext");
            break;
          }
          case "fullscreen_previous_post": {
            const ui = useUiStore();
            if (!ui.fullscreenOpen) return true;
            this.emitter.emit("fullscreenPrevious");
            break;
          }
          case "fullscreen_add_favorite": {
            const ui = useUiStore();
            if (!ui.fullscreenOpen) return true;
            this.emitter.emit("fullscreenAddFavorite");
            break;
          }
          case "fullscreen_remove_favorite": {
            const ui = useUiStore();
            if (!ui.fullscreenOpen) return true;
            this.emitter.emit("fullscreenRemoveFavorite");
            break;
          }
          case "fullscreen_toggle_favorite": {
            const ui = useUiStore();
            if (!ui.fullscreenOpen) return true;
            this.emitter.emit("fullscreenToggleFavorite");
            break;
          }
          case "fullscreen_slideshow_toggle": {
            const ui = useUiStore();
            if (!ui.fullscreenOpen) {
              return true; // let feed Space handler run
            }
            this.emitter.emit("fullscreenSlideshowToggle");
            break;
          }
          case "fullscreen_open_source": {
            const ui = useUiStore();
            if (!ui.fullscreenOpen) {
              return true;
            }
            this.emitter.emit("openPostSource");
            break;
          }
          default:
            expectNever(action);
            return true;
        }
        return false; // abort handling
      });
    }
  }
}

const expectNever = (arg: never) => console.log("unexpected", arg);

let shortcutService: ShortcutService | null = null;

export const useShortcutService = () => {
  const shortcutStore = useShortcutStore();
  const router = useRouter();
  if (shortcutService === null) {
    shortcutService = new ShortcutService(router, shortcutStore);
  }
  return shortcutService;
}
