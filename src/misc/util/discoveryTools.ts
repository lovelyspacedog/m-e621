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
