import type {
  PlaybackMediaKind,
  PlaybackPrefSlice,
  PlaybackPrefs,
  SiteMode,
} from "@/services/types";

export type { PlaybackMediaKind, PlaybackPrefSlice, PlaybackPrefs };

export type ResolvedPlaybackPrefs = {
  volume: number;
  muted: boolean;
  playbackRate: number;
};

const clampVolume = (n: number) => Math.min(1, Math.max(0, n));
const clampRate = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(4, Math.max(0.25, n));
};

export const resolvePlaybackPrefs = (
  global: { volume: number; muted: boolean; playbackRate: number },
  prefs: PlaybackPrefs | undefined | null,
  opts: { kind: PlaybackMediaKind; origin?: SiteMode | null },
): ResolvedPlaybackPrefs => {
  const kindSlice = prefs?.byKind?.[opts.kind];
  const originSlice =
    opts.origin && prefs?.byOrigin
      ? prefs.byOrigin[opts.origin]
      : undefined;
  return {
    volume: clampVolume(
      originSlice?.volume ?? kindSlice?.volume ?? global.volume,
    ),
    muted: originSlice?.muted ?? kindSlice?.muted ?? global.muted,
    playbackRate: clampRate(
      originSlice?.playbackRate ??
        kindSlice?.playbackRate ??
        global.playbackRate ??
        1,
    ),
  };
};

/**
 * Persist user tweak: update byOrigin if that layer exists, else byKind if it exists,
 * else global video* fields. Does not invent new origin keys from the player.
 */
export const applyPlaybackPrefsWriteback = (
  posts: {
    videoVolume: number;
    videoMuted: boolean;
    videoPlaybackRate: number;
    playbackPrefs?: PlaybackPrefs;
  },
  opts: { kind: PlaybackMediaKind; origin?: SiteMode | null },
  next: Partial<ResolvedPlaybackPrefs>,
) => {
  const prefs = posts.playbackPrefs || (posts.playbackPrefs = {});
  const originKey = opts.origin || null;
  if (originKey && prefs.byOrigin?.[originKey]) {
    const slice = prefs.byOrigin[originKey]!;
    if (next.volume !== undefined) slice.volume = clampVolume(next.volume);
    if (next.muted !== undefined) slice.muted = next.muted;
    if (next.playbackRate !== undefined) {
      slice.playbackRate = clampRate(next.playbackRate);
    }
    return;
  }
  if (prefs.byKind?.[opts.kind]) {
    const slice = prefs.byKind[opts.kind]!;
    if (next.volume !== undefined) slice.volume = clampVolume(next.volume);
    if (next.muted !== undefined) slice.muted = next.muted;
    if (next.playbackRate !== undefined) {
      slice.playbackRate = clampRate(next.playbackRate);
    }
    return;
  }
  if (next.volume !== undefined) posts.videoVolume = clampVolume(next.volume);
  if (next.muted !== undefined) posts.videoMuted = next.muted;
  if (next.playbackRate !== undefined) {
    posts.videoPlaybackRate = clampRate(next.playbackRate);
  }
};

export const ensureKindPlaybackPrefs = (
  posts: { playbackPrefs?: PlaybackPrefs },
  kind: PlaybackMediaKind,
  seed: ResolvedPlaybackPrefs,
) => {
  if (!posts.playbackPrefs) posts.playbackPrefs = {};
  if (!posts.playbackPrefs.byKind) posts.playbackPrefs.byKind = {};
  if (!posts.playbackPrefs.byKind[kind]) {
    posts.playbackPrefs.byKind[kind] = {
      volume: seed.volume,
      muted: seed.muted,
      playbackRate: seed.playbackRate,
    };
  }
};

export const clearKindPlaybackPrefs = (
  posts: { playbackPrefs?: PlaybackPrefs },
  kind: PlaybackMediaKind,
) => {
  if (!posts.playbackPrefs?.byKind?.[kind]) return;
  delete posts.playbackPrefs.byKind[kind];
};

export const ensureOriginPlaybackPrefs = (
  posts: { playbackPrefs?: PlaybackPrefs },
  origin: SiteMode,
  seed: ResolvedPlaybackPrefs,
) => {
  if (!posts.playbackPrefs) posts.playbackPrefs = {};
  if (!posts.playbackPrefs.byOrigin) posts.playbackPrefs.byOrigin = {};
  if (!posts.playbackPrefs.byOrigin[origin]) {
    posts.playbackPrefs.byOrigin[origin] = {
      volume: seed.volume,
      muted: seed.muted,
      playbackRate: seed.playbackRate,
    };
  }
};

export const clearOriginPlaybackPrefs = (
  posts: { playbackPrefs?: PlaybackPrefs },
  origin: SiteMode,
) => {
  if (!posts.playbackPrefs?.byOrigin?.[origin]) return;
  delete posts.playbackPrefs.byOrigin[origin];
};
