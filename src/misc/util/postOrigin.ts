import type { ISettingsServiceState, SiteMode, UnifiedChildMode, UnifiedFeedSource } from "@/services/types";
import {
  SITE_MODE_URLS,
  UNIFIED_CHILD_MODES,
  defaultUnifiedSites,
} from "@/services/types";
import { createEmptySiteProfile } from "@/services/siteProfiles";
import { modeSupportsFollowing } from "@/misc/util/siteCapabilities";
import { toRaw } from "vue";

export type UnifiedChildFetchArgs = {
  mode: UnifiedChildMode;
  baseUrl: string;
  auth?: { login: string; api_key: string };
  userId?: number | null;
  blacklist: string[][];
};

export type UnifiedFetchArgs = {
  children: UnifiedChildFetchArgs[];
  sharedBlacklist: string[][];
  feedSource: UnifiedFeedSource;
};

/** Unified itself or any federated child backend (not Local / Tailspace). */
export const modeSupportsSavedPosts = (mode: SiteMode): boolean =>
  mode === "unified" || (UNIFIED_CHILD_MODES as readonly string[]).includes(mode);

export const unifiedChildLabel = (mode: SiteMode | UnifiedChildMode): string => {
  switch (mode) {
    case "furbooru":
      return "Furbooru";
    case "inkbunny":
      return "Inkbunny";
    case "furaffinity":
      return "FurAffinity";
    case "weasyl":
      return "Weasyl";
    case "itaku":
      return "Itaku";
    case "sofurry":
      return "SoFurry";
    case "unified":
      return "Federated";
    case "local":
      return "Local";
    case "tailspace":
      return "Tailspace";
    case "news":
      return "News";
    default:
      return mode;
  }
};

export const unifiedChildIcon = (mode: SiteMode | UnifiedChildMode): string => {
  switch (mode) {
    case "e6ai":
      return "$tanukiAi";
    case "furbooru":
      return "mdi-dog";
    case "inkbunny":
      return "mdi-rabbit";
    case "furaffinity":
      return "$fox";
    case "weasyl":
      return "$weasyl";
    case "itaku":
      return "$itaku";
    case "sofurry":
      return "$sofurry";
    case "unified":
      return "mdi-earth";
    case "local":
      return "mdi-harddisk";
    case "tailspace":
      return "mdi-rocket-launch";
    case "news":
      return "mdi-newspaper";
    default:
      return "mdi-paw";
  }
};

export const postFeedKey = (post: {
  id: number;
  __meta?: { originMode?: string };
}) => `${post.__meta?.originMode || ""}:${post.id}`;

export const findPostIndex = (
  posts: Array<{ id: number; __meta?: { originMode?: string } }>,
  target: { id?: number; postId?: number; originMode?: string } | number,
) => {
  if (typeof target === "number") {
    return posts.findIndex((p) => p.id === target);
  }
  const id = target.id ?? target.postId;
  if (id == null) return -1;
  if (target.originMode) {
    const idx = posts.findIndex(
      (p) => p.id === id && p.__meta?.originMode === target.originMode,
    );
    if (idx >= 0) return idx;
    // Origin was supplied but unmatched — do not guess by numeric id alone.
    return -1;
  }
  return posts.findIndex((p) => p.id === id);
};

export const authFromAccount = (
  mode: SiteMode,
  account: {
    username: string | null;
    apiKey: string | null;
    userId?: number | null;
  },
): { login: string; api_key: string } | undefined => {
  if (mode === "furaffinity") {
    return { login: account.username || "", api_key: account.apiKey || "" };
  }
  if (!account.apiKey) return undefined;
  if (mode === "furbooru" || mode === "weasyl" || mode === "itaku" || mode === "sofurry") {
    // Furbooru / Weasyl / Itaku / SoFurry use API key/token/cookies; username optional metadata
    return { login: account.username || "", api_key: account.apiKey };
  }
  if (!account.username) return undefined;
  return { login: account.username, api_key: account.apiKey };
};

export const originModeOf = (
  post:
    | { __meta?: { originMode?: string } }
    | null
    | undefined,
  fallback: SiteMode,
): SiteMode => (post?.__meta?.originMode as SiteMode | undefined) || fallback;

