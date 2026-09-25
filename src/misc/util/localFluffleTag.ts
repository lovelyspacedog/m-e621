import type { EnhancedPost } from "@/worker/ApiService";
import {
  flattenPostTagsForSidecar,
  addLocalTags,
} from "@/misc/util/localMedia";
import {
  postSupportsFluffle,
  searchFluffle,
  type FluffleResult,
} from "@/misc/util/fluffleSearch";
import { SITE_MODE_URLS, type SiteMode } from "@/services/types";
import { getApiService } from "@/worker/services";
import { BlacklistMode } from "@/services/types";

export type LocalFluffleTagProgress = {
  index: number;
  total: number;
  path: string;
  status: string;
};

export type LocalFluffleTagResult = {
  tagged: number;
  skipped: number;
  failed: number;
  aborted: boolean;
  errors: { path: string; message: string }[];
};

/** Prefer exact e621 / e6ai hits from a Fluffle result list. */
export const pickE6FluffleHit = (
  results: FluffleResult[],
): { mode: "e621" | "e6ai"; id: number } | null => {
  for (const r of results) {
    if (r.match !== "exact" && r.match !== "probable") continue;
    const fromUrl = e6IdFromUrl(r.url);
    if (fromUrl) return fromUrl;
    const platform = (r.platform || "").toLowerCase();
    if (
      (platform === "e621" || platform === "e6ai") &&
      /^\d+$/.test(String(r.id))
    ) {
      return { mode: platform === "e6ai" ? "e6ai" : "e621", id: Number(r.id) };
    }
  }
  return null;
};

export const e6IdFromUrl = (
  url: string | null | undefined,
): { mode: "e621" | "e6ai"; id: number } | null => {
  if (!url) return null;
  const m = String(url).match(
    /https?:\/\/(?:www\.)?(e621|e6ai)\.net\/posts\/(\d+)/i,
  );
  if (!m) return null;
  return {
    mode: m[1]!.toLowerCase() === "e6ai" ? "e6ai" : "e621",
    id: Number(m[2]),
  };
};

/** Artist tags from Fluffle authors when no e6 hit exists. */
export const artistTagsFromFluffle = (results: FluffleResult[]): string[] => {
  const names = new Set<string>();
  for (const r of results) {
    if (r.match === "unlikely") continue;
    for (const a of r.authors || []) {
      const name = (a.name || "").trim().toLowerCase().replace(/\s+/g, "_");
      if (name) names.add(`artist:${name}`);
    }
  }
  return [...names];
};

const isUntaggedLocalStill = (post: EnhancedPost): boolean => {
  if (post.__meta?.originMode !== "local") return false;
  if (!postSupportsFluffle(post)) return false;
  const extras = post.__meta?.localExtraTags || [];
  return extras.length === 0;
};

/**
 * For each untagged Local still in `posts`, Fluffle exact-search and write
 * tags into `.me621-tags.json` (e621/e6ai tags when an exact hit exists,
 * otherwise artist: tags from Fluffle authors).
 */
export const tagUntaggedLocalViaFluffle = async (opts: {
  posts: EnhancedPost[];
  signal?: AbortSignal;
  onProgress?: (p: LocalFluffleTagProgress) => void;
  /** Cap how many files we attempt in one run. */
  limit?: number;
}): Promise<LocalFluffleTagResult> => {
  const targets = opts.posts
    .filter(isUntaggedLocalStill)
    .slice(0, opts.limit ?? 40);
  const result: LocalFluffleTagResult = {
    tagged: 0,
    skipped: 0,
    failed: 0,
    aborted: false,
    errors: [],
  };
  if (!targets.length) return result;

  const api = await getApiService();

  for (let i = 0; i < targets.length; i++) {
    if (opts.signal?.aborted) {
      result.aborted = true;
      break;
    }
    const post = targets[i]!;
    const path = post.__meta?.localPath || post.description || `#${post.id}`;
    opts.onProgress?.({
      index: i + 1,
      total: targets.length,
      path,
      status: "searching…",
    });
    try {
      const hits = await searchFluffle(post, 8);
      let tags: string[] = [];
      const e6 = pickE6FluffleHit(hits);
      if (e6) {
        opts.onProgress?.({
          index: i + 1,
          total: targets.length,
          path,
          status: `fetching ${e6.mode} #${e6.id}…`,
        });
        const { posts } = await api.getPosts({
          blacklistMode: BlacklistMode.blur,
          blacklist: [],
          limit: 1,
          tags: [`id:${e6.id}`],
          baseUrl: SITE_MODE_URLS[e6.mode as SiteMode],
          mode: e6.mode,
          page: 1,
          auth: undefined,
          sfwOnly: false,
        });
        tags = flattenPostTagsForSidecar(posts[0]);
      }
      if (!tags.length) {
        tags = artistTagsFromFluffle(hits);
      }
      if (!tags.length) {
        result.skipped += 1;
        continue;
      }
      const relativePath = post.__meta?.localPath;
      const folderKey = post.__meta?.localFolderKey;
      if (!relativePath) {
        result.failed += 1;
        result.errors.push({ path, message: "Missing local path" });
        continue;
      }
      await addLocalTags(relativePath, tags.join(" "), folderKey);
      // Keep in-memory post searchable until next Local reload.
      post.__meta.localExtraTags = [
        ...new Set([...(post.__meta.localExtraTags || []), ...tags]),
      ];
      result.tagged += 1;
    } catch (err: unknown) {
      result.failed += 1;
      result.errors.push({
        path,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
};
