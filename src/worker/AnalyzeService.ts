import { expose } from "comlink";
import type { Post } from "./api";
import type { EnhancedPost } from "./ApiService";
import { ApiService } from "./ApiService";
import {
  BlacklistMode,
  SITE_MODE_URLS,
  type SiteMode,
  type UnifiedChildMode,
} from "@/services/types";
import type { UnifiedFetchArgs } from "@/misc/util/postOrigin";
import { debug } from "@/misc/util/debug";
import {
  pickSeedTags,
  resolveFavoriteTagsQuery,
  type SuggesterWeights,
} from "@/misc/util/favoriteQuery";
import {
  buildFavoriteTagsResult,
  getCounts,
  rankSuggestionPool,
  sliceScoredPool,
  type FavoriteTagsResult,
  type ScoredPost,
} from "@/misc/util/suggestionScoring";

const log = debug("app:AnalyzeService");

export type { ScoredPost, FavoriteTagsResult };

type CountCategory =
  | "artist"
  | "character"
  | "copyright"
  | "general"
  | "invalid"
  | "lore"
  | "meta"
  | "species";

export type Counts = {
  [K in CountCategory]: {
    [idx: string]: number;
  };
};

export interface IAnalyzeTagsArgs {
  tags: string[];
  postLimit: number;
  baseUrl: string;
  mode?: SiteMode;
  auth?: { login: string; api_key: string };
  userId?: number | null;
  sfwOnly?: boolean;
}

export interface IAnalyzeTagsResult {
  wordPositions: {
    category: string;
    result: { text: string; size: number }[];
  }[];
}

export interface IProgressEvent {
  message: string;
  /**
   * 0-1
   */
  progress: number;
  indeterminate?: boolean;
}

const FAV_POST_LIMIT = 320 * 6;
const RECENT_PAGES = 4;
const SEED_TAG_LIMIT = 15;
const PAGE_SIZE = 320;

type SuggestAuth =
  | {
      login: string;
      api_key: string;
    }
  | undefined;

export class AnalyzeService {
  async getTagOccurrences(posts: Post[]) {
    log("called getTagOccurrences");
    const tags = posts.map((p) => p.tags);
    const counts: Counts = {
      artist: {},
      character: {},
      copyright: {},
      general: {},
      invalid: {},
      lore: {},
      meta: {},
      species: {},
    };
    for (const c of Object.keys(counts) as CountCategory[]) {
      for (const tag of tags) {
        const list =
          c === "artist"
            ? tag.artist?.length
              ? tag.artist
              : tag.director || []
            : c === "copyright"
              ? tag.copyright?.length
                ? tag.copyright
                : tag.franchise || []
              : tag[c] || [];
        for (const t of list) {
          counts[c][t] = (counts[c][t] || 0) + 1;
        }
      }
    }

    const list = [];
    for (const [category, v] of Object.entries(counts)) {
      for (const [tag, count] of Object.entries(v)) {
        list.push({
          category,
          name: tag,
          count,
        });
      }
    }
    const sorted = list.sort((a, b) => b.count - a.count);

    log("finished getTagOccurrences");
    return {
      counts,
      sorted,
    };
  }

  cache: { [key: string]: Post[] | undefined } = {};
  scoredPoolCache: { [key: string]: ScoredPost[] | undefined } = {};

  private async fetchPostsCached(
    tags: string[],
    postLimit: number,
    baseUrl: string,
    onProgress: (event: IProgressEvent) => void,
    mode?: SiteMode,
    auth?: SuggestAuth,
    userId?: number | null,
    unified?: UnifiedFetchArgs,
    blacklist?: string[][],
    sfwOnly?: boolean,
  ) {
    const service = new ApiService();
    const posts: Post[] = [];
    let page = 1;
    const key = JSON.stringify({
      tags,
      postLimit,
      baseUrl,
      mode,
      auth: auth?.login || null,
      userId: userId ?? null,
      unifiedChildren: unified?.children?.map((c) => c.mode),
      blacklist: blacklist?.length ? blacklist : null,
      sfwOnly: !!sfwOnly,
    });
    log("start fetch");
    if (key && this.cache[key]) {
      posts.push(...this.cache[key]!);
    } else {
      while (posts.length < postLimit) {
        const { posts: newPosts } = await service.getPosts({
          blacklistMode: BlacklistMode.blur,
          blacklist: blacklist || [],
          limit: PAGE_SIZE,
          tags,
          baseUrl,
          mode,
          page,
          auth,
          userId: userId ?? null,
          unified,
          sfwOnly: !!sfwOnly,
        });
        page += 1;
        let kept = blacklist?.length
          ? newPosts.filter((p) => !(p as EnhancedPost).__meta?.isBlacklisted)
          : newPosts;
        if (sfwOnly) {
          kept = kept.filter((p) => p.rating === "s");
        }
        posts.push(...kept);
        onProgress({
          message: `got ${posts.length} of ${postLimit} posts`,
          progress: Math.min(1, posts.length / postLimit),
        });
        if (newPosts.length < PAGE_SIZE) {
          break;
        }
      }
      this.cache[key] = posts.slice(0, postLimit);
    }
    return posts.slice(0, postLimit);
  }

