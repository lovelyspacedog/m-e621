/**
 * Same-story clustering for the merged News feed.
 * Groups articles with a near-identical title published within a time window.
 */

import type { NewsArticle } from "@/worker/news/parseRss";
import { newsSourceLabel, type NewsSource } from "@/worker/news/ids";

/** Related outlet for a clustered headline. */
export interface NewsRelatedSource {
  id: string;
  source: NewsSource;
  title: string;
  label: string;
}

export interface NewsClusterArticle extends NewsArticle {
  /** Other outlets covering the same story (hidden from the main list). */
  related?: NewsRelatedSource[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeNewsTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(norm: string): Set<string> {
  return new Set(norm.split(" ").filter((t) => t.length > 2));
}

/** Jaccard similarity on title tokens (empty → 0). */
export function titleSimilarity(a: string, b: string): number {
  const sa = tokenSet(normalizeNewsTitle(a));
  const sb = tokenSet(normalizeNewsTitle(b));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

function sameStory(a: NewsArticle, b: NewsArticle): boolean {
  if (a.source === b.source) return false;
  if (!a.publishedMs || !b.publishedMs) return false;
  if (Math.abs(a.publishedMs - b.publishedMs) > DAY_MS) return false;
  const na = normalizeNewsTitle(a.title);
  const nb = normalizeNewsTitle(b.title);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return titleSimilarity(a.title, b.title) >= 0.85;
}

/**
 * Collapse cross-source duplicates. Keeps the newest article as primary and
 * attaches `related` for the other outlets. Order stays date-sorted.
 */
export function clusterNewsArticles(
  articles: NewsArticle[],
): NewsClusterArticle[] {
  const sorted = [...articles].sort((a, b) => b.publishedMs - a.publishedMs);
  const used = new Set<string>();
  const out: NewsClusterArticle[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const primary = sorted[i];
    if (used.has(primary.id)) continue;
    used.add(primary.id);
    const related: NewsRelatedSource[] = [];
    for (let j = i + 1; j < sorted.length; j++) {
      const other = sorted[j];
      if (used.has(other.id)) continue;
      if (!sameStory(primary, other)) continue;
      used.add(other.id);
      related.push({
        id: other.id,
        source: other.source,
        title: other.title,
        label: newsSourceLabel(other.source),
      });
    }
    out.push(related.length ? { ...primary, related } : { ...primary });
  }
  return out;
}
