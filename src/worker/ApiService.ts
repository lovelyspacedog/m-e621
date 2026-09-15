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
import { isPostBlacklisted } from "./blacklist";
import { BlacklistMode, type SiteMode } from "@/services/types";
import { createTagQuery } from "@/misc/util/createTagQuery";
import { debug } from "@/misc/util/debug";

const isFurbooruUrl = (baseUrl: string) => baseUrl.includes("furbooru.org");
const isInkbunnyUrl = (baseUrl: string) => baseUrl.includes("inkbunny.net");
const isTailspaceUrl = (baseUrl: string) =>
  /(?:^|\.)tailspace\.com(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));

/** Prefer explicit mode; fall back to hostname only when mode omitted (M17). */
type ApiBackend = "e621" | "furbooru" | "inkbunny" | "tailspace";

const resolveApiBackend = (baseUrl: string, mode?: SiteMode): ApiBackend => {
  if (mode === "furbooru") return "furbooru";
  if (mode === "inkbunny") return "inkbunny";
  if (mode === "tailspace") return "tailspace";
  if (mode === "e621" || mode === "e6ai" || mode === "local") return "e621";
  if (isFurbooruUrl(baseUrl)) return "furbooru";
  if (isInkbunnyUrl(baseUrl)) return "inkbunny";
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
  };
}

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
  }) {
    log(args);
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
    if (backend === "furbooru" || backend === "inkbunny") {
      return [];
    }
    return (await e621.pools.list(args));
  }

  async getPool(args: IGetPoolArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    assertNotTailspace(args.baseUrl, "getPool", args.mode);
    if (backend === "furbooru" || backend === "inkbunny") {
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
    if (backend === "furbooru" || backend === "inkbunny") {
      return [];
    }
    return e621.notes.list(args);
  }

  async favoritePost(args: IPostFavoriteArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "inkbunny") {
      return false;
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
    if (backend === "inkbunny") {
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
