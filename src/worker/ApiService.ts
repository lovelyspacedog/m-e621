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
import type { BlacklistMode } from "@/services/types";
import { createTagQuery } from "@/misc/util/createTagQuery";
import { debug } from "@/misc/util/debug";

const isFurbooruUrl = (baseUrl: string) => baseUrl.includes("furbooru.org");
const isInkbunnyUrl = (baseUrl: string) => baseUrl.includes("inkbunny.net");

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
    userId?: number | null;
  }) {
    log(args);

    if (isFurbooruUrl(args.baseUrl)) {
      // Furbooru: strip e621 order:* tags → Philomena sf/sd; join rest as query
      const { sort, tags: searchTags } = furbooru.mapOrderTags(args.tags.filter(Boolean));
      const query = searchTags.join(", ") || "*";
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

    if (isInkbunnyUrl(args.baseUrl)) {
      const result = await inkbunny.searchSubmissions({
        tags: args.tags.filter(Boolean),
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
    if (isFurbooruUrl(args.baseUrl)) {
      return furbooru.searchTags({
        query: args.query ?? args.name,
        limit: args.limit,
        apiKey: null,
      });
    }
    if (isInkbunnyUrl(args.baseUrl)) {
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
    if (isFurbooruUrl(args.baseUrl) || isInkbunnyUrl(args.baseUrl)) {
      return [];
    }
    return (await e621.pools.list(args));
  }

  async getPool(args: IGetPoolArgs) {
    return (await e621.pools.get(args));
  }

  async getComments(args: ICommentsListArgs) {
    if (isInkbunnyUrl(args.baseUrl)) {
      return [];
    }
    if (isFurbooruUrl(args.baseUrl)) {
      return furbooru.getComments({
        imageId: args.postId,
        limit: args.limit ?? 100,
        apiKey: null,
      });
    }
    return e621.comments.list(args);
  }

  async getNotes(args: INotesListArgs) {
    if (isFurbooruUrl(args.baseUrl) || isInkbunnyUrl(args.baseUrl)) {
      return [];
    }
    return e621.notes.list(args);
  }

  async favoritePost(args: IPostFavoriteArgs) {
    if (isInkbunnyUrl(args.baseUrl)) {
      return false;
    }
    if (isFurbooruUrl(args.baseUrl)) {
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
      const message = error?.response?.data?.message;
      if (message) {
        throw new Error(message);
      }
      throw error;
    }
  }

  async unfavoritePost(args: IPostFavoriteArgs) {
    if (isInkbunnyUrl(args.baseUrl)) {
      return false;
    }
    if (isFurbooruUrl(args.baseUrl)) {
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
      const message = error?.response?.data?.message;
      if (message) {
        throw new Error(message);
      }
      throw error;
    }
  }

  async votePost(args: IPostVoteArgs) {
    if (isInkbunnyUrl(args.baseUrl)) {
      return { score: 0, up: 0, down: 0 };
    }
    if (isFurbooruUrl(args.baseUrl)) {
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
    if (isInkbunnyUrl(args.baseUrl)) {
      throw new Error("Inkbunny does not support posting comments via API");
    }
    if (isFurbooruUrl(args.baseUrl)) {
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
  }) {
    if (isInkbunnyUrl(args.baseUrl)) {
      await inkbunny.searchSubmissions({
        tags: [],
        page: 1,
        limit: 1,
        sid: args.apiKey,
      });
      return true;
    }
    if (isFurbooruUrl(args.baseUrl)) {
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

  async enrichInkbunnyPost(post: EnhancedPost, args: { sid?: string | null }) {
    const subs = await inkbunny.getSubmissions({
      ids: [post.id],
      sid: args.sid ?? null,
    });
    const sub = subs[0];
    if (!sub) return post;
    const sid = args.sid ?? null;
    const adapted = inkbunny.adaptDetails(sub, sid);
    return {
      ...post,
      ...adapted,
      __meta: {
        ...post.__meta,
        inkbunny: inkbunny.inkbunnyMetaFromHit(sub, sid, true),
      },
    } satisfies EnhancedPost;
  }
}
