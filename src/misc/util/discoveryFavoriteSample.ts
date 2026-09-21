/**
 * Shared helpers for discovery tools that sample favorites the same way as
 * Favorite Analyzer (Local on main thread; remote via AnalyzeService).
 */
import * as Comlink from "comlink";
import { toRaw } from "vue";
import type { SiteMode, ISettingsServiceState } from "@/services/types";
import { BlacklistMode } from "@/services/types";
import type { EnhancedPost } from "@/worker/ApiService";
import type { FavoriteTagsResult } from "@/misc/util/suggestionScoring";
import { buildFavoriteTagsResult } from "@/misc/util/suggestionScoring";
import { canLoadOwnFavorites } from "@/misc/util/favoriteAuthGate";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";
import { buildUnifiedFetchArgs } from "@/misc/util/postOrigin";
import { publishPartialChildWarnings } from "@/misc/util/favoriteChildWarnings";
import { getLocalPostsPage } from "@/misc/util/localMedia";
import { isPostBlacklisted } from "@/worker/blacklist";
import { getAnalyzeService, getApiService } from "@/worker/services";
import type { IProgressEvent } from "@/worker/AnalyzeService";

type SuggestAuth =
  | {
      login: string;
      api_key: string;
    }
  | undefined;

const asSuggestAuth = (
  auth: { login?: string; api_key?: string } | undefined,
): SuggestAuth => {
  if (!auth) return undefined;
  return {
    login: auth.login || "",
    api_key: auth.api_key || "",
  };
};

export const DISCOVERY_SAMPLE_LIMITS = [320, 960, 1920] as const;

export type SampleFavoritesArgs = {
  mode: SiteMode;
  username: string;
  auth: { login?: string; api_key?: string } | undefined;
  apiKey: string | null | undefined;
  userId: number | null | undefined;
  hostFaCookiesAvailable: boolean;
  baseUrl: string;
  settings: ISettingsServiceState;
  postListFetchLimit: number;
  sfwOnly: boolean;
  limit: number;
  blacklist?: string[][];
  /** When true, return posts for Blacklist Coach (extra fetch on remote). */
  includePosts?: boolean;
  onProgress?: (event: IProgressEvent) => void;
  onWarning?: (msg: string) => void;
};

export type SampleFavoritesResult = {
  profile: FavoriteTagsResult;
  sampleSize: number;
  posts?: EnhancedPost[];
};

const fetchLocalPages = async (
  tags: string[],
  postLimit: number,
  pageLimit: number,
  onProgress?: (got: number) => void,
) => {
  const posts: EnhancedPost[] = [];
  let page = 1;
  while (posts.length < postLimit) {
    const { posts: batch, status } = await getLocalPostsPage(
      page,
      pageLimit,
      tags,
    );
    if (status !== "ok" && status !== "empty") break;
    posts.push(...batch);
    onProgress?.(posts.length);
    page += 1;
    if (batch.length < pageLimit) break;
  }
  return posts.slice(0, postLimit);
};

export const assertFavoriteSampleAuth = (args: {
  mode: SiteMode;
  username: string;
  apiKey: string | null | undefined;
  hostFaCookiesAvailable: boolean;
}): string | null => {
  const needsUsername = modeSupportsOtherUserFavorites(args.mode);
  const ownOk = canLoadOwnFavorites({
    mode: args.mode,
    apiKey: args.apiKey,
    hostFaCookiesAvailable: args.hostFaCookiesAvailable,
  });
  if (needsUsername && !args.username.trim() && !ownOk) {
    return "Enter a username, or sign in to load your favorites.";
  }
  if (
    !needsUsername &&
    args.mode !== "local" &&
    args.mode !== "unified" &&
    !ownOk
  ) {
    return "Sign in for this site to load favorites.";
  }
  return null;
};

