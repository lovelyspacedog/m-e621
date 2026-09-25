import { postFeedKey } from "@/misc/util/postOrigin";
import type { UnifiedChildMode } from "@/services/types";

/** Minimal post shape for Federated duplicate collapse. */
export type DupCollapsePost = {
  id: number;
  created_at?: string | number;
  score?: { total?: number; up?: number; down?: number };
  fav_count?: number;
  file?: {
    md5?: string | null;
    size?: number;
    width?: number;
    height?: number;
  };
  sources?: string[];
  tags?: { artist?: string[]; director?: string[] };
  __meta?: {
    originMode?: string;
    duplicateOrigins?: DuplicateOriginRef[];
    [key: string]: unknown;
  };
};

export type DuplicateOriginRef = {
  originMode: UnifiedChildMode;
  id: number;
  score?: number;
};

const HOST_TO_MODE: Record<string, UnifiedChildMode> = {
  "e621.net": "e621",
  "www.e621.net": "e621",
  "e6ai.net": "e6ai",
  "www.e6ai.net": "e6ai",
  "furbooru.org": "furbooru",
  "www.furbooru.org": "furbooru",
  "inkbunny.net": "inkbunny",
  "www.inkbunny.net": "inkbunny",
  "furaffinity.net": "furaffinity",
  "www.furaffinity.net": "furaffinity",
  "weasyl.com": "weasyl",
  "www.weasyl.com": "weasyl",
  "itaku.ee": "itaku",
  "www.itaku.ee": "itaku",
  "sofurry.com": "sofurry",
  "www.sofurry.com": "sofurry",
};

/** Normalize a source URL for comparison / host parsing. */
export const normalizeSourceUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const u = new URL(withScheme);
    u.hash = "";
    u.search = "";
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.hostname.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
};

/**
 * Parse a known gallery post id from a source URL when the path is unambiguous.
 */
export const parseSourcePostRef = (
  raw: string,
): { mode: UnifiedChildMode; id: number } | null => {
  const norm = normalizeSourceUrl(raw);
  if (!norm) return null;
  const slash = norm.indexOf("/");
  const host = slash >= 0 ? norm.slice(0, slash) : norm;
  const path = slash >= 0 ? norm.slice(slash) : "";
  const mode = HOST_TO_MODE[host];
  if (!mode) return null;

  if (mode === "e621" || mode === "e6ai") {
    const m = path.match(/^\/posts\/(\d+)/);
    if (m) return { mode, id: Number(m[1]) };
  }
  if (mode === "furbooru" || mode === "itaku") {
    const m = path.match(/^\/images\/(\d+)/);
    if (m) return { mode, id: Number(m[1]) };
  }
  if (mode === "inkbunny") {
    const m = path.match(/^\/s\/(\d+)/);
    if (m) return { mode, id: Number(m[1]) };
  }
  if (mode === "furaffinity" || mode === "sofurry") {
    const m = path.match(/^\/view\/(\d+)/);
    if (m) return { mode, id: Number(m[1]) };
  }
  if (mode === "weasyl") {
    const m = path.match(/^\/submission\/(\d+)/);
    if (m) return { mode, id: Number(m[1]) };
  }
  return null;
};

const creatorSet = (post: DupCollapsePost): Set<string> => {
  const out = new Set<string>();
  for (const list of [post.tags?.artist, post.tags?.director]) {
    for (const raw of list || []) {
      const t = String(raw).trim().toLowerCase();
      if (t) out.add(t);
    }
  }
  return out;
};

const creatorsOverlap = (a: DupCollapsePost, b: DupCollapsePost): boolean => {
  const A = creatorSet(a);
  const B = creatorSet(b);
  if (!A.size || !B.size) return false;
  for (const t of A) {
    if (B.has(t)) return true;
  }
  return false;
};

export type MatchKeyKind = "hard" | "fp";

export const duplicateMatchKeys = (
  post: DupCollapsePost,
): { key: string; kind: MatchKeyKind }[] => {
  const keys: { key: string; kind: MatchKeyKind }[] = [];
  const md5 = (post.file?.md5 || "").trim().toLowerCase();
  if (md5 && md5.length >= 16) {
    keys.push({ key: `md5:${md5}`, kind: "hard" });
  }
  for (const src of post.sources || []) {
    const ref = parseSourcePostRef(src);
    if (ref) {
      keys.push({ key: `ref:${ref.mode}:${ref.id}`, kind: "hard" });
    }
    const norm = normalizeSourceUrl(src);
    if (norm && norm.includes("/")) {
      keys.push({ key: `src:${norm}`, kind: "hard" });
    }
  }
  const mode = post.__meta?.originMode;
  if (mode) {
    keys.push({ key: `ref:${mode}:${post.id}`, kind: "hard" });
  }
  const w = post.file?.width || 0;
  const h = post.file?.height || 0;
  const size = post.file?.size || 0;
  if (w > 0 && h > 0 && size > 0) {
    const artists = [...creatorSet(post)].sort().join(",");
    if (artists) {
      keys.push({ key: `fp:${w}x${h}:${size}:${artists}`, kind: "fp" });
    }
  }
  return keys;
};

