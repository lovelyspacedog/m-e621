import type {
  ISettingsServiceState,
  PoolOriginMode,
  SiteMode,
} from "@/services/types";
import { SITE_MODE_URLS, defaultUnifiedSites } from "@/services/types";
import { createEmptySiteProfile } from "@/services/siteProfiles";
import { authFromAccount } from "@/misc/util/postOrigin";
import { toRaw } from "vue";

export const POOL_ORIGIN_MODES: PoolOriginMode[] = ["e621", "e6ai"];

export const isPoolOriginMode = (value: unknown): value is PoolOriginMode =>
  value === "e621" || value === "e6ai";

/** Parse `?origin=` (or array query). */
export const parsePoolOriginQuery = (raw: unknown): PoolOriginMode | null => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isPoolOriginMode(value) ? value : null;
};

/**
 * Resolve pool origin for API/watch/resume.
 * Federated requires an explicit `?origin=`; single-site modes fall back to activeMode.
 */
export const resolvePoolOrigin = (
  queryOrigin: unknown,
  activeMode: SiteMode,
): PoolOriginMode | null => {
  const fromQuery = parsePoolOriginQuery(queryOrigin);
  if (fromQuery) return fromQuery;
  if (isPoolOriginMode(activeMode)) return activeMode;
  return null;
};

export const poolKey = (originMode: PoolOriginMode | "tailspace", id: number) =>
  `${originMode}:${id}`;

export type PoolChildFetchArgs = {
  mode: PoolOriginMode;
  baseUrl: string;
  auth?: { login: string; api_key: string };
  userId?: number | null;
  blacklist: string[][];
};

const childArgsFor = (
  state: ISettingsServiceState,
  mode: PoolOriginMode,
  opts: { includeSharedBlacklist: boolean; useLiveBlacklist: boolean },
): PoolChildFetchArgs => {
  const profile = toRaw(state.profiles[mode]) || createEmptySiteProfile(mode);
  const account = toRaw(profile.account) || {
    username: null,
    apiKey: null,
    userId: null,
  };
  const live = toRaw(state.blacklist?.tags) || [];
  const childTags = toRaw(profile.blacklist?.tags) || [];
  let tags: string[][];
  if (opts.useLiveBlacklist) {
    tags = live;
  } else if (opts.includeSharedBlacklist) {
    tags = [...live, ...childTags];
  } else {
    tags = childTags;
  }
  return {
    mode,
    baseUrl: profile.baseUrl || SITE_MODE_URLS[mode],
    auth: authFromAccount(mode, account),
    userId: account.userId ?? null,
    blacklist: tags.map((line) => [...(toRaw(line) || [])]),
  };
};

/** Enabled e621/e6ai Federated children (or the single active e621-family site). */
export const poolFamilyChildren = (
  state: ISettingsServiceState,
): PoolChildFetchArgs[] => {
  const active = state.activeMode;
  if (isPoolOriginMode(active)) {
    return [childArgsFor(state, active, {
      includeSharedBlacklist: false,
      useLiveBlacklist: true,
    })];
  }
  if (active !== "unified") return [];

  const sites = {
    ...defaultUnifiedSites(),
    ...(toRaw(state.profiles.unified?.unifiedSites) || {}),
  };
  const out: PoolChildFetchArgs[] = [];
  for (const mode of POOL_ORIGIN_MODES) {
    if (!sites[mode]) continue;
    out.push(
      childArgsFor(state, mode, {
        includeSharedBlacklist: true,
        useLiveBlacklist: false,
      }),
    );
  }
  return out;
};

export const poolChildForOrigin = (
  state: ISettingsServiceState,
  origin: PoolOriginMode,
): PoolChildFetchArgs => {
  const fromFamily = poolFamilyChildren(state).find((c) => c.mode === origin);
  if (fromFamily) return fromFamily;
  return childArgsFor(state, origin, {
    includeSharedBlacklist: state.activeMode === "unified",
    useLiveBlacklist: state.activeMode === origin,
  });
};

/** Router link query fragment for a pool reader URL. */
export const poolRouteQuery = (
  origin: PoolOriginMode | null | undefined,
  extra?: Record<string, string | undefined>,
): Record<string, string> => {
  const query: Record<string, string> = {};
  if (origin) query.origin = origin;
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value != null && value !== "") query[key] = value;
    }
  }
  return query;
};

export type PoolBrowseOrder =
  | "post_count"
  | "updated_at"
  | "created_at"
  | "name";

export const poolTimestampMs = (
  value: Date | string | null | undefined,
): number => {
  if (value == null) return 0;
  const t = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(t) ? t : 0;
};

/** Cross-origin merge sort so e621/e6ai results interleave by the browse order. */
export const comparePoolsByOrder = (
  a: { name?: string; post_count?: number; created_at?: Date | string; updated_at?: Date | string },
  b: { name?: string; post_count?: number; created_at?: Date | string; updated_at?: Date | string },
  order: PoolBrowseOrder,
): number => {
  switch (order) {
    case "updated_at":
      return poolTimestampMs(b.updated_at) - poolTimestampMs(a.updated_at);
    case "created_at":
      return poolTimestampMs(b.created_at) - poolTimestampMs(a.created_at);
    case "name":
      return (a.name || "").localeCompare(b.name || "", undefined, {
        sensitivity: "base",
      });
    case "post_count":
    default:
      return (b.post_count || 0) - (a.post_count || 0);
  }
};

export const sortPoolsByOrder = <T extends {
  name?: string;
  post_count?: number;
  created_at?: Date | string;
  updated_at?: Date | string;
}>(
  pools: T[],
  order: PoolBrowseOrder,
): T[] => [...pools].sort((a, b) => comparePoolsByOrder(a, b, order));
