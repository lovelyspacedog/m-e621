import { describe, expect, it } from "vitest";
import {
  applyPlaybackPrefsWriteback,
  resolvePlaybackPrefs,
} from "./playbackPrefs";

describe("resolvePlaybackPrefs", () => {
  const global = { volume: 0.5, muted: true, playbackRate: 1 };

  it("falls back to global", () => {
    expect(resolvePlaybackPrefs(global, undefined, { kind: "video" })).toEqual(
      global,
    );
  });

  it("prefers origin over kind over global", () => {
    const prefs = {
      byKind: { audio: { volume: 0.8, muted: false, playbackRate: 1.25 } },
      byOrigin: {
        furaffinity: { volume: 0.2, muted: true },
      },
    };
    expect(
      resolvePlaybackPrefs(global, prefs, {
        kind: "audio",
        origin: "furaffinity",
      }),
    ).toEqual({ volume: 0.2, muted: true, playbackRate: 1.25 });
    expect(
      resolvePlaybackPrefs(global, prefs, { kind: "audio", origin: "e621" }),
    ).toEqual({ volume: 0.8, muted: false, playbackRate: 1.25 });
  });
});

describe("applyPlaybackPrefsWriteback", () => {
  it("writes kind slice when present, else global", () => {
    const posts = {
      videoVolume: 1,
      videoMuted: true,
      videoPlaybackRate: 1,
      playbackPrefs: {
        byKind: { audio: { volume: 0.5, muted: false, playbackRate: 1 } },
      },
    };
    applyPlaybackPrefsWriteback(
      posts,
      { kind: "audio" },
      { volume: 0.3, muted: true },
    );
    expect(posts.playbackPrefs.byKind!.audio).toEqual({
      volume: 0.3,
      muted: true,
      playbackRate: 1,
    });
    expect(posts.videoVolume).toBe(1);

    applyPlaybackPrefsWriteback(
      posts,
      { kind: "video" },
      { volume: 0.9, muted: false },
    );
    expect(posts.videoVolume).toBe(0.9);
    expect(posts.videoMuted).toBe(false);
  });
});