const scoreOf = (post: DupCollapsePost): number => {
  const total = post.score?.total;
  if (typeof total === "number" && Number.isFinite(total)) return total;
  const fav = post.fav_count;
  if (typeof fav === "number" && Number.isFinite(fav)) return fav;
  return 0;
};

const pickWinner = <T extends DupCollapsePost>(cluster: T[]): T =>
  [...cluster].sort(
    (a, b) =>
      scoreOf(b) - scoreOf(a) ||
      (b.fav_count || 0) - (a.fav_count || 0) ||
      b.id - a.id,
  )[0]!;

/**
 * Collapse cross-origin duplicates in a Federated page.
 * Keeps the highest-score post; attaches losers as `duplicateOrigins`.
 * Returns match keys to suppress on later pages.
 */
export const collapseFederatedDuplicates = <T extends DupCollapsePost>(
  posts: T[],
  alreadySeenKeys?: ReadonlySet<string>,
): { posts: T[]; newKeys: string[] } => {
  if (!posts.length) return { posts, newKeys: [] };

  // Drop posts whose keys were already emitted.
  const filtered = alreadySeenKeys?.size
    ? filterPostsAgainstDupKeys(posts, alreadySeenKeys)
    : posts;
  if (filtered.length === 0) {
    return { posts: filtered, newKeys: [] };
  }
  if (filtered.length === 1) {
    const only = filtered[0]!;
    const newKeys = duplicateMatchKeys(only)
      .filter((k) => k.kind === "hard")
      .map((k) => k.key);
    return { posts: filtered, newKeys: [...new Set(newKeys)] };
  }

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) || x;
    while (parent.get(p) && parent.get(p) !== p) {
      p = parent.get(p)!;
    }
    parent.set(x, p);
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const byFeed = new Map<string, T>();
  for (const post of filtered) {
    const fk = postFeedKey(post);
    byFeed.set(fk, post);
    parent.set(fk, fk);
  }

  const hardBuckets = new Map<string, string[]>();
  const fpBuckets = new Map<string, string[]>();
  for (const post of filtered) {
    const fk = postFeedKey(post);
    for (const { key, kind } of duplicateMatchKeys(post)) {
      const buckets = kind === "hard" ? hardBuckets : fpBuckets;
      const list = buckets.get(key) || [];
      list.push(fk);
      buckets.set(key, list);
    }
  }

  for (const feeds of hardBuckets.values()) {
    for (let i = 1; i < feeds.length; i++) union(feeds[0]!, feeds[i]!);
  }

  for (const feeds of fpBuckets.values()) {
    if (feeds.length < 2) continue;
    for (let i = 0; i < feeds.length; i++) {
      for (let j = i + 1; j < feeds.length; j++) {
        const a = byFeed.get(feeds[i]!);
        const b = byFeed.get(feeds[j]!);
        if (a && b && creatorsOverlap(a, b)) union(feeds[i]!, feeds[j]!);
      }
    }
  }

  const clusters = new Map<string, T[]>();
  for (const post of filtered) {
    const root = find(postFeedKey(post));
    const list = clusters.get(root) || [];
    list.push(post);
    clusters.set(root, list);
  }

  const winners: T[] = [];
  const newKeys: string[] = [];
  const order = new Map(
    filtered.map((p, i) => [postFeedKey(p), i] as const),
  );

  for (const cluster of clusters.values()) {
    if (cluster.length === 1) {
      winners.push(cluster[0]!);
      for (const { key, kind } of duplicateMatchKeys(cluster[0]!)) {
        if (kind === "hard") newKeys.push(key);
      }
      continue;
    }
    const winner = pickWinner(cluster);
    const losers = cluster.filter(
      (p) => postFeedKey(p) !== postFeedKey(winner),
    );
    const dupOrigins: DuplicateOriginRef[] = losers
      .map((p) => {
        const mode = p.__meta?.originMode;
        if (!mode) return null;
        return {
          originMode: mode as UnifiedChildMode,
          id: p.id,
          score: scoreOf(p),
        };
      })
      .filter(Boolean) as DuplicateOriginRef[];

    winners.push({
      ...winner,
      __meta: {
        ...winner.__meta,
        duplicateOrigins: [
          ...(winner.__meta?.duplicateOrigins || []),
          ...dupOrigins,
        ].filter(
          (d, i, arr) =>
            arr.findIndex(
              (x) => x.originMode === d.originMode && x.id === d.id,
            ) === i,
        ),
      },
    } as T);

    for (const p of cluster) {
      for (const { key } of duplicateMatchKeys(p)) {
        newKeys.push(key);
      }
    }
  }

  winners.sort(
    (a, b) =>
      (order.get(postFeedKey(a)) ?? 0) - (order.get(postFeedKey(b)) ?? 0),
  );

  return { posts: winners, newKeys: [...new Set(newKeys)] };
};

/** Drop posts whose match keys were already emitted as a collapsed group. */
export const filterPostsAgainstDupKeys = <T extends DupCollapsePost>(
  posts: T[],
  seenKeys: ReadonlySet<string>,
): T[] => {
  if (!seenKeys.size) return posts;
  return posts.filter((p) => {
    const keys = duplicateMatchKeys(p);
    return !keys.some(({ key }) => seenKeys.has(key));
  });
};