  async analyzeTags(
    args: IAnalyzeTagsArgs,
    onProgress: (event: IProgressEvent) => void,
  ): Promise<IAnalyzeTagsResult> {
    const posts = await this.fetchPostsCached(
      args.tags,
      args.postLimit,
      args.baseUrl,
      onProgress,
      args.mode,
      args.auth,
      args.userId,
      undefined,
      undefined,
      args.sfwOnly,
    );
    onProgress({
      message: "got posts, sorting tags",
      progress: 0.5,
      indeterminate: true,
    });
    log("got posts");

    const counts = getCounts(posts);

    const result = [];
    for (const [category, obj] of Object.entries(counts)) {
      result.push({
        category,
        result: await createCloud(obj ?? {}),
      });
      log("created a cloud");
    }
    onProgress({ message: "done", progress: 1 });
    return {
      wordPositions: result,
    };
  }

  /** Build a favorite-tag profile from already-fetched posts (Local path). */
  async favoriteTagsFromPosts(posts: Post[]): Promise<FavoriteTagsResult> {
    return buildFavoriteTagsResult(posts);
  }

  async getFavoriteTags(
    username: string,
    baseUrl: string,
    onProgress: (event: IProgressEvent) => void,
    mode?: SiteMode,
    auth?: SuggestAuth,
    userId?: number | null,
    unified?: UnifiedFetchArgs,
    postLimit: number = FAV_POST_LIMIT,
    blacklist?: string[][],
    sfwOnly?: boolean,
  ): Promise<FavoriteTagsResult> {
    if (mode === "local") {
      throw new Error(
        "Local favorites must be loaded on the main thread via getLocalPostsPage",
      );
    }

    if (mode === "unified") {
      return this.getUnifiedFavoriteTags(
        username,
        onProgress,
        unified,
        postLimit,
        sfwOnly,
      );
    }

    const resolved = resolveFavoriteTagsQuery({ mode: mode || "e621", username });
    if (resolved.requiresAuth && !auth?.api_key && mode !== "furaffinity") {
      throw new Error("Sign in to load favorites for this site");
    }

    const posts = await this.fetchPostsCached(
      resolved.tags,
      postLimit,
      baseUrl,
      onProgress,
      mode,
      auth,
      userId,
      undefined,
      blacklist,
      sfwOnly,
    );

    return buildFavoriteTagsResult(posts);
  }

