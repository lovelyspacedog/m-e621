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
import type { Tag } from "./api/returnTypes";
import {
  e621,
  custom
} from "./api";
import * as furbooru from "./furbooru/api";
import * as inkbunny from "./inkbunny/api";
import type { InkbunnyMeta } from "./inkbunny/api";
import * as furaffinity from "./furaffinity/api";
import type { FaMeta } from "./furaffinity/api";
import * as weasyl from "./weasyl/api";
import * as itaku from "./itaku/api";
import * as sofurry from "./sofurry/api";
import * as tailspace from "./tailspace/api";
import { isPostBlacklisted } from "./blacklist";
import { BlacklistMode, type SiteMode, type SavedPostEntry } from "@/services/types";
import type { UnifiedChildMode } from "@/services/types";
import { createTagQuery } from "@/misc/util/createTagQuery";
import { debug } from "@/misc/util/debug";
import { shuffled } from "@/misc/util/shuffle";
import {
  unifiedChildLabel,
  type UnifiedChildFetchArgs,
  type UnifiedFetchArgs,
} from "@/misc/util/postOrigin";
import {
  bufferedCount,
  initUnifiedMergeState,
  resetUnifiedMergeState,
  seedUnifiedMergeAfterLegacy,
  takeMergedFromBuffers,
  type UnifiedMergeState,
} from "@/misc/util/unifiedMerge";
import { formatUnifiedTagWarning, prepareUnifiedChildTags } from "@/misc/util/unifiedTags";

