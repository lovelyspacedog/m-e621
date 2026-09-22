/**
 * Custom News article ids: `custom:<feedId>:<16 hex>`.
 * Built-in outlets keep `source:numericId` via registry parseNewsId.
 */

const CUSTOM_ID_RE = /^custom:(c_[a-z0-9]+):([a-f0-9]{16})$/i;
const FEED_ID_RE = /^c_[a-z0-9]+$/i;

export function isCustomFeedId(raw: unknown): raw is string {
  return typeof raw === "string" && FEED_ID_RE.test(raw.trim());
}

export function makeCustomFeedId(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
  }
  return `c_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Stable 16-hex key from guid (preferred) or link. */
export function customItemKey(guidOrLink: string): string {
  const s = (guidOrLink || "").trim();
  // FNV-1a 64-bit → 16 hex.
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0").slice(-16);
}

export function makeCustomNewsId(feedId: string, itemKey: string): string {
  return `custom:${feedId}:${itemKey.toLowerCase()}`;
}

export function parseCustomNewsId(
  raw: unknown,
): { feedId: string; itemKey: string } | null {
  const s = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  const m = s.match(CUSTOM_ID_RE);
  if (!m) return null;
  return { feedId: m[1].toLowerCase(), itemKey: m[2].toLowerCase() };
}

export function isCustomNewsId(raw: unknown): boolean {
  return parseCustomNewsId(raw) != null;
}

/** Source key stored on NewsArticle for a custom feed. */
export function customNewsSourceKey(feedId: string): string {
  return `custom:${feedId}`;
}

export function parseCustomNewsSourceKey(
  raw: unknown,
): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^custom:(c_[a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : null;
}
