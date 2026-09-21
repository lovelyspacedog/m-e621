/**
 * Curated Flayrah taxonomy RSS feeds (allowlisted on the proxy).
 * `full` is rss-full.xml; others are taxonomy/term/{id}/0/feed.
 * Dogpatch uses the site full feed only (no taxonomy allowlist in v1).
 */

import type { NewsSource } from "./ids";
import { isNewsSource } from "./ids";

export interface FlayrahFeedOption {
  id: string;
  label: string;
  /** Drupal taxonomy term id; null for the full magazine feed. */
  termId: number | null;
}

export const FLAYRAH_FEED_OPTIONS: FlayrahFeedOption[] = [
  { id: "full", label: "All", termId: null },
  { id: "reviews", label: "Reviews", termId: 37 },
  { id: "opinion", label: "Opinion", termId: 36 },
  { id: "media", label: "Media", termId: 41 },
  { id: "conventions", label: "Conventions", termId: 30 },
  { id: "games", label: "Games", termId: 60 },
  { id: "science-fiction", label: "Sci‑fi", termId: 32 },
  { id: "art", label: "Art", termId: 49 },
  { id: "wikifur-news", label: "WikiFur News", termId: 51 },
];

export const FLAYRAH_FEED_IDS = new Set(FLAYRAH_FEED_OPTIONS.map((f) => f.id));

export function normalizeFlayrahFeedId(raw: unknown): string {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return FLAYRAH_FEED_IDS.has(id) ? id : "full";
}

export type NewsSourceFilter = "all" | NewsSource;

export const NEWS_SOURCE_OPTIONS: { id: NewsSourceFilter; label: string }[] = [
  { id: "all", label: "All sources" },
  { id: "flayrah", label: "Flayrah" },
  { id: "dogpatch", label: "Dogpatch" },
];

export function normalizeNewsSourceFilter(raw: unknown): NewsSourceFilter {
  if (raw === "all") return "all";
  if (isNewsSource(raw)) return raw;
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    if (t === "all") return "all";
    if (isNewsSource(t)) return t;
  }
  return "all";
}
