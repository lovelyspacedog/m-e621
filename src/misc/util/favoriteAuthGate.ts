import type { SiteMode } from "@/services/types";
import { modeSupportsOtherUserFavorites } from "@/misc/util/siteCapabilities";

export const hasFaProfileCookies = (apiKey?: string | null): boolean =>
  !!(apiKey || "").trim();

/** Own-favorites on FurAffinity: profile cookies or known host FA_COOKIE_*. */
export const canSubmitFaOwnFavorites = (args: {
  profileApiKey?: string | null;
  hostCookiesAvailable: boolean;
}): boolean =>
  hasFaProfileCookies(args.profileApiKey) || args.hostCookiesAvailable;

/**
 * Whether the signed-in / host session can load *own* favorites for this mode.
 * Other-user username paths do not use this gate.
 */
export const canLoadOwnFavorites = (args: {
  mode: SiteMode;
  apiKey?: string | null;
  hostFaCookiesAvailable?: boolean;
}): boolean => {
  if (args.mode === "local" || args.mode === "unified") return true;
  if (args.mode === "furaffinity") {
    return canSubmitFaOwnFavorites({
      profileApiKey: args.apiKey,
      hostCookiesAvailable: !!args.hostFaCookiesAvailable,
    });
  }
  return !!(args.apiKey || "").trim();
};

/**
 * Probe existing `/api/furaffinity/me` (no new server routes).
 * True when the proxy reports host env cookies (`cookieSource === "env"`).
 */
export async function probeFaHostCookiesAvailable(): Promise<boolean> {
  try {
    const { me } = await import("@/worker/furaffinity/api");
    const info = await me(null);
    return (
      info.cookieSource === "env" ||
      !!(info as { env?: boolean }).env
    );
  } catch {
    return false;
  }
}

/** UI submit gate for Suggester / Analyzer input pages. */
export const favoriteToolSubmitGate = (args: {
  mode: SiteMode;
  username: string;
  apiKey?: string | null;
  hostFaCookiesAvailable?: boolean;
}): { ok: boolean; message?: string } => {
  const trimmed = (args.username || "").trim();
  const otherUser = modeSupportsOtherUserFavorites(args.mode);

  if (otherUser && trimmed) {
    return { ok: true };
  }

  if (!canLoadOwnFavorites(args)) {
    if (otherUser) {
      return {
        ok: false,
        message:
          args.mode === "furaffinity"
            ? "Enter a username, or sign in with FurAffinity cookies (profile or host FA_COOKIE_*) for your own favorites."
            : "Enter a username, or sign in to load your favorites.",
      };
    }
    return {
      ok: false,
      message: "Sign in for this site to continue.",
    };
  }

  return { ok: true };
};
