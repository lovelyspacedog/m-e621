import type {
  ITagsListArgs,
  IPoolsArgs,
  Post,
  IPostsListArgs,
  IPostFavoriteArgs,
  IPostVoteArgs,
  IPostCommentArgs,
  IGetPoolArgs,
  ICommentsListArgs,
  INotesListArgs} from "./api";
import {
  e621,
  custom
} from "./api";
import * as furbooru from "./furbooru/api";
import * as inkbunny from "./inkbunny/api";
import type { InkbunnyMeta } from "./inkbunny/api";
import * as furaffinity from "./furaffinity/api";
import type { FaMeta } from "./furaffinity/api";
import { isPostBlacklisted } from "./blacklist";
import { BlacklistMode, type SiteMode, type SavedPostEntry } from "@/services/types";
import type { UnifiedChildMode } from "@/services/types";
import { createTagQuery } from "@/misc/util/createTagQuery";
import { debug } from "@/misc/util/debug";
import {
  unifiedChildLabel,
  type UnifiedChildFetchArgs,
  type UnifiedFetchArgs,
} from "@/misc/util/postOrigin";

const isFurbooruUrl = (baseUrl: string) => baseUrl.includes("furbooru.org");
const isInkbunnyUrl = (baseUrl: string) => baseUrl.includes("inkbunny.net");
const isFurAffinityUrl = (baseUrl: string) =>
  /(?:^|\.)furaffinity\.net(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isTailspaceUrl = (baseUrl: string) =>
  /(?:^|\.)tailspace\.com(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));

/** Prefer explicit mode; fall back to hostname only when mode omitted (M17). */
type ApiBackend = "e621" | "furbooru" | "inkbunny" | "tailspace" | "furaffinity";

const resolveApiBackend = (baseUrl: string, mode?: SiteMode): ApiBackend => {
  if (mode === "furbooru") return "furbooru";
  if (mode === "inkbunny") return "inkbunny";
  if (mode === "furaffinity") return "furaffinity";
  if (mode === "tailspace") return "tailspace";
  if (mode === "e621" || mode === "e6ai" || mode === "local") return "e621";
  if (isFurbooruUrl(baseUrl)) return "furbooru";
  if (isInkbunnyUrl(baseUrl)) return "inkbunny";
  if (isFurAffinityUrl(baseUrl)) return "furaffinity";
  if (isTailspaceUrl(baseUrl)) return "tailspace";
  return "e621";
};

const assertNotTailspace = (
  baseUrl: string,
  method: string,
  mode?: SiteMode,
) => {
  if (resolveApiBackend(baseUrl, mode) === "tailspace") {
    throw new Error(
      `${method} is not available for Tailspace; use the Tailspace pages instead`,
    );
  }
};

// debug.disable();
// debug.enable("app:*");

const log = debug("app:ApiService");

export interface EnhancedPost extends Post {
  __meta: {
    isBlacklisted: boolean;
    isFavoriteLoading?: boolean;
    isVoteLoading?: boolean;
    pageNumber: number;
    localPath?: string;
    localExtraTags?: string[];
    localPlayable?: boolean;
    localKind?: "image" | "video";
    inkbunny?: InkbunnyMeta;
    furaffinity?: FaMeta;
    originMode?: UnifiedChildMode;
    originBaseUrl?: string;
  };
}

export type GetPostsResult = {
  posts: EnhancedPost[];
  warnings?: string[];
};

const postCreatedAtMs = (post: EnhancedPost): number => {
  const raw = post.created_at;
  if (!raw) return 0;
  const ms = Date.parse(typeof raw === "string" ? raw : String(raw));
  return Number.isFinite(ms) ? ms : 0;
};

/** Merge federated pages newest-first by post time (not round-robin by site). */
const mergeByCreatedAt = (groups: EnhancedPost[][], limit: number): EnhancedPost[] => {
  const flat = groups.flat();
  flat.sort((a, b) => postCreatedAtMs(b) - postCreatedAtMs(a) || b.id - a.id);
  return flat.slice(0, limit);
};

const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch {
    return await fn();
  }
};

