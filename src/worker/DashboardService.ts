import {
  buildCommunityMetrics,
  buildCommunityPerPostMetrics,
  buildUploadMetrics,
  DASHBOARD_POST_LIMIT,
  DASHBOARD_TAG_CANDIDATE_LIMIT,
  isDashboardTruncated,
  sortDashboardTags,
  weeklyUploadRate,
  type DashboardTag,
  type IMetric,
  type ITagCount,
} from "@/misc/util/dashboardMetrics";
import { BlacklistMode, type SiteMode } from "@/services/types";
import { expose } from "comlink";
import { differenceInDays, format, parseISO } from "date-fns";
import type { IProgressEvent } from "./AnalyzeService";
import type { IBaseArgs } from "./api";
import type { EnhancedPost } from "./ApiService";
import { ApiService } from "./ApiService";
import { debug } from "@/misc/util/debug";

const log = debug("app:DashboardService");

export interface IDashboardArgs extends IBaseArgs {
  artist: string;
}

export type Heatmap = {
  max: number;
  days: { [date: string]: number | undefined };
};

export type { DashboardTag, IMetric, ITagCount };

export interface IDashboardResult {
  posts: EnhancedPost[];
  uploadMetrics: IMetric[];
  communityMetrics: IMetric[];
  communityPerPostMetrics: IMetric[];
  ratingBreakdown: { s: number; q: number; e: number };
  topTags: {
    up: DashboardTag[];
    down: DashboardTag[];
    count: DashboardTag[];
    fav: DashboardTag[];
  };
  heatmap: Heatmap;
  sampledPostCount: number;
  truncated: boolean;
  uploadRateWeekly: number;
}

export class DashboardService {
  private static POST_LIMIT = DASHBOARD_POST_LIMIT;
  private static HEATMAP_DAYS = 366;

  async getDashboardResult(
    args: IDashboardArgs,
    onProgress: (event: IProgressEvent) => void,
  ): Promise<IDashboardResult> {
    const posts = await this.getPosts(
      [args.artist],
      args.baseUrl,
      onProgress,
      args.mode,
    );
    if (!posts.length) {
      return {
        communityMetrics: [],
        communityPerPostMetrics: [],
        uploadMetrics: [],
        ratingBreakdown: { s: 0, q: 0, e: 0 },
        posts: [],
        topTags: { count: [], down: [], fav: [], up: [] },
        heatmap: { max: 0, days: {} },
        sampledPostCount: 0,
        truncated: false,
        uploadRateWeekly: 0,
      };
    }
    const counters = {
      upvotes: 0,
      downvotes: 0,
      favorites: 0,
      comments: 0,
      rating: {
        s: 0,
        q: 0,
        e: 0,
      },
      pending: 0,
      tags: {} as {
        [category: string]: {
          [tag: string]: ITagCount | undefined;
        };
      },
      heatmap: {} as { [date: string]: number | undefined },
      heatmapUploads: 0,
    };
    for (const post of posts) {
      counters.upvotes += post.score.up;
      counters.downvotes += post.score.down;
      counters.favorites += post.fav_count;
      counters.comments += post.comment_count;
      counters.rating[post.rating]++;
      if (post.flags.pending) {
        counters.pending++;
      }
      for (const [category, tags] of Object.entries(post.tags)) {
        if (!(category in counters.tags)) {
          counters.tags[category] = {};
        }
        for (const tag of tags) {
          if (!(tag in counters.tags[category])) {
            counters.tags[category][tag] = {
              count: 0,
              favorites: 0,
              up: 0,
              down: 0,
            };
          }
          const counts = counters.tags[category][tag]!;
          counts.count += 1;
          counts.up += post.score.up;
          counts.down += post.score.down;
          counts.favorites += post.fav_count;
        }
      }
      const uploadDate = parseISO(post.created_at);
      if (
        Math.abs(differenceInDays(uploadDate, new Date())) <=
        DashboardService.HEATMAP_DAYS
      ) {
        const formatted = format(uploadDate, "yyyy-MM-dd");
        counters.heatmap[formatted] = (counters.heatmap[formatted] || 0) + 1;
        counters.heatmapUploads += 1;
      }
    }

    const uploadRateWeekly = weeklyUploadRate(
      counters.heatmapUploads,
      DashboardService.HEATMAP_DAYS,
    );
    const sampledPostCount = posts.length;
    const truncated = isDashboardTruncated(sampledPostCount);

    const uploadMetrics = buildUploadMetrics({
      sampledPostCount,
      rating: counters.rating,
      pending: counters.pending,
      uploadRateWeekly,
    });
    const communityMetrics = buildCommunityMetrics(counters);
    const communityPerPostMetrics = buildCommunityPerPostMetrics({
      ...counters,
      postCount: sampledPostCount,
    });

    const tags: DashboardTag[] = Object.entries(counters.tags)
      .flatMap(([category, byName]) =>
        Object.entries(byName).map(
          ([name, counts]) =>
            ({
              name,
              post_count: counts?.count,
              category,
              counts: counts!,
              metricValue: 0,
              metricLabel: "",
            }) satisfies DashboardTag,
        ),
      )
      .filter((t) => t.name !== args.artist && t.name !== "conditional_dnp");

    // Return candidates so the UI can adjust outlier ratio without refetch.
    const candidateLimit = DASHBOARD_TAG_CANDIDATE_LIMIT;
    const topTags = {
      count: sortDashboardTags(tags, "count").slice(0, candidateLimit),
      fav: sortDashboardTags(tags, "fav").slice(0, candidateLimit),
      up: sortDashboardTags(tags, "up").slice(0, candidateLimit),
      down: sortDashboardTags(tags, "down").slice(0, candidateLimit),
    };

    return {
      posts,
      uploadMetrics,
      communityMetrics,
      communityPerPostMetrics,
      ratingBreakdown: { ...counters.rating },
      topTags,
      heatmap: {
        days: counters.heatmap,
        max: (() => {
          const vals = Object.values(counters.heatmap).filter(
            (n): n is number => !!n,
          );
          return vals.length ? Math.max(...vals) : 0;
        })(),
      },
      sampledPostCount,
      truncated,
      uploadRateWeekly,
    };
  }

  private async getPosts(
    tags: string[],
    baseUrl: string,
    onProgress: (event: IProgressEvent) => void,
    mode?: SiteMode,
  ) {
    const service = new ApiService();
    const posts: EnhancedPost[] = [];
    let page = 1;
    const pageLimit = 320;
    log("start fetch");
    while (posts.length < DashboardService.POST_LIMIT) {
      const { posts: newPosts } = await service.getPosts({
        blacklistMode: BlacklistMode.blur,
        limit: pageLimit,
        tags,
        page,
        baseUrl,
        mode,
      });
      page += 1;
      posts.push(...newPosts);
      onProgress({
        message: `got ${posts.length} of ${DashboardService.POST_LIMIT} posts`,
        progress: Math.min(1, posts.length / DashboardService.POST_LIMIT),
      });
      if (newPosts.length < pageLimit) {
        break;
      }
    }
    return posts.slice(0, DashboardService.POST_LIMIT);
  }
}

expose(DashboardService);
