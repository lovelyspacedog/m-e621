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
import { isPostBlacklisted } from "./blacklist";
import type { BlacklistMode } from "@/services/types";
import { createTagQuery } from "@/misc/util/createTagQuery";
import { debug } from "@/misc/util/debug";

const isFurbooruUrl = (baseUrl: string) => baseUrl.includes("furbooru.org");

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
    const data = await e621.tags.list(args);
    if (Array.isArray(data)) {
      return data;
    } else {
      return data.tags;
    }
  }

  async getPools(args: IPoolsArgs) {
    return (await e621.pools.list(args));
  }

  async getPool(args: IGetPoolArgs) {
    return (await e621.pools.get(args));
  }

  async getComments(args: ICommentsListArgs) {
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
    return e621.notes.list(args);
  }

  async favoritePost(args: IPostFavoriteArgs) {
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
}