export class ApiService {
  async getPosts(args: {
    page: number;
    limit: number;
    tags: string[];
    blacklist?: string[][];
    blacklistMode: BlacklistMode;
    auth?: IPostsListArgs["auth"];
    baseUrl: string;
    mode?: SiteMode;
    userId?: number | null;
    unified?: UnifiedFetchArgs;
  }): Promise<GetPostsResult> {
    log(args);
    if (args.mode === "unified") {
      return this.getUnifiedPosts(args);
    }
    const posts = await this.getPostsFromBackend(args);
    return { posts };
  }

  private async getUnifiedPosts(args: {
    page: number;
    limit: number;
    tags: string[];
    blacklist?: string[][];
    blacklistMode: BlacklistMode;
    unified?: UnifiedFetchArgs;
  }): Promise<GetPostsResult> {
    const children = args.unified?.children || [];
    const shared = args.unified?.sharedBlacklist || args.blacklist || [];
    if (!children.length) {
      throw new Error("No sites enabled for Unified search");
    }
    const warnings: string[] = [];
    const groups = await Promise.all(
      children.map(async (child) => {
        try {
          const posts = await withRetry(() =>
            this.getPostsFromBackend({
              page: args.page,
              limit: args.limit,
              tags: args.tags,
              blacklist: child.blacklist,
              blacklistMode: args.blacklistMode,
              auth: child.auth,
              baseUrl: child.baseUrl,
              mode: child.mode,
              userId: child.userId,
            }),
          );
          return posts.map((post) => ({
            ...post,
            __meta: {
              ...post.__meta,
              originMode: child.mode,
              originBaseUrl: child.baseUrl,
              isBlacklisted:
                post.__meta.isBlacklisted ||
                isPostBlacklisted(post, shared),
              pageNumber: args.page,
            },
          }));
        } catch (error: any) {
          warnings.push(
            `${unifiedChildLabel(child.mode)}: ${error?.message || String(error)}`,
          );
          return [] as EnhancedPost[];
        }
      }),
    );
    const posts = mergeByCreatedAt(groups, args.limit);
    if (!posts.length && warnings.length === children.length) {
      throw new Error(warnings.join(" · "));
    }
    return warnings.length ? { posts, warnings } : { posts };
  }

  /**
   * Live-fetch saved bookmarks by origin+id. Soft-fails per id;
   * order follows `entries` (caller should pass savedAt-desc).
   */
  async getPostsByIds(args: {
    entries: SavedPostEntry[];
    children: UnifiedChildFetchArgs[];
    sharedBlacklist?: string[][];
  }): Promise<GetPostsResult> {
    const childrenByMode = new Map(
      args.children.map((c) => [c.mode, c] as const),
    );
    const shared = args.sharedBlacklist || [];
    const warnings: string[] = [];
    const byKey = new Map<string, EnhancedPost>();

    const groups = new Map<UnifiedChildMode, number[]>();
    for (const entry of args.entries) {
      const list = groups.get(entry.originMode) || [];
      list.push(entry.id);
      groups.set(entry.originMode, list);
    }

    await Promise.all(
      [...groups.entries()].map(async ([mode, ids]) => {
        const child = childrenByMode.get(mode);
        if (!child) {
          warnings.push(
            `${unifiedChildLabel(mode)}: site not available (enable in Account settings)`,
          );
          return;
        }
        try {
          const fetched = await this.fetchPostsByIdsForChild(child, ids, shared);
          for (const post of fetched) {
            byKey.set(`${mode}:${post.id}`, post);
          }
        } catch (error: any) {
          warnings.push(
            `${unifiedChildLabel(mode)}: ${error?.message || String(error)}`,
          );
        }
      }),
    );

    const posts: EnhancedPost[] = [];
    const missing: string[] = [];
    for (const entry of args.entries) {
      const post = byKey.get(`${entry.originMode}:${entry.id}`);
      if (post) posts.push(post);
      else missing.push(`${unifiedChildLabel(entry.originMode)} #${entry.id}`);
    }
    if (missing.length && missing.length <= 5) {
      warnings.push(`Could not load: ${missing.join(", ")}`);
    } else if (missing.length > 5) {
      warnings.push(`Could not load ${missing.length} saved posts`);
    }
    return warnings.length ? { posts, warnings } : { posts };
  }

