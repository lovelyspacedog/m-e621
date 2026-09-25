import type { SiteMode } from "@/services/types";

/** Top-level video sites gated behind Settings → Posts → XTRA mode. */
export const XTRA_MODES = ["murrtube", "badpups"] as const;

export type XtraMode = (typeof XTRA_MODES)[number];

export const isXtraMode = (mode: SiteMode | string | null | undefined): mode is XtraMode =>
  mode === "murrtube" || mode === "badpups";

/** XTRA modes appear in the picker only when enabled and SFW only is off. */
export const xtraModesSelectable = (opts: {
  xtraModeEnabled: boolean;
  sfwOnly: boolean;
}): boolean => !!opts.xtraModeEnabled && !opts.sfwOnly;
