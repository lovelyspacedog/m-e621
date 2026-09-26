import type { SiteMode, VideoChildMode, VideoSites } from "@/services/types";

/** Child backends under Settings → Posts → Video mode (not Federated children). */
export const VIDEO_CHILD_MODES: VideoChildMode[] = ["murrtube", "badpups"];

export const defaultVideoSites = (): VideoSites => ({
  murrtube: true,
  badpups: true,
});

export const isVideoMode = (mode: SiteMode | string | null | undefined): boolean =>
  mode === "video";

export const isVideoChildMode = (
  mode: SiteMode | string | null | undefined,
): mode is VideoChildMode => mode === "murrtube" || mode === "badpups";

/** Former top-level XTRA modes — migrate activeMode to `video`. */
export const isLegacyXtraMode = (
  mode: SiteMode | string | null | undefined,
): mode is VideoChildMode => isVideoChildMode(mode);

/** Video hub appears in the picker only when enabled and SFW only is off. */
export const videoModeSelectable = (opts: {
  videoModeEnabled: boolean;
  sfwOnly: boolean;
}): boolean => !!opts.videoModeEnabled && !opts.sfwOnly;