const isFurbooruUrl = (baseUrl: string) => baseUrl.includes("furbooru.org");
const isInkbunnyUrl = (baseUrl: string) => baseUrl.includes("inkbunny.net");
const isFurAffinityUrl = (baseUrl: string) =>
  /(?:^|\.)furaffinity\.net(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isTailspaceUrl = (baseUrl: string) =>
  /(?:^|\.)tailspace\.com(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isWeasylUrl = (baseUrl: string) =>
  /(?:^|\.)weasyl\.com(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isItakuUrl = (baseUrl: string) =>
  /(?:^|\.)itaku\.ee(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isSofurryUrl = (baseUrl: string) =>
  /(?:^|\.)sofurry\.com(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isFlayrahUrl = (baseUrl: string) =>
  /(?:^|\.)flayrah\.com(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));

/** Prefer explicit mode; fall back to hostname only when mode omitted (M17). */
type ApiBackend = "e621" | "furbooru" | "inkbunny" | "tailspace" | "furaffinity" | "weasyl" | "itaku" | "sofurry" | "flayrah";

/**
 * Site-mode checklist (do NOT invent a plugin framework; refuse drive-by sites):
 * types + SITE_MODE_URLS + empty profile + SiteModeStore + nav/router guards +
 * worker adapter + Vite/serve.py proxy + siteCapabilities flags.
 * Never fall through to the e621 client (comments/notes/pools/analyzer/…).
 * Post Suggester is multi-mode via AnalyzeService; Tailspace/Flayrah still blocked here.
 * UA / `_client`: `PawFeed/<git>`. See Markdowns/AI_CONTEXT.md.
 */
const resolveApiBackend = (baseUrl: string, mode?: SiteMode): ApiBackend => {
  if (mode === "furbooru") return "furbooru";
  if (mode === "inkbunny") return "inkbunny";
  if (mode === "furaffinity") return "furaffinity";
  if (mode === "tailspace") return "tailspace";
  if (mode === "flayrah") return "flayrah";
  if (mode === "weasyl") return "weasyl";
  if (mode === "itaku") return "itaku";
  if (mode === "sofurry") return "sofurry";
  if (mode === "e621" || mode === "e6ai" || mode === "local") return "e621";
  if (isFurbooruUrl(baseUrl)) return "furbooru";
  if (isInkbunnyUrl(baseUrl)) return "inkbunny";
  if (isFurAffinityUrl(baseUrl)) return "furaffinity";
  if (isTailspaceUrl(baseUrl)) return "tailspace";
  if (isFlayrahUrl(baseUrl)) return "flayrah";
  if (isWeasylUrl(baseUrl)) return "weasyl";
  if (isItakuUrl(baseUrl)) return "itaku";
  if (isSofurryUrl(baseUrl)) return "sofurry";
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

const assertNotFlayrah = (
  baseUrl: string,
  method: string,
  mode?: SiteMode,
) => {
  if (resolveApiBackend(baseUrl, mode) === "flayrah") {
    throw new Error(
      `${method} is not available for Flayrah; use the Flayrah pages instead`,
    );
  }
};

const assertNotDedicatedChrome = (
  baseUrl: string,
  method: string,
  mode?: SiteMode,
) => {
  assertNotTailspace(baseUrl, method, mode);
  assertNotFlayrah(baseUrl, method, mode);
};

const originModeStamp = (mode?: SiteMode): UnifiedChildMode | undefined => {
  if (!mode) return undefined;
  if (
    mode === "e621" ||
    mode === "e6ai" ||
    mode === "furbooru" ||
    mode === "inkbunny" ||
    mode === "furaffinity" ||
    mode === "weasyl" ||
    mode === "itaku" ||
    mode === "sofurry"
  ) {
    return mode;
  }
  return undefined;
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
    localKind?: "image" | "video" | "audio";
    inkbunny?: InkbunnyMeta;
    furaffinity?: FaMeta;
    sofurry?: sofurry.SofurryMeta;
    itaku?: itaku.ItakuMeta;
    weasyl?: weasyl.WeasylMeta;
    kind?: string;
    originMode?: UnifiedChildMode | "local";
    originBaseUrl?: string;
  };
}

export type GetPostsResult = {
  posts: EnhancedPost[];
  warnings?: string[];
};

const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch {
    return await fn();
  }
};

const unifiedStateKey = (args: {
  page?: number;
  limit: number;
  tags: string[];
  blacklistMode: BlacklistMode;
  unified?: UnifiedFetchArgs;
}) =>
  JSON.stringify({
    tags: args.tags,
    limit: args.limit,
    blacklistMode: args.blacklistMode,
    feedSource: args.unified?.feedSource || "search",
    children: (args.unified?.children || []).map((c) => ({
      mode: c.mode,
      baseUrl: c.baseUrl,
      auth: Boolean(c.auth?.api_key),
      userId: c.userId ?? null,
    })),
  });

export class ApiService {
  /** Sticky per-child leftovers for sequential Unified pagination. */
  private unifiedMerge: UnifiedMergeState<EnhancedPost> | null = null;

  /** Drop sticky Unified leftovers (tags / children / feed-source / mode change). */
  async resetUnifiedMerge(): Promise<void> {
    this.unifiedMerge = resetUnifiedMergeState();
  }

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

  private stampUnifiedPosts(
    posts: EnhancedPost[],
    child: UnifiedChildFetchArgs,
    shared: string[][],
    pageNumber: number,
  ): EnhancedPost[] {
    // Origin profile + Unified shared tags (not Unified-only live slice).
    const originAndShared = [...(child.blacklist || []), ...shared];
    return posts.map((post) => ({
      ...post,
      __meta: {
        ...post.__meta,
        originMode: child.mode,
        originBaseUrl: child.baseUrl,
        isBlacklisted:
          post.__meta.isBlacklisted ||
          isPostBlacklisted(post, originAndShared),
        pageNumber,
      },
    }));
  }

  private prepareUnifiedTagsByChild(
    children: UnifiedChildFetchArgs[],
    tags: string[],
  ): { tagsByMode: Map<UnifiedChildMode, string[]>; warnings: string[] } {
    const warnings: string[] = [];
    const tagsByMode = new Map<UnifiedChildMode, string[]>();
    for (const child of children) {
      const prepared = prepareUnifiedChildTags(child.mode, tags);
      tagsByMode.set(child.mode, prepared.tags);
      const warning = formatUnifiedTagWarning(
        unifiedChildLabel(child.mode),
        prepared,
      );
      if (warning) warnings.push(warning);
    }
    return { tagsByMode, warnings };
  }

  /** Legacy: same page index on every child, truncate after merge (no leftovers). */
  private async getUnifiedPostsLegacy(args: {
    page: number;
    limit: number;
    tags: string[];
    blacklist?: string[][];
    blacklistMode: BlacklistMode;
    unified?: UnifiedFetchArgs;
  }): Promise<GetPostsResult> {
    const children = args.unified?.children || [];
    const shared = args.unified?.sharedBlacklist || args.blacklist || [];
    const { tagsByMode, warnings: tagWarnings } = this.prepareUnifiedTagsByChild(
      children,
      args.tags,
    );
    const warnings = [...tagWarnings];
    const groups = await Promise.all(
      children.map(async (child) => {
        try {
          const posts = await withRetry(() =>
            this.getPostsFromBackend({
              page: args.page,
              limit: args.limit,
              tags: tagsByMode.get(child.mode) || [],
              blacklist: child.blacklist,
              blacklistMode: args.blacklistMode,
              auth: child.auth,
              baseUrl: child.baseUrl,
              mode: child.mode,
              userId: child.userId,
            }),
          );
          return this.stampUnifiedPosts(posts, child, shared, args.page);
        } catch (error: unknown) {
          warnings.push(
            `${unifiedChildLabel(child.mode)} skipped: ${error instanceof Error ? error.message : String(error)}`,
          );
          return [] as EnhancedPost[];
        }
      }),
    );
    const { taken } = takeMergedFromBuffers(groups, args.limit);
    const hardFailures = warnings.filter(
      (w) =>
        !/: (dropped|remapped|ignored) /.test(w) &&
        !/; remapped /.test(w),
    );
    if (!taken.length && hardFailures.length === children.length) {
      throw new Error(hardFailures.join(" · "));
    }
    return warnings.length ? { posts: taken, warnings } : { posts: taken };
  }

  private async refillUnifiedChild(
    cursor: NonNullable<typeof this.unifiedMerge>["children"][number],
    child: UnifiedChildFetchArgs,
    args: {
      limit: number;
      tags: string[];
      blacklistMode: BlacklistMode;
    },
    shared: string[][],
    warnings: string[],
  ) {
    if (cursor.exhausted) return;
    try {
      const posts = await withRetry(() =>
        this.getPostsFromBackend({
          page: cursor.nextPage,
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
      cursor.nextPage += 1;
      if (!posts.length) {
        cursor.exhausted = true;
        return;
      }
      // pageNumber stamped later when emitted into a Unified page
      cursor.buffer.push(
        ...this.stampUnifiedPosts(posts, child, shared, cursor.nextPage - 1),
      );
    } catch (error: unknown) {
      // Isolate failure: drop this child's leftovers so stale posts don't linger.
      cursor.exhausted = true;
      cursor.buffer = [];
      warnings.push(
        `${unifiedChildLabel(child.mode)} skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
    const feedSource = args.unified?.feedSource || "search";
    const effectiveTags =
      feedSource === "following" ? ["following:me"] : args.tags;
    if (!children.length) {
      throw new Error(
        feedSource === "following"
          ? "No following-capable sites enabled (Inkbunny, FurAffinity, Itaku, SoFurry)"
          : "No sites enabled for Federated search",
      );
    }

    const key = unifiedStateKey({ ...args, tags: effectiveTags });
    const sequential =
      this.unifiedMerge?.key === key &&
      args.page === this.unifiedMerge.lastEmittedPage + 1;

    if (args.page <= 1 || this.unifiedMerge?.key !== key) {
      this.unifiedMerge = initUnifiedMergeState(
        key,
        children.map((c) => c.mode),
      );
    } else if (!sequential) {
      // Jump / previous page: keep old behavior; seed cursors for later forward scroll.
      const legacy = await this.getUnifiedPostsLegacy({
        ...args,
        tags: effectiveTags,
      });
      this.unifiedMerge = seedUnifiedMergeAfterLegacy(
        key,
        children.map((c) => c.mode),
        args.page,
      );
      return legacy;
    }

    const state = this.unifiedMerge!;
    const { tagsByMode, warnings: tagWarnings } = this.prepareUnifiedTagsByChild(
      children,
      effectiveTags,
    );
    const warnings = args.page <= 1 ? [...tagWarnings] : [];
    if (feedSource === "following" && args.page <= 1) {
      warnings.unshift(
        "Federated Following: merging watch feeds (search tags ignored)",
      );
    }
    const childByMode = new Map(children.map((c) => [c.mode, c]));

    // Fill until we can emit `limit` posts or every child is exhausted.
    let guard = 0;
    while (bufferedCount(state) < args.limit && guard < 20) {
      guard += 1;
      const active = state.children.filter((c) => !c.exhausted);
      if (!active.length) break;
      const empty = active.filter((c) => c.buffer.length === 0);
      const targets = empty.length ? empty : active;
      await Promise.all(
        targets.map((cursor) => {
          const child = childByMode.get(cursor.mode);
          if (!child) {
            cursor.exhausted = true;
            return Promise.resolve();
          }
          return this.refillUnifiedChild(
            cursor,
            child,
            {
              limit: args.limit,
              tags: tagsByMode.get(child.mode) || [],
              blacklistMode: args.blacklistMode,
            },
            shared,
            warnings,
          );
        }),
      );
    }

    const { taken, remaining } = takeMergedFromBuffers(
      state.children.map((c) => c.buffer),
      args.limit,
    );
    state.children.forEach((c, i) => {
      c.buffer = remaining[i] || [];
    });
    const posts = taken.map((post) => ({
      ...post,
      __meta: {
        ...post.__meta,
        pageNumber: args.page,
      },
    }));
    state.lastEmittedPage = args.page;

    const hardFailures = warnings.filter(
      (w) =>
        !/: (dropped|remapped|ignored) /.test(w) &&
        !/; remapped /.test(w) &&
        !w.startsWith("Federated Following:"),
    );
    if (!posts.length && hardFailures.length === children.length) {
      throw new Error(hardFailures.join(" · "));
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
        } catch (error: unknown) {
          warnings.push(
            `${unifiedChildLabel(mode)}: ${error instanceof Error ? error.message : String(error)}`,
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
          } catch (error) {
            // Deleted / never-published: keep a bookmarkable unavailable card
            // (same UX as enrich), instead of dropping the id from Saved Posts.
            if (furaffinity.isFaNotFoundError(error)) {
              const adapted = furaffinity.unavailableSubmissionPost(id);
              return stamp({
                ...adapted,
                score: {
                  ...adapted.score,
                  down: Math.abs(adapted.score.down),
                },
                __meta: {
                  isBlacklisted: false,
                  pageNumber: 1,
                  furaffinity: furaffinity.faUnavailableMeta(),
                },
              });
            }
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

    if (child.mode === "weasyl") {
      const results = await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            const post = await weasyl.fetchSubmission({
              id,
              apiKey: child.auth?.api_key ?? null,
            });
            return stamp({
              ...post,
              __meta: {
                isBlacklisted: isPostBlacklisted(post, child.blacklist),
                pageNumber: 1,
                weasyl: weasyl.weasylMeta(true),
              },
            });
          } catch {
            return null;
          }
        }),
      );
      return results.filter((p): p is EnhancedPost => !!p);
    }

    if (child.mode === "itaku") {
      const results = await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            const post = await itaku.fetchImage({
              id,
              apiKey: child.auth?.api_key ?? null,
            });
            return stamp({
              ...post,
              __meta: {
                isBlacklisted: isPostBlacklisted(post, child.blacklist),
                pageNumber: 1,
                itaku: itaku.itakuMeta(true),
              },
            });
          } catch {
            return null;
          }
        }),
      );
      return results.filter((p): p is EnhancedPost => !!p);
    }

    if (child.mode === "sofurry") {
      if (child.auth?.api_key) {
        sofurry.setActiveSofurryCookies(child.auth.api_key);
      }
      const results = await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            const softId = sofurry.softIdForNumeric(id);
            if (!softId) return null;
            const post = await sofurry.fetchSubmission({ id: softId });
            if (!post) return null;
            return stamp({
              ...post,
              __meta: {
                ...(post as EnhancedPost).__meta,
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
    assertNotDedicatedChrome(args.baseUrl, "getPosts", args.mode);

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
          originMode: originModeStamp(args.mode),
        },
      }));
    }

    if (backend === "inkbunny") {
      const idList = inkbunny.parseSubmissionIdsFromTags(args.tags.filter(Boolean));
      if (idList?.length) {
        const subs = await inkbunny.getSubmissions({
          ids: idList,
          sid: args.auth?.api_key ?? null,
        });
        const byId = new Map(
          subs.map((sub) => [Number(sub.submission_id), sub] as const),
        );
        const sid = args.auth?.api_key ?? null;
        const out: EnhancedPost[] = [];
        for (const id of idList) {
          const sub = byId.get(id);
          if (!sub) continue;
          const adapted = inkbunny.adaptDetails(sub, sid);
          out.push({
            ...adapted,
            __meta: {
              isBlacklisted: isPostBlacklisted(adapted, args.blacklist || []),
              pageNumber: args.page,
              originMode: originModeStamp(args.mode),
              inkbunny: inkbunny.inkbunnyMetaFromHit(sub, sid, true),
            },
          });
        }
        return out;
      }
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
          originMode: originModeStamp(args.mode),
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
          originMode: originModeStamp(args.mode),
          furaffinity: furaffinity.faMetaFrom(result.hits[index] || {}),
        },
      }));
    }

    if (backend === "weasyl") {
      const hideNegations =
        args.blacklistMode === BlacklistMode.hide
          ? (args.blacklist || [])
              .filter((line) => line.length === 1 && line[0] && !line[0].startsWith("~") && !line[0].startsWith("-"))
              .map((line) => `-${line[0]}`)
          : [];
      const result = await weasyl.searchSubmissions({
        tags: [...args.tags.filter(Boolean), ...hideNegations],
        page: args.page,
        limit: args.limit,
        apiKey: args.auth?.api_key ?? null,
        username: args.auth?.login ?? null,
      });
      return result.posts.map<EnhancedPost>((post) => ({
        ...post,
        __meta: {
          isBlacklisted: isPostBlacklisted(post, args.blacklist || []),
          pageNumber: args.page,
          originMode: originModeStamp(args.mode),
          weasyl: weasyl.weasylMeta(false),
        },
      }));
    }

    if (backend === "itaku") {
      const hideNegations =
        args.blacklistMode === BlacklistMode.hide
          ? (args.blacklist || [])
              .filter((line) => line.length === 1 && line[0] && !line[0].startsWith("~") && !line[0].startsWith("-"))
              .map((line) => `-${line[0]}`)
          : [];
      const result = await itaku.searchImages({
        tags: [...args.tags.filter(Boolean), ...hideNegations],
        page: args.page,
        limit: args.limit,
        apiKey: args.auth?.api_key ?? null,
        userId: args.userId ?? null,
      });
      return result.posts.map<EnhancedPost>((post) => ({
        ...post,
        __meta: {
          isBlacklisted: isPostBlacklisted(post, args.blacklist || []),
          pageNumber: args.page,
          originMode: originModeStamp(args.mode),
          itaku: itaku.itakuMeta(false),
        },
      }));
    }

    if (backend === "sofurry") {
      if (args.auth?.api_key) {
        sofurry.setActiveSofurryCookies(args.auth.api_key);
      }
      const tags = args.tags.filter(Boolean);
      const favIdx = tags.findIndex((t) => /^fav(s|orites)?:me$/i.test(t));
      const followingIdx = tags.findIndex((t) =>
        /^(following|watch):me$/i.test(t),
      );
      const userTag = tags.find((t) => /^user:/i.test(t));
      const favorites = favIdx >= 0;
      const user = userTag ? userTag.replace(/^user:/i, "").trim() : undefined;
      const wantsRandom = tags.some((t) => t.toLowerCase() === "order:random");
      const queryTags = tags
        .filter(
          (t) =>
            !/^fav(s|orites)?:me$/i.test(t) &&
            !/^(following|watch):me$/i.test(t) &&
            !/^user:/i.test(t) &&
            !t.toLowerCase().startsWith("order:"),
        )
        .join(" ");
      if (followingIdx >= 0) {
        const result = await sofurry.fetchFeed({
          page: args.page,
          limit: args.limit,
        });
        let feedPosts = result.posts;
        if (wantsRandom) {
          feedPosts = shuffled(feedPosts);
        }
        return feedPosts.map((post: Post): EnhancedPost => ({
          ...post,
          __meta: {
            ...(post as EnhancedPost).__meta,
            isBlacklisted: isPostBlacklisted(post, args.blacklist || []),
            pageNumber: args.page,
            originMode: originModeStamp(args.mode),
          },
        }));
      }
      const result = await sofurry.searchBrowse({
        tags: queryTags,
        page: args.page,
        limit: args.limit,
        user,
        favorites,
      });
      let browsePosts = result.posts;
      if (wantsRandom) {
        browsePosts = shuffled(browsePosts);
      }
      return browsePosts.map((post: Post): EnhancedPost => ({
        ...post,
        __meta: {
          ...(post as EnhancedPost).__meta,
          isBlacklisted: isPostBlacklisted(post, args.blacklist || []),
          pageNumber: args.page,
          originMode: originModeStamp(args.mode),
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
        originMode: originModeStamp(args.mode),
      },
    }));
  }

  async getTags(args: ITagsListArgs) {
    // Federated / Local must not fall through to e621 autocomplete.
    if (args.mode === "unified" || args.mode === "local") {
      return [] as Tag[];
    }
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    assertNotDedicatedChrome(args.baseUrl, "getTags", args.mode);
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
    if (backend === "weasyl") {
      // Weasyl has no public JSON tag autocomplete API
      return [] as Tag[];
    }
    if (backend === "itaku") {
      return itaku.searchTags({
        query: args.query ?? args.name,
        limit: args.limit,
        apiKey: args.auth?.api_key ?? null,
      });
    }
    if (backend === "sofurry") {
      return sofurry.searchTags({
        query: args.query ?? args.name ?? "",
        limit: args.limit,
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
    assertNotDedicatedChrome(args.baseUrl, "getPools", args.mode);
    if (backend === "furbooru") {
      const query = furbooru.mapPoolListQuery({
        query: args.query,
        descriptionMatches: args.descriptionMatches,
        postTagsMatch: args.postTagsMatch,
        creatorName: args.creatorName,
        ids: args.ids,
      });
      // No gallery↔post-tag search; category/active are e621-only.
      if (query == null) return [];
      const result = await withRetry(() =>
        furbooru.searchGalleries({
          query,
          page: args.page ?? 1,
          limit: args.limit,
          apiKey: args.auth?.api_key ?? null,
        }),
      );
      return result.pools;
    }
    // Inkbunny has no pools-list API — name/tags browse stays empty; use getPool(ids).
    if (backend === "inkbunny" || backend === "furaffinity" || backend === "weasyl" || backend === "itaku" || backend === "sofurry") {
      return [];
    }
    // Retry: concurrent e621/e6ai fetches under COEP often throw "Failed to fetch".
    return withRetry(() => e621.pools.list(args));
  }

  async getPool(args: IGetPoolArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    assertNotDedicatedChrome(args.baseUrl, "getPool", args.mode);
    if (backend === "inkbunny") {
      const result = await withRetry(() =>
        inkbunny.getPool({
          id: args.id,
          sid: args.auth?.api_key ?? null,
        }),
      );
      return result.pool;
    }
    if (backend === "furbooru") {
      const result = await withRetry(() =>
        furbooru.getPool({
          id: args.id,
          apiKey: args.auth?.api_key ?? null,
        }),
      );
      return result.pool;
    }
    if (backend === "furaffinity" || backend === "weasyl" || backend === "itaku" || backend === "sofurry") {
      throw new Error("Pools are not supported on this site");
    }
    return withRetry(() => e621.pools.get(args));
  }

  async getComments(args: ICommentsListArgs) {
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    assertNotDedicatedChrome(args.baseUrl, "getComments", args.mode);
    if (backend === "inkbunny" || backend === "weasyl" || backend === "sofurry") {
      return [];
    }
    if (backend === "itaku") {
      return itaku.getComments({
        postId: args.postId,
        limit: args.limit ?? 100,
        apiKey: args.auth?.api_key ?? null,
      });
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
    assertNotDedicatedChrome(args.baseUrl, "getNotes", args.mode);
    // Local / Federated must never fall through to the e621 notes client.
    if (args.mode === "local" || args.mode === "unified") {
      return [];
    }
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "furbooru" || backend === "inkbunny" || backend === "furaffinity" || backend === "weasyl" || backend === "itaku" || backend === "sofurry") {
      return [];
    }
    return e621.notes.list(args);
  }

  async favoritePost(args: IPostFavoriteArgs) {
    assertNotDedicatedChrome(args.baseUrl, "favoritePost", args.mode);
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "inkbunny" || backend === "weasyl") {
      return false;
    }
    if (backend === "itaku") {
      await itaku.favoriteImage({
        postId: args.postId,
        apiKey: args.auth.api_key,
      });
      return true;
    }
    if (backend === "sofurry") {
      if (args.auth?.api_key) sofurry.setActiveSofurryCookies(args.auth.api_key);
      const softId =
        args.softId ||
        sofurry.softIdForNumeric(args.postId) ||
        String(args.postId);
      return sofurry.favoriteSubmission({ id: softId, like: true });
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
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string } }; message?: string } | null;
      const message = e?.response?.data?.message || e?.message;
      if (message && message !== e?.message) {
        throw new Error(message);
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async unfavoritePost(args: IPostFavoriteArgs) {
    assertNotDedicatedChrome(args.baseUrl, "unfavoritePost", args.mode);
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "inkbunny" || backend === "weasyl") {
      return false;
    }
    if (backend === "itaku") {
      await itaku.unfavoriteImage({
        postId: args.postId,
        apiKey: args.auth.api_key,
      });
      return true;
    }
    if (backend === "sofurry") {
      if (args.auth?.api_key) sofurry.setActiveSofurryCookies(args.auth.api_key);
      const softId =
        args.softId ||
        sofurry.softIdForNumeric(args.postId) ||
        String(args.postId);
      return sofurry.favoriteSubmission({ id: softId, like: false });
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
    } catch (error: unknown) {
      const e = error as { response?: { data?: { message?: string } }; message?: string } | null;
      const message = e?.response?.data?.message || e?.message;
      if (message && message !== e?.message) {
        throw new Error(message);
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async votePost(args: IPostVoteArgs) {
    assertNotDedicatedChrome(args.baseUrl, "votePost", args.mode);
    if (args.mode === "local" || args.mode === "unified") {
      return { score: 0, up: 0, down: 0 };
    }
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "inkbunny" || backend === "furaffinity" || backend === "weasyl" || backend === "itaku" || backend === "sofurry") {
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
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message;
      if (message) {
        throw new Error(message);
      }
      throw error;
    }
  }

  async createComment(args: IPostCommentArgs) {
    assertNotDedicatedChrome(args.baseUrl, "createComment", args.mode);
    if (args.mode === "local" || args.mode === "unified") {
      throw new Error("Posting comments is not available in this mode");
    }
    const backend = resolveApiBackend(args.baseUrl, args.mode);
    if (backend === "inkbunny") {
      throw new Error("Inkbunny does not support posting comments via API");
    }
    if (backend === "weasyl") {
      throw new Error("Weasyl does not support posting comments via API");
    }
    if (backend === "itaku") {
      return itaku.createComment({
        postId: args.postId,
        apiKey: args.auth.api_key,
        body: args.body,
      });
    }
    if (backend === "sofurry") {
      throw new Error("SoFurry does not support posting comments via API");
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
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message;
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
  }): Promise<boolean | { username: string; userId: number }> {
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
    if (backend === "weasyl") {
      // Use whoami to validate key — confirms the key is valid for the given login
      const result = await weasyl.whoami(args.apiKey);
      const expectedLogin = args.username.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (expectedLogin && result.login && result.login !== expectedLogin) {
        throw new Error(`Weasyl API key belongs to '${result.login}', not '${args.username}'`);
      }
      return true;
    }
    if (backend === "itaku") {
      return itaku.whoami(args.apiKey);
    }
    if (backend === "sofurry") {
      sofurry.setActiveSofurryCookies(args.apiKey);
      const me = await sofurry.whoami(args.apiKey);
      if (!me?.name) throw new Error("SoFurry session invalid");
      if (
        args.username &&
        me.name.toLowerCase() !== args.username.toLowerCase()
      ) {
        throw new Error(
          `SoFurry session belongs to '${me.name}', not '${args.username}'`,
        );
      }
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

  async loginTailspace(args: { username: string; password: string }) {
    return tailspace.login(args.username, args.password);
  }

  async loginTailspaceCookies(args: { cookies: string }) {
    return tailspace.loginWithCookies(args.cookies);
  }

  async logoutTailspace(args?: { cookies?: string | null }) {
    await tailspace.logoutLocal(args?.cookies);
  }

  async loginSofurry(args: { email: string; password: string }) {
    return sofurry.loginSofurry(args);
  }

  async loginSofurryCookies(args: { cookies: string }) {
    return sofurry.loginSofurryCookies(args);
  }

  async logoutSofurry() {
    sofurry.setActiveSofurryCookies(null);
  }

  async getSofurryFollowing() {
    return sofurry.listFollowing();
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
    const merged = {
      ...post,
      ...adapted,
      file: {
        ...adapted.file,
        width: adapted.file.width || post.file.width,
        height: adapted.file.height || post.file.height,
        size: adapted.file.size || post.file.size,
      },
      preview: {
        ...adapted.preview,
        width: adapted.preview.width || post.preview.width,
        height: adapted.preview.height || post.preview.height,
      },
      sample: {
        ...adapted.sample,
        width: adapted.sample.width || post.sample.width,
        height: adapted.sample.height || post.sample.height,
      },
    };
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

  async enrichSofurryPost(
    post: EnhancedPost,
    args: { cookies?: string | null; blacklist?: string[][] },
  ) {
    if (args.cookies) sofurry.setActiveSofurryCookies(args.cookies);
    const softId =
      post.__meta.sofurry?.id ||
      sofurry.softIdForNumeric(post.id) ||
      post.file?.md5 ||
      null;
    if (!softId) return post;
    const adapted = await sofurry.fetchSubmission({ id: softId });
    if (!adapted) return post;
    const adaptedMeta = (adapted as EnhancedPost).__meta || {};
    const merged = {
      ...post,
      ...adapted,
      file: adapted.file,
      sample: adapted.sample,
      preview: adapted.preview?.url ? adapted.preview : post.preview,
      description: adapted.description || post.description,
      tags: adapted.tags,
      fav_count: adapted.fav_count ?? post.fav_count,
      score: adapted.score || post.score,
      is_favorited: adapted.is_favorited,
    };
    return {
      ...merged,
      __meta: {
        ...post.__meta,
        ...adaptedMeta,
        isBlacklisted: isPostBlacklisted(merged, args.blacklist || []),
        pageNumber: post.__meta.pageNumber,
        originMode: post.__meta.originMode,
        originBaseUrl: post.__meta.originBaseUrl,
        sofurry: {
          ...(adaptedMeta.sofurry || post.__meta.sofurry || {
            id: softId,
            type: "artwork",
            author: "unknown",
          }),
          detailsLoaded: true,
        },
      },
    } satisfies EnhancedPost;
  }

  async enrichItakuPost(
    post: EnhancedPost,
    args: { apiKey?: string | null; blacklist?: string[][] },
  ) {
    const adapted = await itaku.fetchImage({
      id: post.id,
      apiKey: args.apiKey ?? null,
    });
    const merged = {
      ...post,
      ...adapted,
      file: {
        ...adapted.file,
        // Keep any prior probe dims if detail still lacks them.
        width: adapted.file.width || post.file.width,
        height: adapted.file.height || post.file.height,
        size: adapted.file.size || post.file.size,
      },
      sample: adapted.sample,
      preview: adapted.preview?.url ? adapted.preview : post.preview,
      description: adapted.description || post.description,
      tags: adapted.tags,
      fav_count: adapted.fav_count ?? post.fav_count,
      comment_count: adapted.comment_count ?? post.comment_count,
      score: adapted.score || post.score,
      is_favorited: adapted.is_favorited,
    };
    return {
      ...merged,
      __meta: {
        ...post.__meta,
        isBlacklisted: isPostBlacklisted(merged, args.blacklist || []),
        pageNumber: post.__meta.pageNumber,
        originMode: post.__meta.originMode,
        originBaseUrl: post.__meta.originBaseUrl,
        itaku: itaku.itakuMeta(true),
      },
    } satisfies EnhancedPost;
  }

  async enrichWeasylPost(
    post: EnhancedPost,
    args: { apiKey?: string | null; blacklist?: string[][] },
  ) {
    const adapted = await weasyl.fetchSubmission({
      id: post.id,
      apiKey: args.apiKey ?? null,
    });
    const merged = {
      ...post,
      ...adapted,
      file: adapted.file,
      sample: adapted.sample,
      preview: adapted.preview?.url ? adapted.preview : post.preview,
      description: adapted.description || post.description,
      tags: adapted.tags,
      fav_count: adapted.fav_count || post.fav_count,
      comment_count: adapted.comment_count || post.comment_count,
      is_favorited: adapted.is_favorited,
    };
    return {
      ...merged,
      __meta: {
        ...post.__meta,
        isBlacklisted: isPostBlacklisted(merged, args.blacklist || []),
        pageNumber: post.__meta.pageNumber,
        originMode: post.__meta.originMode,
        originBaseUrl: post.__meta.originBaseUrl,
        weasyl: weasyl.weasylMeta(true),
      },
    } satisfies EnhancedPost;
  }
}
