import { feedSeenCursorIsStale, feedSeenKeysForMode } from "@/misc/util/feedSeen";
import { buildUnifiedFetchArgs, buildVideoFetchArgs } from "@/misc/util/postOrigin";
import { modeSupportsFollowing } from "@/misc/util/siteCapabilities";
import {
  useAccountStore,
  useDiscoveryStore,
  useMainStore,
  usePostsStore,
  useUrlStore,
} from "@/services";
import { useSiteModeStore } from "@/services/SiteModeStore";
import { BlacklistMode, type SiteMode } from "@/services/types";
import { getApiService } from "@/worker/services";
import { toRaw } from "vue";

let inflight: Promise<void> | null = null;

/**
 * Page-1 check for the current mode's Posts and Following watermarks.
 * Blur blacklist so the count is not hidden by hide-mode. At most those two feeds.
 */
export const refreshFeedSeenBadges = (): Promise<void> => {
  if (inflight) return inflight;
  inflight = run().finally(() => {
    inflight = null;
  });
  return inflight;
};

const run = async () => {
  const siteMode = useSiteModeStore();
  const discovery = useDiscoveryStore();
  const mode = siteMode.activeMode;
  const keys = feedSeenKeysForMode(mode);
  if (!keys.length) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const account = useAccountStore();
  const urlStore = useUrlStore();
  const postsStore = usePostsStore();
  const main = useMainStore();

  for (const key of keys) {
    const cursor = discovery.getFeedSeen(key);
    if (!feedSeenCursorIsStale(cursor)) continue;
    const kind = key.endsWith(":following") ? "following" : "posts";
    try {
      const api = await getApiService();
      const result = await api.getPosts({
        blacklistMode: BlacklistMode.blur,
        blacklist: [],
        limit: 24,
        tags: tagsFor(mode, kind),
        baseUrl: urlStore.e621Url,
        mode,
        page: 1,
        auth: toRaw(account.auth),
        userId: account.userId,
        sfwOnly: postsStore.sfwOnly,
        ...(mode === "unified"
          ? { unified: unifiedArgs(kind) }
          : {}),
        ...(mode === "video"
          ? { video: toRaw(buildVideoFetchArgs(main.$state)) }
          : {}),
      });
      discovery.recordFeedSeenCheck(key, result.posts);
    } catch {
      // Sidebar badges retry on the next stale window.
    }
  }
};

const tagsFor = (mode: SiteMode, kind: "posts" | "following"): string[] => {
  if (kind === "following" && mode !== "unified") return ["following:me"];
  return [];
};

const unifiedArgs = (kind: "posts" | "following") => {
  const main = useMainStore();
  const args = buildUnifiedFetchArgs(main.$state, {
    forceAllEnabledChildren: kind === "posts",
  });
  args.feedSource = kind === "following" ? "following" : "search";
  if (kind === "following") {
    args.children = args.children.filter((child) =>
      modeSupportsFollowing(child.mode),
    );
  }
  return toRaw(args);
};