  private async fetchPostsByIdsForChild(
    child: UnifiedChildFetchArgs,
    ids: number[],
    sharedBlacklist: string[][],
  ): Promise<EnhancedPost[]> {
    const uniqueIds = [...new Set(ids)];
    const stamp = (post: EnhancedPost): EnhancedPost => ({
      ...post,
      __meta: {
        ...post.__meta,
        originMode: child.mode,
        originBaseUrl: child.baseUrl,
        isBlacklisted:
          post.__meta.isBlacklisted ||
          isPostBlacklisted(post, sharedBlacklist),
      },
    });

    if (child.mode === "inkbunny") {
      const subs = await inkbunny.getSubmissions({
        ids: uniqueIds,
        sid: child.auth?.api_key ?? null,
      });
      return subs.map((sub) => {
        const adapted = inkbunny.adaptDetails(sub, child.auth?.api_key ?? null);
        return stamp({
          ...adapted,
          score: {
            ...adapted.score,
            down: Math.abs(adapted.score.down),
          },
          __meta: {
            isBlacklisted: isPostBlacklisted(adapted, child.blacklist),
            pageNumber: 1,
            inkbunny: inkbunny.inkbunnyMetaFromHit(
              sub,
              child.auth?.api_key ?? null,
              true,
            ),
          },
        });
      });
    }

    if (child.mode === "furaffinity") {
      const results = await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            const sub = await furaffinity.getSubmission(
              id,
              child.auth?.api_key ?? null,
            );
            const adapted = furaffinity.adaptPartial(
              sub,
              child.auth?.api_key ?? null,
            );
            return stamp({
              ...adapted,
              score: {
                ...adapted.score,
                down: Math.abs(adapted.score.down),
              },
              __meta: {
                isBlacklisted: isPostBlacklisted(adapted, child.blacklist),
                pageNumber: 1,
                furaffinity: furaffinity.faMetaFrom(sub, true),
              },
            });
          } catch {
            return null;
          }
        }),
      );
      return results.filter((p): p is EnhancedPost => !!p);
    }

    if (child.mode === "furbooru") {
      const results = await Promise.all(
        uniqueIds.map(async (id) => {
          const post = await furbooru.getImage({
            id,
            apiKey: child.auth?.api_key ?? null,
          });
          if (!post) return null;
          return stamp({
            ...post,
            score: {
              ...post.score,
              down: Math.abs(post.score.down),
            },
            __meta: {
              isBlacklisted: isPostBlacklisted(post, child.blacklist),
              pageNumber: 1,
            },
          });
        }),
      );
      return results.filter((p): p is EnhancedPost => !!p);
    }

    // e621 / e6ai
    const results = await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const data = await e621.posts.list({
            page: 1,
            limit: 1,
            tags: `id:${id}`,
            auth: child.auth,
            baseUrl: child.baseUrl,
          });
          const post = data.posts?.[0];
          if (!post) return null;
          return stamp({
            ...post,
            score: {
              ...post.score,
              down: Math.abs(post.score.down),
            },
            __meta: {
              isBlacklisted: isPostBlacklisted(post, child.blacklist),
              pageNumber: 1,
            },
          });
        } catch {
          return null;
        }
      }),
    );
    return results.filter((p): p is EnhancedPost => !!p);
  }

  private async getPostsFromBackend(args: {
    page: number;
    limit: number;
    tags: string[];
    blacklist?: string[][];
    blacklistMode: BlacklistMode;
    auth?: IPostsListArgs["auth"];
    baseUrl: string;
    mode?: SiteMode;
    userId?: number | null;
  }): Promise<EnhancedPost[]> {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    assertNotTailspace(args.baseUrl, "getPosts", args.mode);

    if (backend === "furbooru") {
      // Furbooru: strip e621 order:* tags → Philomena sf/sd; join rest as query
      const { sort, tags: searchTags } = furbooru.mapOrderTags(args.tags.filter(Boolean));
      const hideNegations =
        args.blacklistMode === BlacklistMode.hide
          ? (args.blacklist || [])
              .filter((line) => line.length === 1 && line[0] && !line[0].startsWith("~"))
              .map((line) => {
                const term = line[0];
                if (/^(score|width|height|id|favcount):/i.test(term)) return null;
                return term.startsWith("-") ? term : `-${term}`;
              })
              .filter((t): t is string => !!t)
          : [];
      const query =
        [...searchTags, ...hideNegations].join(", ") || "*";
      const result = await furbooru.searchImages({
        query,
        page: args.page,
        limit: args.limit,
        apiKey: args.auth?.api_key ?? null,
        sort,
      });
      return result.posts.map<EnhancedPost>((post) => ({
        ...post,
        __meta: {
          isBlacklisted: isPostBlacklisted(post, args.blacklist || []),
          pageNumber: args.page,
        },
      }));
    }

    if (backend === "inkbunny") {
      const hideNegations =
        args.blacklistMode === BlacklistMode.hide
          ? (args.blacklist || [])
              .filter((line) => line.length === 1 && line[0] && !line[0].startsWith("~") && !line[0].startsWith("-"))
              .map((line) => `-${line[0]}`)
          : [];
      const result = await inkbunny.searchSubmissions({
        tags: [...args.tags.filter(Boolean), ...hideNegations],
        page: args.page,
        limit: args.limit,
        sid: args.auth?.api_key ?? null,
        userId: args.userId ?? null,
      });
      return result.posts.map<EnhancedPost>((post, index) => ({
        ...post,
        __meta: {
          isBlacklisted: isPostBlacklisted(post, args.blacklist || []),
          pageNumber: args.page,
          inkbunny: inkbunny.inkbunnyMetaFromHit(result.hits[index] || {}, result.sid),
        },
      }));
    }

    if (backend === "furaffinity") {
      const hideNegations =
        args.blacklistMode === BlacklistMode.hide
          ? (args.blacklist || [])
              .filter((line) => line.length === 1 && line[0] && !line[0].startsWith("~") && !line[0].startsWith("-"))
              .map((line) => `-${line[0]}`)
          : [];
      const result = await furaffinity.searchSubmissions({
        tags: [...args.tags.filter(Boolean), ...hideNegations],
        page: args.page,
        limit: args.limit,
        cookies: args.auth?.api_key ?? null,
        username: args.auth?.login ?? null,
      });
      return result.posts.map<EnhancedPost>((post, index) => ({
        ...post,
        __meta: {
          isBlacklisted: isPostBlacklisted(post, args.blacklist || []),
          pageNumber: args.page,
          furaffinity: furaffinity.faMetaFrom(result.hits[index] || {}),
        },
      }));
    }

    const posts = (
      await e621.posts.list({
        ...args,
        tags: createTagQuery(
          args.blacklistMode,
          args.blacklist || [],
          args.tags,
        ),
        baseUrl: args.baseUrl
      })
    ).posts;

    return posts.map<EnhancedPost>((post) => ({
      ...post,
      score: {
        ...post.score,
        down: Math.abs(post.score.down), // shouldn't be negative imo
      },
      __meta: {
        isBlacklisted: isPostBlacklisted(post, args.blacklist || []),
        pageNumber: args.page,
      },
    }));
  }

  async getTags(args: ITagsListArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    assertNotTailspace(args.baseUrl, "getTags", args.mode);
    if (backend === "furbooru") {
      return furbooru.searchTags({
        query: args.query ?? args.name,
        limit: args.limit,
        apiKey: args.auth?.api_key ?? null,
      });
    }
    if (backend === "inkbunny") {
      return inkbunny.searchKeywords({
        query: args.query ?? args.name ?? "",
        sid: null,
      });
    }
    if (backend === "furaffinity") {
      return furaffinity.searchKeywords(args.query ?? args.name ?? "");
    }
    const data = await e621.tags.list(args);
    if (Array.isArray(data)) {
      return data;
    } else {
      return data.tags;
    }
  }

  async getPools(args: IPoolsArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    assertNotTailspace(args.baseUrl, "getPools", args.mode);
    if (backend === "furbooru" || backend === "inkbunny" || backend === "furaffinity") {
      return [];
    }
    return (await e621.pools.list(args));
  }

  async getPool(args: IGetPoolArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    assertNotTailspace(args.baseUrl, "getPool", args.mode);
    if (backend === "furbooru" || backend === "inkbunny" || backend === "furaffinity") {
      throw new Error("Pools are not supported on this site");
    }
    return (await e621.pools.get(args));
  }

  async getComments(args: ICommentsListArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    assertNotTailspace(args.baseUrl, "getComments", args.mode);
    if (backend === "inkbunny") {
      return [];
    }
    if (backend === "furaffinity") {
      return furaffinity.getComments(args.postId, args.auth?.api_key ?? null);
    }
    if (backend === "furbooru") {
      return furbooru.getComments({
        imageId: args.postId,
        limit: args.limit ?? 100,
        apiKey: args.auth?.api_key ?? null,
      });
    }
    return e621.comments.list(args);
  }

  async getNotes(args: INotesListArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "furbooru" || backend === "inkbunny" || backend === "furaffinity") {
      return [];
    }
    return e621.notes.list(args);
  }

  async favoritePost(args: IPostFavoriteArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "inkbunny") {
      return false;
    }
    if (backend === "furaffinity") {
      await furaffinity.favoriteSubmission(args.postId, args.auth?.api_key ?? null);
      return true;
    }
    if (backend === "furbooru") {
      await furbooru.favoriteImage({
        postId: args.postId,
        apiKey: args.auth.api_key,
      });
      return true;
    }
    try {
      await custom.posts.favorite(args);
      return true;
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message;
      if (message && message !== error?.message) {
        throw new Error(message);
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async unfavoritePost(args: IPostFavoriteArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "inkbunny") {
      return false;
    }
    if (backend === "furaffinity") {
      await furaffinity.unfavoriteSubmission(args.postId, args.auth?.api_key ?? null);
      return true;
    }
    if (backend === "furbooru") {
      await furbooru.unfavoriteImage({
        postId: args.postId,
        apiKey: args.auth.api_key,
      });
      return true;
    }
    try {
      await custom.posts.unfavorite(args);
      return true;
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message;
      if (message && message !== error?.message) {
        throw new Error(message);
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async votePost(args: IPostVoteArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "inkbunny" || backend === "furaffinity") {
      return { score: 0, up: 0, down: 0 };
    }
    if (backend === "furbooru") {
      if (args.score === 0) {
        return furbooru.clearVoteImage({
          postId: args.postId,
          apiKey: args.auth.api_key,
        });
      }
      const value = args.score > 0 ? "up" : "down";
      return furbooru.voteImage({
        postId: args.postId,
        apiKey: args.auth.api_key,
        value,
      });
    }
    try {
      return await custom.posts.vote(args);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      if (message) {
        throw new Error(message);
      }
      throw error;
    }
  }

  async createComment(args: IPostCommentArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "inkbunny") {
      throw new Error("Inkbunny does not support posting comments via API");
    }
    if (backend === "furaffinity") {
      await furaffinity.createComment(args.postId, args.body, args.auth?.api_key ?? null);
      return {
        id: Date.now(),
        created_at: new Date().toISOString(),
        post_id: args.postId,
        creator_id: 0,
        body: args.body,
        score: 0,
        updated_at: new Date().toISOString(),
        updater_id: 0,
        do_not_bump_post: false,
        is_hidden: false,
        is_sticky: false,
        creator_name: args.auth?.login || "",
        updater_name: args.auth?.login || "",
      };
    }
    if (backend === "furbooru") {
      return furbooru.createComment({
        postId: args.postId,
        apiKey: args.auth.api_key,
        body: args.body,
      });
    }
    try {
      return await custom.posts.createComment(args);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      if (message) {
        throw new Error(message);
      }
      throw error;
    }
  }

  async verifyAccount(args: {
    username: string;
    apiKey: string;
    baseUrl: string;
    mode?: SiteMode;
  }) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "inkbunny") {
      const { userId } = await inkbunny.verifySidForUsername(
        args.apiKey,
        args.username,
      );
      // Persist resolved user id for favs:me when AccountSettings stores it.
      if (userId > 0) {
        // Caller (AccountSettings) already has username; return ok.
      }
      return true;
    }
    if (backend === "furaffinity") {
      await furaffinity.me(args.apiKey || null);
      return true;
    }
    if (backend === "furbooru") {
      // Furbooru uses API key only — no username needed
      await furbooru.verifyApiKey({ apiKey: args.apiKey });
      return true;
    }
    const auth = { login: args.username, api_key: args.apiKey };
    const user = await e621.users.get({
      baseUrl: args.baseUrl,
      name: args.username,
      auth,
    });
    if (!user?.name || user.name.toLowerCase() !== args.username.toLowerCase()) {
      throw new Error("Username does not match the authenticated account");
    }
    // users.json is public; favorites.json requires valid Basic auth.
    await e621.favorites.list({
      baseUrl: args.baseUrl,
      auth,
      limit: 1,
    });
    return true;
  }

  async loginInkbunny(args: { username: string; password?: string }) {
    return inkbunny.login(args.username, args.password);
  }

  async logoutInkbunny(args: { sid: string }) {
    await inkbunny.logout(args.sid);
    await inkbunny.login("guest");
  }

  async getInkbunnyWatchlist(args: { sid: string }) {
    return inkbunny.getWatchlist(args.sid);
  }

  async loginFurAffinity(args: { username: string; password: string }) {
    return furaffinity.login(args.username, args.password);
  }

  async loginFurAffinityCookies(args: { cookieA: string; cookieB: string }) {
    return furaffinity.loginWithCookies(args.cookieA, args.cookieB);
  }

  async logoutFurAffinity() {
    await furaffinity.logoutLocal();
  }

  async getFurAffinityWatchlist(args: { cookies?: string | null; username?: string | null }) {
    return furaffinity.getWatchlist(args.cookies ?? null, args.username ?? null);
  }

  async enrichFurAffinityPost(
    post: EnhancedPost,
    args: { cookies?: string | null; blacklist?: string[][] },
  ) {
    const meta = post.__meta.furaffinity;
    if (meta?.kind === "journal") {
      const journal = await furaffinity.getJournal(post.id, args.cookies ?? null);
      const adapted = furaffinity.adaptPartial(journal, args.cookies ?? null);
      const merged = { ...post, ...adapted };
      return {
        ...merged,
        __meta: {
          ...post.__meta,
          isBlacklisted: isPostBlacklisted(merged, args.blacklist || []),
          furaffinity: furaffinity.faMetaFrom(journal, true),
        },
      } satisfies EnhancedPost;
    }
    const sub = await furaffinity.getSubmission(post.id, args.cookies ?? null);
    const adapted = furaffinity.adaptPartial(sub, args.cookies ?? null);
    const merged = { ...post, ...adapted };
    return {
      ...merged,
      __meta: {
        ...post.__meta,
        isBlacklisted: isPostBlacklisted(merged, args.blacklist || []),
        furaffinity: furaffinity.faMetaFrom(sub, true),
      },
    } satisfies EnhancedPost;
  }

  async enrichInkbunnyPost(
    post: EnhancedPost,
    args: { sid?: string | null; blacklist?: string[][] },
  ) {
    const subs = await inkbunny.getSubmissions({
      ids: [post.id],
      sid: args.sid ?? null,
    });
    const sub = subs[0];
    if (!sub) return post;
    const sid = args.sid ?? null;
    const adapted = inkbunny.adaptDetails(sub, sid);
    const merged = {
      ...post,
      ...adapted,
    };
    return {
      ...merged,
      __meta: {
        ...post.__meta,
        // Recompute after keywords load — search hits lack tags (H10).
        isBlacklisted: isPostBlacklisted(merged, args.blacklist || []),
        inkbunny: inkbunny.inkbunnyMetaFromHit(sub, sid, true),
      },
    } satisfies EnhancedPost;
  }
}