export async function sampleFavoriteProfile(
  args: SampleFavoritesArgs,
): Promise<SampleFavoritesResult> {
  const authError = assertFavoriteSampleAuth(args);
  if (authError) throw new Error(authError);

  const limit = (DISCOVERY_SAMPLE_LIMITS as readonly number[]).includes(
    args.limit,
  )
    ? args.limit
    : 1920;
  const bl = args.blacklist?.length ? args.blacklist : undefined;
  const onProgress =
    args.onProgress ||
    ((_e: IProgressEvent) => {
      /* noop */
    });

  if (args.mode === "local") {
    onProgress({ message: "loading local favorites", progress: 0 });
    let favPosts = await fetchLocalPages(
      ["type:favorited"],
      limit,
      args.postListFetchLimit || 30,
      (n) =>
        onProgress({
          message: `local favorites ${n}`,
          progress: Math.min(1, n / limit),
        }),
    );
    if (bl?.length) {
      favPosts = favPosts.filter((p) => !isPostBlacklisted(p, bl));
    }
    const profile = buildFavoriteTagsResult(favPosts);
    onProgress({ message: "done", progress: 1 });
    return {
      profile,
      sampleSize: favPosts.length,
      ...(args.includePosts ? { posts: favPosts } : {}),
    };
  }

  const service = await getAnalyzeService();
  const unified =
    args.mode === "unified"
      ? buildUnifiedFetchArgs(args.settings, {
          forceAllEnabledChildren: true,
        })
      : undefined;

  // Remote path: getFavoriteTags does not return posts. When includePosts is
  // needed, fetch the first page(s) via ApiService with the same fav query.
  const r = await service.getFavoriteTags(
    args.username,
    args.baseUrl,
    Comlink.proxy(onProgress),
    args.mode,
    args.auth ? asSuggestAuth(toRaw(args.auth)) : undefined,
    args.userId ?? null,
    unified ? toRaw(unified) : undefined,
    limit,
    bl ? toRaw(bl) : undefined,
    args.sfwOnly,
  );

  publishPartialChildWarnings(r.warnings, (msg) => args.onWarning?.(msg));

  let posts: EnhancedPost[] | undefined;
  if (args.includePosts) {
    // Approximate sample for coach: page favorites again (cached in worker when
    // same args). Keep a modest cap so the coach stays responsive.
    const api = await getApiService();
    const { resolveFavoriteTagsQuery } = await import(
      "@/misc/util/favoriteQuery"
    );
    if (args.mode === "unified" && unified) {
      posts = [];
      for (const child of unified.children) {
        const resolved = resolveFavoriteTagsQuery({
          mode: child.mode,
          username: child.auth?.login || args.username,
        });
        if (resolved.requiresAuth && !child.auth?.api_key) continue;
        const { posts: batch } = await api.getPosts({
          blacklistMode: BlacklistMode.blur,
          blacklist: bl || [],
          limit: Math.min(320, limit),
          tags: resolved.tags,
          baseUrl: args.baseUrl,
          mode: child.mode,
          page: 1,
          auth: child.auth,
          userId: child.userId ?? null,
          sfwOnly: args.sfwOnly,
        });
        posts.push(...batch);
        if (posts.length >= Math.min(limit, 960)) break;
      }
    } else {
      const resolved = resolveFavoriteTagsQuery({
        mode: args.mode,
        username: args.username,
      });
      const { posts: batch } = await api.getPosts({
        blacklistMode: BlacklistMode.blur,
        blacklist: bl || [],
        limit: Math.min(320, limit),
        tags: resolved.tags,
        baseUrl: args.baseUrl,
        mode: args.mode,
        page: 1,
        auth: asSuggestAuth(args.auth ? toRaw(args.auth) : undefined),
        userId: args.userId ?? null,
        sfwOnly: args.sfwOnly,
      });
      posts = batch;
    }
  }

  onProgress({ message: "done", progress: 1 });
  return {
    profile: r,
    sampleSize: r.favoriteKeys?.length || 0,
    ...(posts ? { posts } : {}),
  };
}
