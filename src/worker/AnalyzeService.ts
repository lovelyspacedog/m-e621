import { expose } from "comlink";
import type { PostTags, Post } from "./api";
import type { EnhancedPost } from "./ApiService";
import { ApiService } from "./ApiService";
import { BlacklistMode, type SiteMode } from "@/services/types";
import { debug } from "@/misc/util/debug";

const log = debug("app:AnalyzeService");

// debug.disable();
// debug.enable("app:AnalyzeService");

export interface ScoredPost extends EnhancedPost {
  __score: number;
}

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
}

export interface IAnalyzeTagsResult {
  wordPositions: {
      category: string;
      result: {text: string, size: number}[];
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

export class AnalyzeService {
  async getTagOccurrences(posts: Post[]) {
    log("called getTagOccurrences");
    const tags = posts.map((p) => p.tags);
    // TODO: only copy tags over context boundaries (not all posts)
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

  private async fetchPostsCached(
    tags: string[],
    postLimit: number,
    baseUrl: string,
    onProgress: (event: IProgressEvent) => void,
    mode?: SiteMode,
  ) {
    const service = new ApiService();
    const posts: Post[] = [];
    let page = 1;
    const key = JSON.stringify({ tags, postLimit, baseUrl, mode });
    log("start fetch");
    if (key && this.cache[key]) {
      posts.push(...this.cache[key]!);
    } else {
      const pageLimit = 320;
      while (posts.length < postLimit) {
        const { posts: newPosts } = await service.getPosts({
          blacklistMode: BlacklistMode.blur,
          limit: pageLimit,
          tags,
          baseUrl,
          mode,
          page,
        });
        page += 1;
        posts.push(...newPosts);
        onProgress({
          message: `got ${posts.length} of ${postLimit} posts`,
          progress: Math.min(1, posts.length / postLimit),
        });
        // Stop when the site returns fewer than requested (Inkbunny max 100, etc.) (H9).
        if (newPosts.length < pageLimit) {
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
        result: await createCloud(obj),
      });
      log("created a cloud");
    }
    onProgress({ message: "done", progress: 1 });
    return {
      wordPositions: result,
    };
  }

  async getFavoriteTags(
    username: string,
    baseUrl: string,
    onProgress: (event: IProgressEvent) => void,
    mode?: SiteMode,
  ): Promise<FavoriteTagsResult> {
    const backend =
      mode === "furbooru"
        ? "furbooru"
        : mode === "inkbunny"
          ? "inkbunny"
          : mode === "furaffinity"
            ? "furaffinity"
          : mode === "e621" || mode === "e6ai" || mode === "local" || mode === "tailspace"
            ? "e621"
            : baseUrl.includes("furbooru.org")
              ? "furbooru"
              : baseUrl.includes("inkbunny.net")
                ? "inkbunny"
                : baseUrl.includes("furaffinity.net")
                  ? "furaffinity"
                : "e621";
    const favQuery =
      backend === "furbooru"
        ? ["my:faves"]
        : backend === "inkbunny" || backend === "furaffinity"
          ? ["favs:me"]
          : [`fav:${username}`];
    const posts = await this.fetchPostsCached(
      favQuery,
      320 * 6,
      baseUrl,
      onProgress,
      mode,
    );

    const counts = getCounts(posts);

    return { counts };
  }

  async suggestPosts(
    tags: FavoriteTagsResult,
    weights: {
      [key in
        | "general"
        | "artist"
        | "copyright"
        | "character"
        | "species"
        | "meta"
        | "lore"
        | "invalid"]: number;
    },
    limit: number,
    args: {
      direction: "next" | "previous",
      page: number,
    },
    auth:
      | {
          login: string;
          api_key: string;
        }
      | undefined,
    baseUrl: string,
    onProgress: (event: IProgressEvent) => void,
    blacklist: string[][],
    blacklistMode: BlacklistMode,
    mode?: SiteMode,
  ) {
    // fetch posts, sort them by score and display the top `limit` ones
    const toFetch = limit * 40;
    const service = new ApiService();
    const posts: ScoredPost[] = [];
    let page = args.page;
    while (posts.length < toFetch && page >= 1) {
      onProgress({
        progress: Math.min(1, posts.length / toFetch),
        message: `got ${posts.length} of ${toFetch} posts`,
      });
      const { posts: newPosts } = await service.getPosts({
        blacklistMode,
        blacklist,
        limit: 320,
        tags: [],
        page,
        auth,
        baseUrl,
        mode,
      });

      const scoredNewPosts = scorePosts(tags, weights, newPosts);
      if (args.direction === "previous") {
        page -= 1;
        posts.unshift(...scoredNewPosts);
      } else {
        page += 1;
        posts.push(...scoredNewPosts);
      }

      if (scoredNewPosts.length < 320) {
        break;
      }
    }
    const bestPostIds = [...posts]
      .sort((a, b) => b.__score - a.__score)
      .slice(0, limit)
      .map((p) => p.id);
    const result = posts.filter((p) => bestPostIds.includes(p.id)); // keep original order
    onProgress({ indeterminate: true, message: "done", progress: 1 });

    return result;
  }
}

const scorePosts = (
  tags: FavoriteTagsResult,
  weights: Parameters<AnalyzeService["suggestPosts"]>["1"],
  posts: EnhancedPost[],
) => {
  const scoredPosts: ScoredPost[] = [];
  for (const post of posts) {
    let score = 0;
    let tagCount = 0;
    for (const tag of tagIterator(post.tags)) {
      ++tagCount;
      const categoryWeight = Number((weights as any)[tag.category]);
      if (!categoryWeight) continue;
      const count = tags.counts[tag.category]?.[tag.tag];
      if (!count) continue;
      score += count * categoryWeight;
    }
    scoredPosts.push({
      ...post,
      __score: tagCount ? Math.round(score / tagCount) : 0,
    });
  }
  return scoredPosts;
};

const tagIterator = function* (tags: PostTags) {
  for (const [category, arr] of Object.entries(tags)) {
    for (const tag of arr) {
      yield {
        category,
        tag,
      };
    }
  }
};

const createCloud = (counts: any) => {
  return new Promise<{text: string, size: number}[]>((resolve) => {
    const words = Object.entries(counts).map(([text, count]) => ({
      text,
      size: count as number,
    }));
    words.sort((a, b) => b.size - a.size);

      resolve(words);
  });
};

const getCounts = (posts: Post[]) => {
  const counts: {
    [category: string]: undefined | { [tag: string]: undefined | number };
  } = {};
  for (const post of posts) {
    for (const [category, tags] of Object.entries(post.tags)) {
      counts[category] = counts[category] || {};
      for (const tag of tags) {
        counts[category]![tag] = (counts[category]![tag] || 0) + 1;
      }
    }
  }
  return counts;
};

export interface FavoriteTagsResult {
  counts: ReturnType<typeof getCounts>;
}

expose(AnalyzeService);