export const postPageUrl = (
  post: {
    id: number;
    file?: { md5?: string };
    __meta?: {
      originMode?: UnifiedChildMode | "local";
      originBaseUrl?: string;
      furaffinity?: { kind?: string };
      sofurry?: { id?: string };
    };
  },
  fallbackMode: SiteMode,
  fallbackBaseUrl: string,
) => {
  const mode = post.__meta?.originMode || fallbackMode;
  const raw =
    post.__meta?.originBaseUrl ||
    fallbackBaseUrl ||
    SITE_MODE_URLS[mode] ||
    "";
  const base = raw.endsWith("/") ? raw : `${raw}/`;
  if (mode === "furbooru") return `${base}images/${post.id}`;
  if (mode === "inkbunny") return `${base}s/${post.id}`;
  if (mode === "furaffinity") {
    if (post.__meta?.furaffinity?.kind === "journal") return `${base}journal/${post.id}`;
    return `${base}view/${post.id}`;
  }
  if (mode === "weasyl") return `${base}submission/${post.id}`;
  if (mode === "itaku") return `${base}images/${post.id}`;
  if (mode === "sofurry") {
    const softId = post.__meta?.sofurry?.id || post.file?.md5;
    if (softId && /[A-Za-z]/.test(softId)) return `${base}s/${softId}`;
    return `${base}s/${post.id}`;
  }
  return `${base}posts/${post.id}`;
};

export const buildUnifiedFetchArgs = (
  state: ISettingsServiceState,
  options?: {
    includeDisabled?: boolean;
    /**
     * Post Suggester / Favorite Analyzer: include every enabled Federated
     * child even when the Posts feed is on Following (which otherwise drops
     * e621 / e6ai / Furbooru / Weasyl). Posts merge must not set this.
     */
    forceAllEnabledChildren?: boolean;
  },
): UnifiedFetchArgs => {
  const sites = {
    ...defaultUnifiedSites(),
    ...toRaw(state.profiles.unified?.unifiedSites),
  };
  const feedSource: UnifiedFeedSource =
    state.profiles.unified?.unifiedFeedSource === "following"
      ? "following"
      : "search";
  const children: UnifiedChildFetchArgs[] = [];
  for (const mode of UNIFIED_CHILD_MODES) {
    if (!options?.includeDisabled && !sites[mode]) continue;
    // Following source only queries capable children; bookmark fetches use
    // includeDisabled; Suggester/Analyzer use forceAllEnabledChildren.
    if (
      feedSource === "following" &&
      !options?.forceAllEnabledChildren &&
      !options?.includeDisabled &&
      !modeSupportsFollowing(mode)
    ) {
      continue;
    }
    const profile = toRaw(state.profiles[mode]) || createEmptySiteProfile(mode);
    const account = toRaw(profile.account) || {
      username: null,
      apiKey: null,
      userId: null,
    };
    const tags = toRaw(profile.blacklist?.tags) || [];
    children.push({
      mode,
      baseUrl: profile.baseUrl || SITE_MODE_URLS[mode],
      auth: authFromAccount(mode, account),
      userId: account.userId ?? null,
      // Nested Pinia arrays stay Proxies unless deep-copied for Comlink (postMessage).
      blacklist: tags.map((line) => [...(toRaw(line) || [])]),
    });
  }
  const shared = toRaw(state.blacklist?.tags) || [];
  return {
    children,
    sharedBlacklist: shared.map((line) => [...(toRaw(line) || [])]),
    feedSource,
  };
};

export const originAuthForPost = (
  post: {
    __meta?: { originMode?: UnifiedChildMode | "local"; originBaseUrl?: string };
  },
  state: ISettingsServiceState,
  fallbackMode: SiteMode,
) => {
  const mode = originModeOf(post, fallbackMode);
  const profile = state.profiles[mode] || createEmptySiteProfile(mode);
  return {
    mode,
    baseUrl:
      post.__meta?.originBaseUrl ||
      profile.baseUrl ||
      SITE_MODE_URLS[mode],
    auth: authFromAccount(mode, profile.account),
    userId: profile.account.userId ?? null,
    // When this origin is the active mode, live mirrors are authoritative
    // (profile copy may lag until save sync). Otherwise use the origin profile,
    // and for Federated also fold in the live shared blacklist.
    blacklist:
      state.activeMode === mode
        ? [...(state.blacklist?.tags || [])]
        : [
            ...(state.activeMode === "unified"
              ? state.blacklist?.tags || []
              : []),
            ...(profile.blacklist?.tags || []),
          ],
  };
};
