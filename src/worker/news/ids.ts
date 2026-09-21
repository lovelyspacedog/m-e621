/** Namespaced news article ids: `flayrah:123` / `dogpatch:456`. */

export type NewsSource = "flayrah" | "dogpatch";

export const NEWS_SOURCES: NewsSource[] = ["flayrah", "dogpatch"];

export function isNewsSource(raw: unknown): raw is NewsSource {
  return raw === "flayrah" || raw === "dogpatch";
}

export function makeNewsId(source: NewsSource, numericId: number): string {
  return `${source}:${numericId}`;
}

export function parseNewsId(
  raw: unknown,
): { source: NewsSource; numericId: number } | null {
  const s = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  const m = s.match(/^(flayrah|dogpatch):(\d+)$/i);
  if (!m) return null;
  const numericId = parseInt(m[2], 10);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;
  return { source: m[1].toLowerCase() as NewsSource, numericId };
}

/** Migrate legacy numeric Flayrah ids → `flayrah:N`. */
export function migrateLegacyNewsId(raw: unknown): string | null {
  if (typeof raw === "string") {
    const parsed = parseNewsId(raw);
    if (parsed) return makeNewsId(parsed.source, parsed.numericId);
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0 && String(n) === raw.trim()) {
      return makeNewsId("flayrah", n);
    }
    return null;
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return makeNewsId("flayrah", Math.floor(raw));
  }
  return null;
}

export function newsSourceLabel(source: NewsSource): string {
  return source === "dogpatch" ? "Dogpatch Press" : "Flayrah";
}

export function newsSourceHomeUrl(source: NewsSource): string {
  return source === "dogpatch"
    ? "https://dogpatch.press/"
    : "https://www.flayrah.com/";
}
