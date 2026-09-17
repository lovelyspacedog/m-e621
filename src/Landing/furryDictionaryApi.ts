/** Client fetch for https://the-furry-dictionary.avoonix.com/definitions.json */

export interface FurryDictionaryEntry {
  slug: string;
  categories: string[];
  preview: {
    text: string;
    all: string;
  };
}

const DICTIONARY_ORIGIN = "https://the-furry-dictionary.avoonix.com";
const DEFINITIONS_URL = `${DICTIONARY_ORIGIN}/definitions.json`;
const CACHE_KEY = "m-e621-furry-dictionary-v1";

export function dictionaryEntryUrl(slug: string): string {
  return `${DICTIONARY_ORIGIN}/${encodeURIComponent(slug)}`;
}

export function dictionaryHomeUrl(): string {
  return `${DICTIONARY_ORIGIN}/`;
}

function readCache(): FurryDictionaryEntry[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as FurryDictionaryEntry[];
  } catch {
    return null;
  }
}

function writeCache(entries: FurryDictionaryEntry[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch {
    // quota / private mode — ignore
  }
}

function normalizeEntries(data: unknown): FurryDictionaryEntry[] {
  if (!Array.isArray(data)) return [];
  const out: FurryDictionaryEntry[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const slug = typeof rec.slug === "string" ? rec.slug.trim() : "";
    if (!slug) continue;
    const previewRaw = rec.preview;
    const preview =
      previewRaw && typeof previewRaw === "object"
        ? (previewRaw as Record<string, unknown>)
        : {};
    const text = typeof preview.text === "string" ? preview.text.trim() : "";
    if (!text) continue;
    const categories = Array.isArray(rec.categories)
      ? rec.categories.filter((c): c is string => typeof c === "string")
      : [];
    out.push({
      slug,
      categories,
      preview: {
        text,
        all: typeof preview.all === "string" ? preview.all : text,
      },
    });
  }
  return out;
}

export async function loadFurryDictionaryEntries(): Promise<FurryDictionaryEntry[]> {
  const cached = readCache();
  if (cached) return cached;

  const res = await fetch(DEFINITIONS_URL, {
    cache: "force-cache",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`dictionary HTTP ${res.status}`);
  const entries = normalizeEntries(await res.json());
  if (!entries.length) throw new Error("dictionary empty");
  writeCache(entries);
  return entries;
}

export function pickRandomEntry(
  entries: FurryDictionaryEntry[],
): FurryDictionaryEntry | null {
  if (!entries.length) return null;
  const i = Math.floor(Math.random() * entries.length);
  return entries[i] ?? null;
}

export async function fetchRandomFurryDictionaryEntry(): Promise<FurryDictionaryEntry | null> {
  const entries = await loadFurryDictionaryEntries();
  return pickRandomEntry(entries);
}