  private async getUnifiedFavoriteTags(
    username: string,
    onProgress: (event: IProgressEvent) => void,
    unified?: UnifiedFetchArgs,
    postLimit: number = FAV_POST_LIMIT,
    sfwOnly?: boolean,
  ): Promise<FavoriteTagsResult> {
    const children = unified?.children || [];
    if (!children.length) {
      throw new Error(
        "No Federated children enabled — turn on at least one site in Account settings",
      );
    }
    const service = new ApiService();
    const allPosts: EnhancedPost[] = [];
    let done = 0;
    for (const child of children) {
      const childUsername =
        modeSupportsOtherUserOnChild(child.mode) && username.trim()
          ? username.trim()
          : child.auth?.login || "";
      const resolved = resolveFavoriteTagsQuery({
        mode: child.mode,
        username: childUsername,
      });
      // e621-family needs an explicit fav:user; skip unconfigured children.
      if (
        (child.mode === "e621" || child.mode === "e6ai") &&
        !childUsername
      ) {
        done += 1;
        onProgress({
          message: `skip ${child.mode} (no login)`,
          progress: done / children.length,
        });
        continue;
      }
      if (resolved.requiresAuth && !child.auth?.api_key && child.mode !== "furaffinity") {
        done += 1;
        onProgress({
          message: `skip ${child.mode} (not signed in)`,
          progress: done / children.length,
        });
        continue;
      }
      try {
        const childPosts: EnhancedPost[] = [];
        let page = 1;
        while (childPosts.length < postLimit) {
          const { posts: batch } = await service.getPosts({
            blacklistMode: BlacklistMode.blur,
            blacklist: [...(unified?.sharedBlacklist || []), ...child.blacklist],
            limit: PAGE_SIZE,
            tags: resolved.tags,
            baseUrl: child.baseUrl || SITE_MODE_URLS[child.mode],
            mode: child.mode,
            page,
            auth: child.auth,
            userId: child.userId ?? null,
            sfwOnly: !!sfwOnly,
          });
          const stamped = batch.map((p) => ({
            ...p,
            __meta: {
              ...p.__meta,
              originMode: child.mode,
              originBaseUrl: child.baseUrl,
            },
          }));
          childPosts.push(
            ...(sfwOnly ? stamped.filter((p) => p.rating === "s") : stamped),
          );
          page += 1;
          if (batch.length < PAGE_SIZE) break;
        }
        allPosts.push(...childPosts.slice(0, postLimit));
      } catch (err) {
        log("unified fav child failed", child.mode, err);
      }
      done += 1;
      onProgress({
        message: `favorites ${child.mode} (${done}/${children.length})`,
        progress: done / children.length,
      });
    }
    if (!allPosts.length) {
      throw new Error(
        "No favorites sampled — sign in to at least one enabled Federated child (or check that favorites exist)",
      );
    }
    return buildFavoriteTagsResult(allPosts);
  }

  async suggestPosts(
    tags: FavoriteTagsResult,
    weights: SuggesterWeights,
    limit: number,
    args: {
      direction: "next" | "previous";
      page: number;
    },
    auth: SuggestAuth,
    baseUrl: string,
    onProgress: (event: IProgressEvent) => void,
    blacklist: string[][],
    blacklistMode: BlacklistMode,
    mode?: SiteMode,
    userId?: number | null,
    unified?: UnifiedFetchArgs,
    /** Pre-fetched candidates (Local). When set, skip remote hybrid fetch. */
    prefetchedCandidates?: EnhancedPost[],
    sfwOnly?: boolean,
  ) {
    const page = Math.max(1, args.page || 1);
    const poolKey = JSON.stringify({
      counts: tags.counts,
      favoriteKeys: tags.favoriteKeys,
      weights,
      baseUrl,
      mode,
      userId: userId ?? null,
      auth: auth?.login || null,
      children: unified?.children?.map((c) => c.mode),
      prefetched: prefetchedCandidates?.length || 0,
      sfwOnly: !!sfwOnly,
    });

    let pool = this.scoredPoolCache[poolKey];
    if (!pool) {
      onProgress({
        progress: 0,
        message: "building suggestion pool",
        indeterminate: true,
      });
      const candidates =
        prefetchedCandidates ||
        (mode === "unified"
          ? await this.fetchUnifiedHybridCandidates(
              tags,
              weights,
              onProgress,
              blacklist,
              blacklistMode,
              unified,
              sfwOnly,
            )
          : await this.fetchHybridCandidates(
              tags,
              weights,
              auth,
              baseUrl,
              onProgress,
              blacklist,
              blacklistMode,
              mode,
              userId,
              sfwOnly,
            ));
      pool = rankSuggestionPool({
        tags,
        weights,
        candidates,
      });
      this.scoredPoolCache[poolKey] = pool;
    }

    onProgress({
      progress: 1,
      message: `ranked ${pool.length} posts`,
    });
    return sliceScoredPool(pool, page, limit);
  }

