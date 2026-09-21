import type { Post } from "@/worker/api";
import type { FavoriteTagsResult, TagCountMap } from "@/misc/util/suggestionScoring";
import { postFeedKey } from "@/misc/util/postOrigin";
import { isPostBlacklisted } from "@/worker/blacklist";

export type RankedTag = { name: string; count: number; category: string };

/** Rank tags in one category (highest count first). */
export const rankCategoryTags = (
  counts: TagCountMap | undefined,
  category: string,
  limit = 50,
): RankedTag[] => {
  const bag = counts?.[category];
  if (!bag) return [];
  return Object.entries(bag)
    .filter(([, c]) => !!c)
    .map(([name, count]) => ({ name, count: count!, category }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
};

/**
 * Prefer the `artist` category; if empty, fall back to top general tags that
 * look like creator names (sites that flatten artists into general).
 */
export const rankFavoriteArtists = (
  counts: TagCountMap,
  limit = 40,
): RankedTag[] => {
  const artists = rankCategoryTags(counts, "artist", limit);
  if (artists.length) return artists;
  return rankCategoryTags(counts, "general", limit);
};

export type TasteDiffRow = {
  tag: string;
  category: string;
  left: number;
  right: number;
  delta: number;
};

export type TasteDiffResult = {
  shared: TasteDiffRow[];
  leftOnly: TasteDiffRow[];
  rightOnly: TasteDiffRow[];
};

/** Compare two favorite-tag profiles for Taste Diff. */
export const diffFavoriteTagCounts = (
  left: FavoriteTagsResult,
  right: FavoriteTagsResult,
  opts?: { hideCategories?: Set<string>; topPerSide?: number },
): TasteDiffResult => {
  const hide = opts?.hideCategories ?? new Set(["meta", "lore", "invalid"]);
  const topPerSide = opts?.topPerSide ?? 40;
  const leftMap = new Map<string, TasteDiffRow>();
  const rightMap = new Map<string, TasteDiffRow>();

  const ingest = (
    counts: TagCountMap,
    target: Map<string, TasteDiffRow>,
    side: "left" | "right",
  ) => {
    for (const [category, tags] of Object.entries(counts)) {
      if (!tags || hide.has(category)) continue;
      const ranked = Object.entries(tags)
        .filter(([, c]) => !!c)
        .map(([name, count]) => ({ name, count: count! }))
        .sort((a, b) => b.count - a.count)
        .slice(0, topPerSide);
      for (const { name, count } of ranked) {
        const key = `${category}\0${name}`;
        const existing = target.get(key) || {
          tag: name,
          category,
          left: 0,
          right: 0,
          delta: 0,
        };
        if (side === "left") existing.left = count;
        else existing.right = count;
        target.set(key, existing);
      }
    }
  };

  ingest(left.counts, leftMap, "left");
  ingest(right.counts, rightMap, "right");

  const shared: TasteDiffRow[] = [];
  const leftOnly: TasteDiffRow[] = [];
  const rightOnly: TasteDiffRow[] = [];

  const keys = new Set([...leftMap.keys(), ...rightMap.keys()]);
  for (const key of keys) {
    const l = leftMap.get(key);
    const r = rightMap.get(key);
    const row: TasteDiffRow = {
      tag: (l || r)!.tag,
      category: (l || r)!.category,
      left: l?.left || 0,
      right: r?.right || 0,
      delta: (l?.left || 0) - (r?.right || 0),
    };
    if (row.left && row.right) shared.push(row);
    else if (row.left) leftOnly.push(row);
    else rightOnly.push(row);
  }

  shared.sort(
    (a, b) =>
      Math.max(b.left, b.right) - Math.max(a.left, a.right) ||
      a.tag.localeCompare(b.tag),
  );
  leftOnly.sort((a, b) => b.left - a.left || a.tag.localeCompare(b.tag));
  rightOnly.sort((a, b) => b.right - a.right || a.tag.localeCompare(b.tag));

  return { shared, leftOnly, rightOnly };
};

/** Flatten browse-history tag arrays into frequency ranks. */
export const rankHistoryTags = (
  entries: string[][],
  limit = 80,
): RankedTag[] => {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const seen = new Set<string>();
    for (const raw of entry) {
      const tag = raw.trim().toLowerCase();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, category: "history" }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
};

const flatBlacklistSingles = (blacklist: string[][]): Set<string> => {
  const out = new Set<string>();
  for (const line of blacklist) {
    if (line.length === 1) {
      const t = line[0]?.trim().toLowerCase();
      if (t && !t.startsWith("-") && !t.includes(":")) out.add(t);
    }
  }
  return out;
};

export type BlacklistSuggestion = {
  tag: string;
  /** How many already-blacklisted sample posts carry this tag. */
  onBlacklisted: number;
  /** How many non-blacklisted sample posts would newly match if this tag alone were added. */
  collateral: number;
  /** Coverage of the blacklisted sample (0–1). */
  coverage: number;
};

/**
 * Suggest single tags to add to the blacklist from a post sample.
 * Prefers tags common on already-blacklisted posts that are not themselves
 * single-tag blacklist lines, and reports collateral hits on the rest.
 */
export const suggestBlacklistTags = (
  posts: Post[],
  blacklist: string[][],
  limit = 25,
): BlacklistSuggestion[] => {
  if (!posts.length) return [];
  const existing = flatBlacklistSingles(blacklist);
  const blacklisted = posts.filter((p) => isPostBlacklisted(p, blacklist));
  const clean = posts.filter((p) => !isPostBlacklisted(p, blacklist));
  if (!blacklisted.length) return [];

  const onBl = new Map<string, number>();
  for (const post of blacklisted) {
    const seen = new Set<string>();
    for (const tags of Object.values(post.tags)) {
      for (const tag of tags) {
        const key = tag.toLowerCase();
        if (existing.has(key) || seen.has(key)) continue;
        seen.add(key);
        onBl.set(key, (onBl.get(key) || 0) + 1);
      }
    }
  }

  const collateral = new Map<string, number>();
  for (const post of clean) {
    const seen = new Set<string>();
    for (const tags of Object.values(post.tags)) {
      for (const tag of tags) {
        const key = tag.toLowerCase();
        if (!onBl.has(key) || existing.has(key) || seen.has(key)) continue;
        seen.add(key);
        collateral.set(key, (collateral.get(key) || 0) + 1);
      }
    }
  }

  return [...onBl.entries()]
    .map(([tag, onBlacklisted]) => ({
      tag,
      onBlacklisted,
      collateral: collateral.get(tag) || 0,
      coverage: onBlacklisted / blacklisted.length,
    }))
    .sort(
      (a, b) =>
        b.onBlacklisted - a.onBlacklisted ||
        a.collateral - b.collateral ||
        a.tag.localeCompare(b.tag),
    )
    .slice(0, limit);
};

/** Preview how many sample posts match if `extraLine` is OR-appended to blacklist. */
export const previewBlacklistHitCount = (
  posts: Post[],
  blacklist: string[][],
  extraLine: string[],
): { hits: number; total: number } => {
  const next = [...blacklist, extraLine];
  let hits = 0;
  for (const post of posts) {
    if (isPostBlacklisted(post, next)) hits += 1;
  }
  return { hits, total: posts.length };
};

export type PostCursorLike = {
  id: number;
  created_at?: string | Date;
  __meta?: { originMode?: string };
};

/** Milliseconds from post `created_at` when parseable. */
export const postCreatedMs = (post: PostCursorLike): number | null => {
  const raw = post.created_at;
  if (raw == null) return null;
  const ms =
    raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Count posts newer than a stored cursor.
 * Cursor stores newest postFeedKey + optional createdMs from the last check.
 */
export const countNewerThanCursor = (
  posts: PostCursorLike[],
  cursor:
    | { newestKey?: string; createdMs?: number }
    | null
    | undefined,
): { newer: number; newestKey: string | null; newestCreatedMs: number | null } => {
  if (!posts.length) {
    return { newer: 0, newestKey: null, newestCreatedMs: null };
  }
  const newest = posts[0]!;
  const newestKey = postFeedKey(newest);
  const newestCreatedMs = postCreatedMs(newest);

  if (!cursor?.newestKey) {
    return {
      newer: posts.length,
      newestKey,
      newestCreatedMs,
    };
  }

  let newer = 0;
  for (const post of posts) {
    const key = postFeedKey(post);
    if (key === cursor.newestKey) break;
    const ms = postCreatedMs(post);
    if (
      cursor.createdMs != null &&
      ms != null &&
      ms <= cursor.createdMs
    ) {
      break;
    }
    newer += 1;
  }
  return { newer, newestKey, newestCreatedMs };
};

export const artistRadarCursorKey = (
  mode: string,
  artist: string,
  origin?: string,
): string => {
  const a = artist.trim().toLowerCase();
  if (origin) return `${mode}:${origin}:${a}`;
  return `${mode}:${a}`;
};

export type SimilarArtistRow = {
  artist: string;
  /** How often this artist co-occurs with the seed artist. */
  withSeed: number;
  /** Posts in the sample that include this artist. */
  sampleCount: number;
};

/**
 * Rank other artists that co-occur with `seedArtist` on the same posts.
 * Pair counting is per-post (unordered).
 */
export const rankSimilarArtists = (
  posts: Post[],
  seedArtist: string,
  limit = 30,
): SimilarArtistRow[] => {
  const seed = seedArtist.trim().toLowerCase();
  if (!seed) return [];
  const withSeed = new Map<string, number>();
  const sampleCount = new Map<string, number>();

  for (const post of posts) {
    const artists = (post.tags?.artist || []).map((a) => a.toLowerCase());
    if (!artists.length) continue;
    for (const a of artists) {
      sampleCount.set(a, (sampleCount.get(a) || 0) + 1);
    }
    if (!artists.includes(seed)) continue;
    const seen = new Set<string>();
    for (const a of artists) {
      if (a === seed || seen.has(a)) continue;
      seen.add(a);
      withSeed.set(a, (withSeed.get(a) || 0) + 1);
    }
  }

  return [...withSeed.entries()]
    .map(([artist, count]) => ({
      artist,
      withSeed: count,
      sampleCount: sampleCount.get(artist) || 0,
    }))
    .sort(
      (a, b) =>
        b.withSeed - a.withSeed ||
        b.sampleCount - a.sampleCount ||
        a.artist.localeCompare(b.artist),
    )
    .slice(0, limit);
};

/** Top seed tags for pool/series search from a favorite profile. */
export const poolSearchSeeds = (
  counts: TagCountMap,
  limit = 8,
): RankedTag[] => {
  const artists = rankCategoryTags(counts, "artist", 4);
  const characters = rankCategoryTags(counts, "character", 3);
  const copyrights = rankCategoryTags(counts, "copyright", 2);
  const merged = [...artists, ...characters, ...copyrights];
  const seen = new Set<string>();
  const out: RankedTag[] = [];
  for (const row of merged) {
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
};

export type TastePackV1 = {
  version: 1;
  exportedAt: number;
  mode?: string;
  username?: string | null;
  sampleSize?: number;
  counts: TagCountMap;
  weights?: Record<string, number>;
  /** Top tags flattened for starred-tag import. */
  topTags?: Array<{ name: string; category: string; count: number }>;
};

export const buildTastePack = (args: {
  mode: string;
  username?: string | null;
  sampleSize: number;
  counts: TagCountMap;
  weights?: Record<string, number>;
  topPerCategory?: number;
}): TastePackV1 => {
  const topPer = args.topPerCategory ?? 12;
  const topTags: TastePackV1["topTags"] = [];
  for (const [category, bag] of Object.entries(args.counts)) {
    if (!bag || category === "meta" || category === "invalid") continue;
    const ranked = Object.entries(bag)
      .filter(([, c]) => !!c)
      .map(([name, count]) => ({ name, category, count: count! }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topPer);
    topTags.push(...ranked);
  }
  topTags.sort((a, b) => b.count - a.count);
  return {
    version: 1,
    exportedAt: Date.now(),
    mode: args.mode,
    username: args.username ?? null,
    sampleSize: args.sampleSize,
    counts: args.counts,
    ...(args.weights ? { weights: args.weights } : {}),
    topTags: topTags.slice(0, 80),
  };
};

export const parseTastePack = (raw: unknown): TastePackV1 => {
  if (!raw || typeof raw !== "object") {
    throw new Error("Taste Pack must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) {
    throw new Error("Unsupported Taste Pack version (need version: 1)");
  }
  if (!o.counts || typeof o.counts !== "object") {
    throw new Error("Taste Pack missing counts");
  }
  return {
    version: 1,
    exportedAt:
      typeof o.exportedAt === "number" && Number.isFinite(o.exportedAt)
        ? o.exportedAt
        : Date.now(),
    mode: typeof o.mode === "string" ? o.mode : undefined,
    username:
      typeof o.username === "string" || o.username === null
        ? (o.username as string | null)
        : null,
    sampleSize:
      typeof o.sampleSize === "number" ? o.sampleSize : undefined,
    counts: o.counts as TagCountMap,
    weights:
      o.weights && typeof o.weights === "object"
        ? (o.weights as Record<string, number>)
        : undefined,
    topTags: Array.isArray(o.topTags)
      ? (o.topTags as TastePackV1["topTags"])
      : undefined,
  };
};

export type ActivityHeatmap = {
  days: Record<string, number>;
  max: number;
};

/** Bucket posts by `created_at` calendar day (favorite/upload activity proxy). */
export const buildPostActivityHeatmap = (
  posts: PostCursorLike[],
): ActivityHeatmap => {
  const days: Record<string, number> = {};
  let max = 0;
  for (const post of posts) {
    const ms = postCreatedMs(post);
    if (ms == null) continue;
    const key = new Date(ms).toISOString().slice(0, 10);
    const next = (days[key] || 0) + 1;
    days[key] = next;
    if (next > max) max = next;
  }
  return { days, max };
};

/**
 * Heuristic cross-post seeds from a post: artist + top characters for
 * same-tag searches on other origins when Fluffle is unavailable.
 */
export const crossPostHeuristicTags = (post: Post, limit = 4): string[] => {
  const artists = post.tags?.artist || [];
  const characters = post.tags?.character || [];
  const out: string[] = [];
  for (const a of artists.slice(0, 2)) {
    if (a && !out.includes(a)) out.push(a);
  }
  for (const c of characters) {
    if (out.length >= limit) break;
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
};
