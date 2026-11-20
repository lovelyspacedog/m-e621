import type { Flags, Post, PostTags, Score } from "./returnTypes";

const emptyPostTags = (): PostTags => ({
  general: [],
  species: [],
  character: [],
  copyright: [],
  artist: [],
  invalid: [],
  lore: [],
  meta: [],
});

const pickImageUrl = (node?: Record<string, unknown>) => {
  if (!node) return "";
  const url = node.url ?? node.jpg ?? node.webp;
  return typeof url === "string" ? url : "";
};

const num = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Material-era posts.json rows already match our {@link Post} shape. */
export const isLegacyE621Post = (raw: unknown): raw is Post => {
  if (!raw || typeof raw !== "object") return false;
  const row = raw as Record<string, unknown>;
  return (
    !!row.file &&
    typeof row.file === "object" &&
    !!row.score &&
    typeof row.score === "object"
  );
};

/**
 * Map e621's newer posts.json row (files/stats/flat tags) into Material {@link Post}.
 * Legacy rows pass through unchanged.
 */
export const adaptE621ApiPost = (raw: unknown): Post => {
  if (isLegacyE621Post(raw)) return raw;

  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const files = (row.files && typeof row.files === "object"
    ? row.files
    : {}) as Record<string, unknown>;
  const meta = (files.meta && typeof files.meta === "object"
    ? files.meta
    : {}) as Record<string, unknown>;
  const original = (files.original && typeof files.original === "object"
    ? files.original
    : {}) as Record<string, unknown>;
  const previewRaw = (files.preview && typeof files.preview === "object"
    ? files.preview
    : {}) as Record<string, unknown>;
  const sampleRaw = (files.sample && typeof files.sample === "object"
    ? files.sample
    : {}) as Record<string, unknown>;
  const stats = (row.stats && typeof row.stats === "object"
    ? row.stats
    : {}) as Record<string, unknown>;
  const scoreRaw = (stats.score && typeof stats.score === "object"
    ? stats.score
    : { up: 0, down: 0, total: 0 }) as Score;
  const rel = (row.relationships && typeof row.relationships === "object"
    ? row.relationships
    : {}) as Record<string, unknown>;
  const has = (row.has && typeof row.has === "object"
    ? row.has
    : {}) as Record<string, unknown>;

  const flatTags = Array.isArray(row.tags)
    ? (row.tags as string[]).map(String)
    : null;
  const tags: PostTags =
    flatTags != null
      ? { ...emptyPostTags(), general: flatTags }
      : ((row.tags as PostTags | undefined) ?? emptyPostTags());

  const flags = (row.flags as Flags | undefined) ?? {
    pending: false,
    flagged: false,
    note_locked: false,
    status_locked: false,
    rating_locked: false,
    deleted: false,
  };

  return {
    id: num(row.id),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    change_seq: num(row.change_seq),
    file: {
      width: num(original.width),
      height: num(original.height),
      ext: String(meta.ext ?? ""),
      size: num(meta.size),
      md5: String(meta.md5 ?? ""),
      url: (original.url as string | null | undefined) ?? null,
    },
    preview: {
      width: num(previewRaw.width),
      height: num(previewRaw.height),
      url: pickImageUrl(previewRaw),
    },
    sample: {
      has: Boolean(meta.has_sample ?? pickImageUrl(sampleRaw)),
      width: num(sampleRaw.width),
      height: num(sampleRaw.height),
      url: pickImageUrl(sampleRaw),
    },
    score: {
      up: num(scoreRaw.up),
      down: Math.abs(num(scoreRaw.down)),
      total: num(scoreRaw.total),
    },
    tags,
    locked_tags: Array.isArray(row.locked_tags)
      ? (row.locked_tags as string[]).map(String)
      : [],
    flags,
    rating: (row.rating as Post["rating"]) ?? "q",
    fav_count: num(stats.fav_count ?? row.fav_count),
    sources: Array.isArray(row.sources) ? (row.sources as string[]).map(String) : [],
    pools: Array.isArray(row.pools)
      ? (row.pools as unknown[]).map((id) => num(id)).filter((id) => id > 0)
      : [],
    relationships: {
      parent_id: rel.parent_id != null ? num(rel.parent_id) : undefined,
      has_children: Boolean(has.children ?? rel.has_children),
      has_active_children: Boolean(has.active_children ?? rel.has_active_children),
      children: Array.isArray(rel.children)
        ? (rel.children as unknown[]).map((id) => num(id)).filter((id) => id > 0)
        : [],
    },
    approver_id: row.approver_id != null ? num(row.approver_id) : undefined,
    uploader_id: num(row.uploader_id),
    uploader_name:
      typeof row.uploader_name === "string" ? row.uploader_name : undefined,
    description: String(row.description ?? ""),
    comment_count: num(stats.comment_count ?? row.comment_count),
    is_favorited: Boolean(stats.is_favorited ?? row.is_favorited),
    has_notes: Boolean(has.notes ?? row.has_notes),
    duration:
      typeof meta.duration === "number" && Number.isFinite(meta.duration)
        ? meta.duration
        : null,
  };
};