  private async fetchHybridCandidates(
    tags: FavoriteTagsResult,
    weights: SuggesterWeights,
    auth: SuggestAuth,
    baseUrl: string,
    onProgress: (event: IProgressEvent) => void,
    blacklist: string[][],
    blacklistMode: BlacklistMode,
    mode?: SiteMode,
    userId?: number | null,
    sfwOnly?: boolean,
  ): Promise<EnhancedPost[]> {
    const service = new ApiService();
    const out: EnhancedPost[] = [];
    const seeds = pickSeedTags(tags.counts, weights, SEED_TAG_LIMIT);
    const totalSteps = RECENT_PAGES + seeds.length;
    let step = 0;

    for (let page = 1; page <= RECENT_PAGES; page++) {
      const { posts } = await service.getPosts({
        blacklistMode,
        blacklist,
        limit: PAGE_SIZE,
        tags: [],
        page,
        auth,
        baseUrl,
        mode,
        userId: userId ?? null,
        sfwOnly: !!sfwOnly,
      });
      out.push(...(sfwOnly ? posts.filter((p) => p.rating === "s") : posts));
      step += 1;
      onProgress({
        progress: step / totalSteps,
        message: `recent page ${page}/${RECENT_PAGES}`,
      });
      if (posts.length < PAGE_SIZE) break;
    }

    for (const seed of seeds) {
      const { posts } = await service.getPosts({
        blacklistMode,
        blacklist,
        limit: PAGE_SIZE,
        tags: [seed.tag],
        page: 1,
        auth,
        baseUrl,
        mode,
        userId: userId ?? null,
        sfwOnly: !!sfwOnly,
      });
      out.push(...(sfwOnly ? posts.filter((p) => p.rating === "s") : posts));
      step += 1;
      onProgress({
        progress: Math.min(1, step / totalSteps),
        message: `seed ${seed.tag}`,
      });
    }

    return out;
  }

  private async fetchUnifiedHybridCandidates(
    tags: FavoriteTagsResult,
    weights: SuggesterWeights,
    onProgress: (event: IProgressEvent) => void,
    blacklist: string[][],
    blacklistMode: BlacklistMode,
    unified?: UnifiedFetchArgs,
    sfwOnly?: boolean,
  ): Promise<EnhancedPost[]> {
    const children = unified?.children || [];
    const service = new ApiService();
    const out: EnhancedPost[] = [];
    const seeds = pickSeedTags(tags.counts, weights, SEED_TAG_LIMIT);
    const totalSteps = Math.max(1, children.length * (RECENT_PAGES + seeds.length));
    let step = 0;

    for (const child of children) {
      const childBlacklist = [
        ...blacklist,
        ...(unified?.sharedBlacklist || []),
        ...child.blacklist,
      ];
      for (let page = 1; page <= RECENT_PAGES; page++) {
        try {
          const { posts } = await service.getPosts({
            blacklistMode,
            blacklist: childBlacklist,
            limit: PAGE_SIZE,
            tags: [],
            page,
            auth: child.auth,
            baseUrl: child.baseUrl || SITE_MODE_URLS[child.mode],
            mode: child.mode,
            userId: child.userId ?? null,
            sfwOnly: !!sfwOnly,
          });
          out.push(
            ...posts.map((p) => ({
              ...p,
              __meta: {
                ...p.__meta,
                originMode: child.mode,
                originBaseUrl: child.baseUrl,
              },
            })),
          );
          if (posts.length < PAGE_SIZE) {
            step += RECENT_PAGES - page + 1;
            break;
          }
        } catch (err) {
          log("unified recent failed", child.mode, err);
        }
        step += 1;
        onProgress({
          progress: step / totalSteps,
          message: `${child.mode} recent ${page}`,
        });
      }

      for (const seed of seeds) {
        try {
          const { posts } = await service.getPosts({
            blacklistMode,
            blacklist: childBlacklist,
            limit: PAGE_SIZE,
            tags: [seed.tag],
            page: 1,
            auth: child.auth,
            baseUrl: child.baseUrl || SITE_MODE_URLS[child.mode],
            mode: child.mode,
            userId: child.userId ?? null,
            sfwOnly: !!sfwOnly,
          });
          out.push(
            ...posts.map((p) => ({
              ...p,
              __meta: {
                ...p.__meta,
                originMode: child.mode,
                originBaseUrl: child.baseUrl,
              },
            })),
          );
        } catch (err) {
          log("unified seed failed", child.mode, seed.tag, err);
        }
        step += 1;
        onProgress({
          progress: Math.min(1, step / totalSteps),
          message: `${child.mode} seed ${seed.tag}`,
        });
      }
    }

    return out;
  }
}

const modeSupportsOtherUserOnChild = (mode: UnifiedChildMode) =>
  mode === "e621" ||
  mode === "e6ai" ||
  mode === "furaffinity" ||
  mode === "sofurry";

const createCloud = (counts: Record<string, number | undefined>) => {
  return new Promise<{ text: string; size: number }[]>((resolve) => {
    const words = Object.entries(counts)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .map(([text, count]) => ({
        text,
        size: count,
      }));
    words.sort((a, b) => b.size - a.size);

    resolve(words);
  });
};

// Re-export for callers / tests that import from the worker module.
export { pickSeedTags };

expose(AnalyzeService);
