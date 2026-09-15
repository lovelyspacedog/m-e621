import type { ISettingsServiceState, SiteMode, UnifiedChildMode } from "@/services/types";
import {
  SITE_MODE_URLS,
  UNIFIED_CHILD_MODES,
  defaultUnifiedSites,
} from "@/services/types";
import { createEmptySiteProfile } from "@/services/siteProfiles";
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
    case "unified":
      return "Unified";
    case "local":
      return "Local";
    case "tailspace":
      return "Tailspace";
    default:
      return mode;
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
  if (mode === "furbooru") {
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
    __meta?: { originMode?: UnifiedChildMode; originBaseUrl?: string; furaffinity?: { kind?: string } };
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
  return `${base}posts/${post.id}`;
};

export const buildUnifiedFetchArgs = (
  state: ISettingsServiceState,
  options?: { includeDisabled?: boolean },
): UnifiedFetchArgs => {
  const sites = {
    ...defaultUnifiedSites(),
    ...(toRaw(state.profiles.unified?.unifiedSites) || {}),
  };
  const children: UnifiedChildFetchArgs[] = [];
  for (const mode of UNIFIED_CHILD_MODES) {
    if (!options?.includeDisabled && !sites[mode]) continue;
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
  };
};

export const originAuthForPost = (
  post: {
    __meta?: { originMode?: UnifiedChildMode; originBaseUrl?: string };
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
    blacklist: [
      ...(state.blacklist?.tags || []),
      ...(profile.blacklist?.tags || []),
    ],
  };
};
