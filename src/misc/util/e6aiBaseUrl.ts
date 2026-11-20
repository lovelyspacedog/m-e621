import { SITE_MODE_URLS } from "@/services/types";

const E6AI_LEGACY_HOSTS = new Set(["e6ai.net", "www.e6ai.net"]);

/** Default e6ai posts.json host (e6ai.net often does not resolve; e926 is the API mirror). */
export const defaultE6aiApiBaseUrl = (): string => SITE_MODE_URLS.e6ai;

/**
 * Map stored e6ai profile URLs onto a reachable API host.
 * Leaves custom bases alone unless they still point at dead e6ai.net hostnames.
 */
export const normalizeE6aiApiBaseUrl = (
  raw: string | undefined | null,
): string => {
  const fallback = defaultE6aiApiBaseUrl();
  if (!raw || typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    const url = new URL(trimmed);
    if (E6AI_LEGACY_HOSTS.has(url.hostname.toLowerCase())) {
      return fallback;
    }
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  } catch {
    return fallback;
  }
};