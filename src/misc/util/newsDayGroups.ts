import type { NewsArticle } from "@/worker/news/parseRss";

export interface NewsDayGroup<T extends NewsArticle = NewsArticle> {
  key: string;
  label: string;
  articles: T[];
  /** Index of the first article in the flat filtered list (for keyboard focus). */
  startIndex: number;
}

function calendarKey(ms: number): string {
  if (!ms) return "undated";
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "undated";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function newsDayLabel(ms: number, nowMs = Date.now()): string {
  if (!ms) return "Undated";
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "Undated";
  const today = startOfLocalDay(new Date(nowMs));
  const day = startOfLocalDay(d);
  const deltaDays = Math.round((today - day) / 86400000);
  if (deltaDays === 0) return "Today";
  if (deltaDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date(nowMs).getFullYear() ? "numeric" : undefined,
  });
}

/** Group a date-sorted feed into calendar-day sections (newest first preserved). */
export function groupNewsByDay<T extends NewsArticle>(
  articles: T[],
  nowMs = Date.now(),
): NewsDayGroup<T>[] {
  const groups: NewsDayGroup<T>[] = [];
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]!;
    const key = calendarKey(article.publishedMs);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.articles.push(article);
      continue;
    }
    groups.push({
      key,
      label: newsDayLabel(article.publishedMs, nowMs),
      articles: [article],
      startIndex: i,
    });
  }
  return groups;
}
