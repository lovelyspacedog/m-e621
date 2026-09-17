import type { Post, PostTags } from "@/worker/api";
import type { EnhancedPost } from "@/worker/ApiService";
import type { SuggesterWeights } from "@/misc/util/favoriteQuery";
import { postFeedKey } from "@/misc/util/postOrigin";

export interface ScoredPost extends EnhancedPost {
  __score: number;
}

export type FavoriteTagsResult = {
  counts: {
    [category: string]: undefined | { [tag: string]: undefined | number };
  };
  /** postFeedKey values from the favorite sample (exclude from suggestions). */
  favoriteKeys: string[];
};

export const getCounts = (posts: Post[]) => {
  const counts: FavoriteTagsResult["counts"] = {};
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

export const favoriteKeysFromPosts = (
  posts: Array<{ id: number; __meta?: { originMode?: string } }>,
) => posts.map((p) => postFeedKey(p));

export const buildFavoriteTagsResult = (posts: Post[]): FavoriteTagsResult => ({
  counts: getCounts(posts),
  favoriteKeys: favoriteKeysFromPosts(posts),
});

const tagIterator = function* (tags: PostTags) {
  for (const [category, arr] of Object.entries(tags)) {
    for (const tag of arr) {
      yield { category, tag };
    }
  }
};

export const scorePosts = (
  tags: FavoriteTagsResult,
  weights: Partial<SuggesterWeights>,
  posts: EnhancedPost[],
): ScoredPost[] => {
  const scoredPosts: ScoredPost[] = [];
  for (const post of posts) {
    let score = 0;
    let tagCount = 0;
    for (const tag of tagIterator(post.tags)) {
      ++tagCount;
      const categoryWeight = Number(
        (weights as Record<string, number>)[tag.category] || 0,
      );
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

export const dedupePosts = (posts: EnhancedPost[]): EnhancedPost[] => {
  const seen = new Set<string>();
  const out: EnhancedPost[] = [];
  for (const post of posts) {
    const key = postFeedKey(post);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(post);
  }
  return out;
};

export const rankSuggestionPool = (args: {
  tags: FavoriteTagsResult;
  weights: Partial<SuggesterWeights>;
  candidates: EnhancedPost[];
  excludeKeys?: string[];
}): ScoredPost[] => {
  const exclude = new Set([
    ...(args.tags.favoriteKeys || []),
    ...(args.excludeKeys || []),
  ]);
  const filtered = dedupePosts(args.candidates).filter(
    (p) => !exclude.has(postFeedKey(p)),
  );
  return scorePosts(args.tags, args.weights, filtered).sort(
    (a, b) => b.__score - a.__score,
  );
};

/** Stamp suggestion page onto posts so postListManager next/prev advances correctly. */
export const sliceScoredPool = (
  pool: ScoredPost[],
  page: number,
  limit: number,
): ScoredPost[] => {
  const p = Math.max(1, page || 1);
  const start = (p - 1) * limit;
  return pool.slice(start, start + limit).map((post) => ({
    ...post,
    __meta: {
      ...post.__meta,
      pageNumber: p,
    },
  }));
};
